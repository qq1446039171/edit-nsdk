/**
 * 推送开关层
 *
 * 通过 settings.json 的 nsdk.pushEnabled 控制是否真正推送：
 * - true：实际调用 Server酱
 * - false：只记录日志，不发消息（方便调试/静默运行）
 */
const { sendServerChan } = require('./serverchan');

const push = async (cfg, { title, body }) => {
  if (!cfg.pushEnabled) {
    return { ok: true, status: 0, text: 'push_disabled' };
  }
  const serverChan = cfg.serverChan || {};
  return sendServerChan({ envPath: serverChan.envPath, sendKey: serverChan.sendKey, title, body });
};

module.exports = {
  push,
};
