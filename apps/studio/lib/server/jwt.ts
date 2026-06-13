import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Minimal, dependency-free JSON Web Token (HS256) — matches the project's built-ins-only ethos.
 * Standard `header.payload.signature` (base64url). Security notes: the algorithm is PINNED to HS256
 * on verify (rejects `alg:none` / algorithm-confusion), the signature is compared in constant time,
 * and the `exp` claim is enforced. Signed with the instance secret (see db.ts getSecret()).
 */

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function hmac(data: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

/** Issue a JWT for `sub`, valid for `ttlSeconds`. */
export function signJwt(sub: string, secret: Buffer, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub, iat: now, exp: now + ttlSeconds };
  const body = `${HEADER_B64}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${hmac(body, secret)}`;
}

/** Verify a JWT and return its `sub`, or null if malformed / wrong alg / bad signature / expired. */
export function verifyJwt(token: string, secret: Buffer): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];

  // Pin the algorithm — never trust the token's own header to pick the verifier.
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8')) as { alg?: string };
    if (header.alg !== 'HS256') return null;
  } catch {
    return null;
  }

  const expected = hmac(`${h}.${p}`, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as JwtPayload;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
