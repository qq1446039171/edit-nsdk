const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// ============ 刷新失败明细：横幅消息应包含逐项失败原因 ============
assert.match(html, /failures\.push\(/, '刷新失败时应收集失败明细');
assert.match(html, /failures\.join\("\\n"\)/, '失败明细应逐行拼进提示消息');
assert.match(html, /备用：/, '主备两路失败原因都应展示');

// ============ renderNotice：支持多行消息且保持 XSS 转义 ============
const noticeMatch = html.match(/function renderNotice\(message, type\) \{[\s\S]*?\n    \}/);
assert.ok(noticeMatch, 'renderNotice should exist');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const renderNotice = eval(`(${noticeMatch[0]})`);

const multi = renderNotice('第一行\n资产A（513100）：价格无效', 'warning');
assert.ok(multi.includes('第一行<br>资产A（513100）：价格无效'), '换行应渲染为 <br>');

const xss = renderNotice('a\n<script>alert(1)</script>', 'warning');
assert.ok(!xss.includes('<script>'), '消息内容必须转义，不能注入 HTML');
assert.ok(xss.includes('&lt;script&gt;'), '标签应以转义文本展示');

// ============ 资产表格：失败行价格列应有红色 ⚠ 标记与原因提示 ============
assert.match(html, /raw\?\.lastPriceError/, '表格行应读取 lastPriceError');
assert.match(html, /class="price-error" title="上次刷新失败：/, '价格列应有失败标记且悬浮显示原因');
assert.match(html, /\.price-error \{/, '应有 price-error 样式');

console.log('refresh-failure-detail.test.js: all assertions passed');
