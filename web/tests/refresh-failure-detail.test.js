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

// ============ 行情主源：push2 主域当前会断开连接，改走可访问的 push2delay ============
assert.ok(!html.includes('https://push2.eastmoney.com/api/qt/stock/get'), '网页不得继续使用会断开连接的 push2 主域');
assert.match(html, /https:\/\/push2delay\.eastmoney\.com\/api\/qt\/stock\/get/, '网页实时行情应使用可访问的 push2delay 域名');
assert.match(html, /push2his\.eastmoney\.com\/api\/qt\/stock\/kline\/get/, 'push2delay 返回 0 时，网页应先用场内 K 线收盘价兜底');
assert.ok(
  html.indexOf('fetchExchangeKlinePrice') < html.indexOf('async function fetchFundPrice'),
  '场内 ETF 不应在 push2 异常时直接降级为基金净值'
);

// ============ 基金净值数据源：fundgz 已下线，浏览器优先走不依赖 Referer 的 pingzhongdata ============
assert.ok(!html.includes('fundgz.1234567.com.cn'), '不得再引用已下线的 fundgz 接口');
assert.match(html, /fund\.eastmoney\.com\/pingzhongdata\//, '网页场外基金净值应优先走东财基金页脚本数据');
assert.match(html, /api\.fund\.eastmoney\.com\/f10\/lsjz/, '应保留东财 lsjz 历史净值兜底');
assert.match(html, /fundmobapi\.eastmoney\.com\/FundMNewApi\/FundMNFInfo/, '应保留 FundMNFInfo 最后兜底');
assert.ok(
  html.indexOf('https://fund.eastmoney.com/pingzhongdata/') < html.indexOf('https://api.fund.eastmoney.com/f10/lsjz') &&
  html.indexOf('https://api.fund.eastmoney.com/f10/lsjz') < html.indexOf('https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo'),
  '网页正常刷新必须按 pingzhongdata -> lsjz -> FundMNFInfo 顺序取价'
);


console.log('refresh-failure-detail.test.js: all assertions passed');
