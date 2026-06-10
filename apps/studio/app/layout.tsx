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
  title: { default: 'Connector Network · Studio', template: '%s · Connector Network' },
  description:
    'Turn any API source — GitHub, OpenAPI, an SDK, or an MCP server — into an SDK, an MCP server, a CLI, and docs. Watch it happen.',
};

// Set the theme class before first paint so there's no light→dark flash on load.
const THEME_SCRIPT = `(function(){try{var s=localStorage.getItem('cn-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">{children}</body>
    </html>
  );
}
