import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { UserDTO } from '../records';
import { ensureReady, getSecret } from './db';
import { signJwt, verifyJwt } from './jwt';
import { findUserById, type User } from './store';

// Stateless JWT sessions (HS256): the cookie carries a standard JWT (header.payload.signature) signed
// with the instance secret — verification is a constant-time HMAC check + `exp` claim, no session
// table. The secret lives in the DB (app_meta) unless STUDIO_SECRET is set; rotate it to log everyone
// out. Implementation in ./jwt.ts (algorithm pinned to HS256 on verify).

const COOKIE = 'cn_session';
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

export async function setSessionCookie(userId: string): Promise<void> {
  await ensureReady(); // the signing secret must be loaded before issuing the JWT
  const store = await cookies();
  store.set(COOKIE, signJwt(userId, getSecret(), MAX_AGE_S), {
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
  const userId = verifyJwt(token, getSecret());
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
