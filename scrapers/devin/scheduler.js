const { exec } = require('child_process');
const path = require('node:path');
const { loadEnvFile } = require('./src/load-env.js');

loadEnvFile(path.join(__dirname, '.env'));


function callFile() {
  exec('node src/index.js --once', { cwd: __dirname }, (error, stdout, stderr) => {
    if (stdout) console.log(stdout.trim());
    if (stderr) console.error(stderr.trimEnd());
    if (error && !stdout && !stderr) {
      console.error(`Error: ${error.message}`);
    }
  });
}

const interval =
  Number(process.env.DEVIN_USAGE_INTERVAL_MINUTES || 15) * 60 * 1000;

callFile();
setInterval(callFile, interval);
