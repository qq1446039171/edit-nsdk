const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const resolveSettingsPath = () => {
  if (process.env.SETTINGS_PATH) return path.resolve(process.env.SETTINGS_PATH);
  return path.join(REPO_ROOT, 'Config', 'settings.json');
};

// Windows 盘符路径（如 D:/log-nsdk）在 Linux 上 path.isAbsolute 返回 false，
// 会被 path.join 拼成 <repo>/D:/log-nsdk 这种垃圾路径；因此只在 win32 上认它。
const isUsableAbsolute = (v) => {
  if (!path.isAbsolute(v)) return false;
  if (process.platform !== 'win32' && /^[a-zA-Z]:[\\/]/.test(v)) return false; // 跨平台的 Windows 盘符路径
  return true;
};

const resolveLogDir = () => {
  try {
    const settingsPath = resolveSettingsPath();
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const configured = settings?.nsdk?.logDir;
    if (typeof configured === 'string' && configured.trim()) {
      const v = configured.trim();
      if (path.isAbsolute(v)) {
        // 配的是绝对路径：可用就用它，否则（如 Linux CI 上的 D:/...）落到仓库内目录
        if (isUsableAbsolute(v)) return v;
      } else {
        return path.join(REPO_ROOT, v);
      }
    }
  } catch {}

  const env = process.env.NSDK_LOG_DIR;
  if (typeof env === 'string' && env.trim()) {
    const v = env.trim();
    if (isUsableAbsolute(v)) return v;
    if (!path.isAbsolute(v)) return path.join(__dirname, '..', v);
  }

  return path.join(__dirname, '..', 'logs');
};

const LOG_DIR = resolveLogDir();
const LOG_PATH = path.join(LOG_DIR, 'execution.log');

// 推送审计日志：写进仓库内 Config/push-log.jsonl，随定时任务一起提交，
// 这样每一条推送的真实结果（成/败 + ServerChan 返回 code）都可在 GitHub 上查证。
// 量很小（每天数条），并做尾部截断防止无限增长。
const PUSH_LOG_PATH = path.join(REPO_ROOT, 'Config', 'push-log.jsonl');
const PUSH_LOG_MAX_LINES = 500;

const ensureDir = () => {
  fs.mkdirSync(LOG_DIR, { recursive: true });
};

const logEvent = (event) => {
  try {
    ensureDir();
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event });
    fs.appendFileSync(LOG_PATH, `${line}\n`);
  } catch { /* 日志失败不应影响主流程 */ }
};

const logPush = (entry) => {
  try {
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
    let prior = '';
    try { prior = fs.readFileSync(PUSH_LOG_PATH, 'utf8'); } catch { /* 首次无文件 */ }
    let lines = prior ? prior.split(/\r?\n/).filter(Boolean) : [];
    lines.push(line);
    if (lines.length > PUSH_LOG_MAX_LINES) lines = lines.slice(lines.length - PUSH_LOG_MAX_LINES);
    fs.mkdirSync(path.dirname(PUSH_LOG_PATH), { recursive: true });
    fs.writeFileSync(PUSH_LOG_PATH, `${lines.join('\n')}\n`);
  } catch { /* 审计日志失败不应影响主流程 */ }
};

module.exports = {
  LOG_PATH,
  PUSH_LOG_PATH,
  logEvent,
  logPush,
};
