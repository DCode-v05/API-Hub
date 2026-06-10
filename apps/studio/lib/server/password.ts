import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

// Password hashing with Node's built-in scrypt — no native module, no external dependency, so it
// builds and runs cleanly on Windows. scrypt is deliberately slow/memory-hard; for a self-hosted
// single-tenant tool the synchronous variant is fine (logins are infrequent).

const KEYLEN = 64;

export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, KEYLEN).toString('hex');
  return { hash, salt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, KEYLEN);
  // Length check guards timingSafeEqual (it throws on length mismatch) and a malformed stored hash.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
