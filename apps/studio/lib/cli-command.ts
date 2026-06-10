import type { RunRequest } from './events';

/** Quote an argument the way a POSIX-ish shell needs (for display/copy only). */
function quote(arg: string): string {
  if (arg === '') return '""';
  return /[\s"'`$&|;<>(){}\\]/.test(arg) ? `"${arg.replace(/(["\\$`])/g, '\\$1')}"` : arg;
}

export interface CliCommand {
  /** argv without the leading `cn` (what the in-studio terminal spawns). */
  argv: string[];
  /** Copy-pasteable command string, e.g. `cn run --openapi ./spec.yaml`. */
  display: string;
  /** Set when the form can't be expressed verbatim on the CLI (e.g. pasted content). */
  note?: string;
}

/** Translate a Studio run request into the equivalent `cn` command line. */
export function toCliCommand(req: RunRequest, command: 'run' | 'acquire' | 'ingest' | 'build' | 'project' = 'run'): CliCommand {
  const argv: string[] = [command];
  let note: string | undefined;

  switch (req.kind) {
    case 'github': {
      argv.push('--github', req.repo?.trim() || 'owner/repo');
      if (req.ref?.trim()) argv.push('--ref', req.ref.trim());
      if (req.spec?.trim()) argv.push('--spec', req.spec.trim());
      note = 'The PAT is read from your .env (CN_GITHUB_PAT) — never put a token on the command line.';
      break;
    }
    case 'openapi': {
      if (req.openapiUrl?.trim()) argv.push('--openapi', req.openapiUrl.trim());
      else if (req.openapiPath?.trim()) argv.push('--openapi', req.openapiPath.trim());
      else if (req.openapiContent?.trim()) {
        argv.push('--openapi', './spec.yaml');
        note = 'Pasted specs have no CLI equivalent — save the spec to a file and pass its path.';
      } else argv.push('--openapi', './openapi.yaml');
      break;
    }
    case 'sdk': {
      argv.push('--sdk', req.sdkPath?.trim() || './sdk-dir');
      if (req.lang) argv.push('--lang', req.lang);
      break;
    }
    case 'mcp': {
      if (req.mcpCommand?.trim()) argv.push('--mcp', req.mcpCommand.trim(), '--command');
      else if (req.mcpUrl?.trim()) argv.push('--mcp', req.mcpUrl.trim());
      else if (req.mcpPath?.trim()) argv.push('--mcp', req.mcpPath.trim());
      else if (req.mcpContent?.trim()) {
        argv.push('--mcp', './tools.json');
        note = 'Pasted manifests have no CLI equivalent — save it to a file and pass its path.';
      } else argv.push('--mcp', './tools.json');
      break;
    }
  }

  return { argv, display: ['cn', ...argv].map(quote).join(' '), note };
}
