import type { Metadata } from 'next';
// General UI: Mona Sans. Code / IR / monospace: Monaspace Neon (its monospace sibling).
import '@fontsource/mona-sans/400.css';
import '@fontsource/mona-sans/500.css';
import '@fontsource/mona-sans/600.css';
import '@fontsource/mona-sans/700.css';
import '@fontsource/monaspace-neon/400.css';
import '@fontsource/monaspace-neon/500.css';
import '@fontsource/monaspace-neon/700.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Connector Network · Studio',
  description:
    'Turn any API source — GitHub, OpenAPI, an SDK, or an MCP server — into an SDK, an MCP server, a CLI, and docs. Watch it happen.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
