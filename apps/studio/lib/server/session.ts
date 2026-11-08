import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { UserDTO } from '../records';
import { ensureReady, getSecret } from './db';
import { signJwt, verifyJwt } from './jwt';
import { findUserById, type User } from './store';

const COOKIE = 'cn_session';
const MAX_AGE_S = 60 * 60 * 24 * 30;

export async function setSessionCookie(userId: string): Promise<void> {
  await ensureReady();
  const store = await cookies();
  store.set(COOKIE, signJwt(userId, getSecret(), MAX_AGE_S), {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_S,
    secure: process.env['STUDIO_SECURE_COOKIE'] === '1',
  });
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
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

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
}
