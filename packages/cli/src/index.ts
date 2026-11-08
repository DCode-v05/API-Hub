import { runCli } from './cn';
import { loadEnv } from './dotenv';

loadEnv();
const code = await runCli(process.argv.slice(2));
process.exit(code);
