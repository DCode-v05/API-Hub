import { AppShell } from '@/components/app/AppShell';
import { requireUser, toDTO } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side gate: no valid session → redirect to /login (handled inside requireUser).
  const user = await requireUser();
  return <AppShell user={toDTO(user)}>{children}</AppShell>;
}
