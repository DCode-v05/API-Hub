import { FileJson, FolderGit2, Github, History, Home, Package, Plug } from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Short description used on the home page cards. */
  blurb?: string;
  /** Trust the produced artifact carries (input types only). */
  trust?: 'declared' | 'inferred';
  group: 'main' | 'inputs' | 'tools';
}

export const NAV: NavItem[] = [
  { href: '/', label: 'Home', Icon: Home, group: 'main' },
  {
    href: '/projects',
    label: 'Projects',
    Icon: FolderGit2,
    group: 'main',
    blurb: 'Version-controlled sources that regenerate their surfaces whenever the input changes.',
  },
  {
    href: '/github',
    label: 'GitHub',
    Icon: Github,
    group: 'inputs',
    trust: 'declared',
    blurb: 'Clone a repo with a PAT, pin the commit, and find its OpenAPI spec.',
  },
  {
    href: '/openapi',
    label: 'OpenAPI',
    Icon: FileJson,
    group: 'inputs',
    trust: 'declared',
    blurb: 'Point at a spec by URL, paste, upload, or local path. 3.0 / 3.1 / Swagger 2.0.',
  },
  {
    href: '/sdk',
    label: 'SDK',
    Icon: Package,
    group: 'inputs',
    trust: 'inferred',
    blurb: 'Reverse-derive an API from an existing TypeScript or Python client.',
  },
  {
    href: '/mcp',
    label: 'MCP',
    Icon: Plug,
    group: 'inputs',
    trust: 'inferred',
    blurb: 'Read an MCP server’s advertised tools — manifest, URL, or a live stdio command.',
  },
  {
    href: '/history',
    label: 'History',
    Icon: History,
    group: 'tools',
    blurb: 'Every pipeline run you’ve made — replay the IR and browse generated surfaces.',
  },
];

export const INPUT_ITEMS = NAV.filter((n) => n.group === 'inputs');
export const TOOL_ITEMS = NAV.filter((n) => n.group === 'tools');
