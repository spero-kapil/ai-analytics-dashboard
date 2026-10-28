import fs from 'node:fs';

// Loads KEY=value pairs into env without overriding keys that are already set.
// CLI flags still win over both the process environment and this file.
export function loadEnvFile(filePath, env = process.env) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const body = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = body.indexOf('=');
    if (eq <= 0) continue;

    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (env[key] !== undefined) continue;

    let value = body.slice(eq + 1).trim();
    const singleQuoted = value.startsWith("'") && value.endsWith("'") && value.length >= 2;
    const doubleQuoted = value.startsWith('"') && value.endsWith('"') && value.length >= 2;
    if (singleQuoted || doubleQuoted) value = value.slice(1, -1);
    if (!singleQuoted) value = expandEnvVars(value, env);
    env[key] = value;
  }
}

function expandEnvVars(value, env) {
  return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (match, braced, bare) => {
    const name = braced || bare;
    if (env[name] !== undefined) return env[name];
    if (process.env[name] !== undefined) return process.env[name];
    return match;
  });
}
