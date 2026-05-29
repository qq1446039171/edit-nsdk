const fs = require('fs');
const path = require('path');

const resolveSettingsPath = () => {
  if (process.env.SETTINGS_PATH) return path.resolve(process.env.SETTINGS_PATH);
  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  return path.join(repoRoot, 'Config', 'settings.json');
};

const resolveLogDir = () => {
  try {
    const settingsPath = resolveSettingsPath();
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const configured = settings?.nsdk?.logDir;
    if (typeof configured === 'string' && configured.trim()) {
      const v = configured.trim();
      const repoRoot = path.resolve(__dirname, '..', '..', '..');
      return path.isAbsolute(v) ? v : path.join(repoRoot, v);
    }
  } catch {}

  const env = process.env.NSDK_LOG_DIR;
  if (typeof env === 'string' && env.trim()) {
    const v = env.trim();
    return path.isAbsolute(v) ? v : path.join(__dirname, '..', v);
  }

  return path.join(__dirname, '..', 'logs');
};

const LOG_DIR = resolveLogDir();
const LOG_PATH = path.join(LOG_DIR, 'execution.log');

const ensureDir = () => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
};

const logEvent = (event) => {
  ensureDir();
  const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
  fs.appendFileSync(LOG_PATH, `${line}\n`);
};

module.exports = {
  LOG_PATH,
  logEvent,
};
