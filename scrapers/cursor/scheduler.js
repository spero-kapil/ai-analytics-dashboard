import { exec } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './src/track-usage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '.env'));


function callFile() {
  exec('node src/track-usage.js', { cwd: __dirname }, (error, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr);
    if (error && !stdout && !stderr) {
      console.error(`Error: ${error.message}`);
    }
  });
}

const interval =
  Number(process.env.CURSOR_TRACKER_INTERVAL_MINUTES || 15) * 60 * 1000;

callFile();
setInterval(callFile, interval);
