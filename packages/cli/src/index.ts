import { runCli } from './cn';
import { loadEnv } from './dotenv';

loadEnv(); // pick up CN_GITHUB_PAT / GITHUB_TOKEN / CN_TOKEN from a local .env (real env still wins)
const code = await runCli(process.argv.slice(2));
process.exit(code);
