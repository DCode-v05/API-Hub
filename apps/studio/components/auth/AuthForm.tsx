'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Loader2, Workflow } from 'lucide-react';
import { loginAction, signupAction, type AuthState } from '@/lib/auth/actions';
import { Button, Field, Input } from '@/components/ui';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const action = mode === 'login' ? loginAction : signupAction;
  const [state, formAction, pending] = React.useActionState<AuthState, FormData>(action, {});

  // On success the server action has already set the session cookie. A hard navigation guarantees
  // the gated app layout re-runs server-side with the fresh cookie.
  React.useEffect(() => {
    if (state.ok) window.location.href = '/';
  }, [state.ok]);

  const isSignup = mode === 'signup';

  return (
    <div className="w-full max-w-sm">
      <div className="mb-7 flex flex-col items-center text-center">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-foreground text-background">
          <Workflow className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {isSignup ? 'Start turning API sources into surfaces.' : 'Sign in to the Connector Network Studio.'}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {isSignup ? (
          <Field label="Name" hint="optional">
            <Input name="name" autoComplete="name" placeholder="Ada Lovelace" />
          </Field>
        ) : null}

        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </Field>

        <Field label="Password" hint={isSignup ? 'min. 8 characters' : undefined}>
          <Input
            name="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            placeholder="••••••••"
          />
        </Field>

        {isSignup ? (
          <Field label="Confirm password">
            <Input name="confirm" type="password" autoComplete="new-password" required placeholder="••••••••" />
          </Field>
        ) : null}

        {state.error ? (
          <p className="flex items-start gap-1.5 rounded-md border border-danger/25 bg-danger/10 px-3 py-2 text-xs text-danger">
            <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
            {state.error}
          </p>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending || state.ok}>
          {pending || state.ok ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isSignup ? 'Creating account…' : 'Signing in…'}
            </>
          ) : (
            <>
              {isSignup ? 'Create account' : 'Sign in'}
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
        <Link href={isSignup ? '/login' : '/signup'} className="font-medium text-foreground underline-offset-4 hover:underline">
          {isSignup ? 'Sign in' : 'Create one'}
        </Link>
      </p>
    </div>
  );
}
