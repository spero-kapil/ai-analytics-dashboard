import { exec } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './src/load-env.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '.env'));


function callFile() {
  exec('node src/tracker.js --once', { cwd: __dirname }, (error, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trimEnd());
    if (error && !stdout && !stderr) {
      console.error(`Error: ${error.message}`);
    }
  });
}

const interval =
  Number(process.env.CLAUDE_USAGE_INTERVAL_MIN || 15) * 60 * 1000;

callFile();
setInterval(callFile, interval);
