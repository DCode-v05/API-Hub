import { gzipSync } from 'node:zlib';

/**
 * Build a gzipped tar (.tgz) from in-memory files, npm-pack style (everything under `prefix/`, which
 * npm requires). Dependency-free USTAR writer. File names are assumed < 100 bytes (the CLI surface is
 * a handful of flat files) — longer names would need the USTAR prefix field, not implemented here.
 */
export function makeTarball(files: { path: string; content: string }[], prefix = 'package'): Buffer {
  const blocks: Buffer[] = [];
  for (const f of files) {
    const data = Buffer.from(f.content, 'utf8');
    blocks.push(tarHeader(`${prefix}/${f.path}`, data.length), pad512(data));
  }
  blocks.push(Buffer.alloc(1024)); // two zero blocks end the archive
  return gzipSync(Buffer.concat(blocks));
}

function pad512(data: Buffer): Buffer {
  const rem = data.length % 512;
  return rem === 0 ? data : Buffer.concat([data, Buffer.alloc(512 - rem)]);
}

function tarHeader(name: string, size: number): Buffer {
  const h = Buffer.alloc(512);
  h.write(name.slice(0, 100), 0, 'utf8'); // name        [0,100)
  h.write('0000644\0', 100, 'ascii'); //     mode        [100,108)
  h.write('0000000\0', 108, 'ascii'); //     uid         [108,116)
  h.write('0000000\0', 116, 'ascii'); //     gid         [116,124)
  h.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii'); // size  [124,136)
  h.write('00000000000\0', 136, 'ascii'); // mtime (0, deterministic) [136,148)
  h.write('        ', 148, 8, 'ascii'); //   checksum placeholder (8 spaces) [148,156)
  h.write('0', 156, 'ascii'); //             typeflag '0' = regular file
  h.write('ustar\0', 257, 'ascii'); //       magic
  h.write('00', 263, 'ascii'); //            version
  let sum = 0;
  for (let i = 0; i < 512; i += 1) sum += h[i]!;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii'); // real checksum: 6 octal + NUL + space
  return h;
}
