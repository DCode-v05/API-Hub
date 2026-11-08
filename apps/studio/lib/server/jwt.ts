import { createHmac, timingSafeEqual } from 'node:crypto';

interface JwtPayload {
  sub: string;
  iat: number;
  exp: number;
}

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function hmac(data: string, secret: Buffer): string {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signJwt(sub: string, secret: Buffer, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: JwtPayload = { sub, iat: now, exp: now + ttlSeconds };
  const body = `${HEADER_B64}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
  return `${body}.${hmac(body, secret)}`;
}

export function verifyJwt(token: string, secret: Buffer): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];

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
