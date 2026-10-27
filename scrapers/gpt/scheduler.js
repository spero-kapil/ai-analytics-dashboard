import { exec } from 'child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from './src/track-usage.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnvFile(path.join(__dirname, '.env'));


function callFile() {
  exec('node src/track-usage.js', (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }

    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr);
  });
}

const interval =
  Number(process.env.GPT_TRACKER_INTERVAL_MINUTES || 15) * 60 * 1000;

callFile();
setInterval(callFile, interval);