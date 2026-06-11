import { createHmac, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { UserDTO } from '../records';
import { ensureReady, getSecret } from './db';
import { findUserById, type User } from './store';

// Stateless sessions: the cookie carries `userId.expiry` plus an HMAC signature over the secret.
// No server-side session table to keep — verifying is a constant-time signature check. The secret
// lives in the DB (app_meta) unless STUDIO_SECRET is set; rotate it to log everyone out.

const COOKIE = 'cn_session';
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

function sign(payload: string): string {
  return createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function makeToken(userId: string): string {
  const expiry = Date.now() + MAX_AGE_S * 1000;
  const payload = `${userId}.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string): string | null {
  const idx = token.lastIndexOf('.');
  if (idx < 0) return null;
  const payload = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [userId, expiryRaw] = payload.split('.');
  if (!userId || !expiryRaw) return null;
  if (Number(expiryRaw) < Date.now()) return null;
  return userId;
}

export async function setSessionCookie(userId: string): Promise<void> {
  await ensureReady(); // the signing secret must be loaded before makeToken()
  const store = await cookies();
  store.set(COOKIE, makeToken(userId), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_S,
    // Self-hosted instances are commonly reached over plain http on localhost, so don't force
    // Secure (which would make the cookie silently fail there). Set STUDIO_SECURE_COOKIE=1 behind TLS.
    secure: process.env['STUDIO_SECURE_COOKIE'] === '1',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  // No cookie → no DB work (keeps /login and logged-out requests off the database).
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  await ensureReady();
  const userId = readToken(token);
  if (!userId) return null;
  return (await findUserById(userId)) ?? null;
}

export function toDTO(user: User): UserDTO {
  return { id: user.id, email: user.email, name: user.name };
}

/** For server components/layouts: redirect to /login when there's no valid session. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
