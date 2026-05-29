# Portfolio Assets 实现计划

> **面向 AI 代理的工作者：** 使用 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将固定的纳指投资金额升级为可编辑的多资产持仓表，并按价格/净值/固定金额自动汇总各类资产占比。

**架构：** `Config/settings.json` 新增 `portfolio.assets` 数组；网页负责编辑资产、取价、估值与同步旧字段；`app/nsdk/src/config.js` 在读取配置时也能根据资产表汇总旧字段，保证提醒引擎兼容。旧字段继续保留，作为行情缺失或旧配置的兜底。

**技术栈：** 静态 HTML/CSS/原生 JS、Node CommonJS、Node assert 测试。

---

### 任务 1：后端配置读取支持资产表

**文件：**
- 修改：`app/nsdk/src/config.js`
- 创建：`app/nsdk/tests/config-assets.test.js`
- 修改：`app/nsdk/package.json`

- [ ] 步骤 1：编写失败测试，验证 `portfolio.assets` 可汇总为 `investedNasdaqCny`、`reserveCashNasdaqCny`、`otherCashCny`。
- [ ] 步骤 2：运行 `npm --prefix app/nsdk test`，确认测试因缺少导出或缺少资产汇总而失败。
- [ ] 步骤 3：实现 `summarizePortfolioAssets()` 并导出 `buildConfigFromSettings()`。
- [ ] 步骤 4：再次运行 `npm --prefix app/nsdk test`，确认通过。

### 任务 2：网页支持资产表编辑和汇总

**文件：**
- 修改：`web/index.html`
- 修改：`Config/settings.json`

- [ ] 步骤 1：在 schema 中新增 `portfolio.assets`，并隐藏旧的手工 `investedNasdaqCny` 字段。
- [ ] 步骤 2：新增资产取价、估值、分类汇总、代码推断 secid 的前端函数。
- [ ] 步骤 3：新增“资产持仓”表格，支持新增、删除、编辑分类、类型、代码、份额和固定金额。
- [ ] 步骤 4：让执行面板和旧字段从资产表汇总结果同步。
- [ ] 步骤 5：在 `Config/settings.json` 加入示例资产表，保留旧字段兼容。

### 任务 3：验证

**文件：**
- 修改：`package.json`

- [ ] 步骤 1：根 `npm test` 调用 `app/nsdk` 测试。
- [ ] 步骤 2：运行 `npm test`。
- [ ] 步骤 3：运行 `npm run build`。
- [ ] 步骤 4：检查 `git diff --stat` 和关键 diff，确认只改相关文件。
