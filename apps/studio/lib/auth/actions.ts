'use server';

import { createUser, findUserByEmail } from '../server/store';
import { hashPassword, verifyPassword } from '../server/password';
import { clearSessionCookie, setSessionCookie } from '../server/session';

export interface AuthState {
  error?: string;
  ok?: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function signupAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (!EMAIL_RE.test(email)) return { error: 'Enter a valid email address.' };
  if (password.length < 8) return { error: 'Password must be at least 8 characters.' };
  if (password !== confirm) return { error: 'Passwords do not match.' };

  if (findUserByEmail(email)) return { error: 'That email is already registered — try signing in.' };

  try {
    const { hash, salt } = hashPassword(password);
    const user = await createUser({ email, name, passwordHash: hash, salt });
    await setSessionCookie(user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not create the account.' };
  }
  return { ok: true };
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) return { error: 'Enter your email and password.' };

  const user = findUserByEmail(email);
  // Always run a verify to keep timing consistent whether or not the user exists.
  const ok = user ? verifyPassword(password, user.passwordHash, user.salt) : verifyPassword(password, '00', 'ff');
  if (!user || !ok) return { error: 'Incorrect email or password.' };

  await setSessionCookie(user.id);
  return { ok: true };
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
}
