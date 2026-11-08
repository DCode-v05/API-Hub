import { AppShell } from '@/components/app/AppShell';
import { requireUser, toDTO } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return <AppShell user={toDTO(user)}>{children}</AppShell>;
}
