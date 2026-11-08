import type { RunRequest } from './events';

function quote(arg: string): string {
  if (arg === '') return '""';
  return /[\s"'`$&|;<>(){}\\]/.test(arg) ? `"${arg.replace(/(["\\$`])/g, '\\$1')}"` : arg;
}

export function cnDisplay(argv: string[]): string {
  return ['cn', ...argv].map(quote).join(' ');
}

export interface CliCommand {
  argv: string[];
  display: string;
  note?: string;
}

export function toCliCommand(req: RunRequest, command: 'run' | 'acquire' | 'ingest' | 'build' | 'project' = 'run'): CliCommand {
  const argv: string[] = [command];
  let note: string | undefined;

  switch (req.kind) {
    case 'github': {
      argv.push('--github', req.repo?.trim() || 'owner/repo');
      if (req.ref?.trim()) argv.push('--ref', req.ref.trim());
      if (req.spec?.trim()) argv.push('--spec', req.spec.trim());
      note = '';
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

  return { argv, display: cnDisplay(argv), note };
}
