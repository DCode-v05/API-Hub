import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  // Already signed in? Skip the auth pages.
  if (await getCurrentUser()) redirect('/');

  return (
    <div className="relative flex min-h-screen items-center justify-center px-5 py-12">
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-60 [mask-image:radial-gradient(ellipse_at_center,black,transparent_75%)]" />
      <div className="relative z-10 flex w-full justify-center">{children}</div>
    </div>
  );
}
