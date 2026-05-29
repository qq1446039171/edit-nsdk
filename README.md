# NSDK 参数配置（纯前端）

## 目标
- 提供一个 PC 端网页，用于编辑/校验 `settings.json`
- 不依赖后端服务（浏览器直接读写需用户授权）
- 支持部署到 GitHub Pages（静态托管）

## 启动
```bash
npm install
npm run dev
```

## 构建
```bash
npm run build
```

GitHub Pages 专用构建（相对路径，适配仓库子路径部署）：
```bash
npm run build:pages
```

## GitHub Pages 部署
仓库已提供工作流：`.github/workflows/deploy-pages.yml`

1. 在 GitHub 仓库设置中启用 **Pages**，Source 选择 **GitHub Actions**。
2. 推送到 `master` 分支后，会自动执行工作流并发布静态页面 artifact（`web/index.html` + `Config/settings.json`）。
3. 页面为纯前端，不依赖后端 API。

## 云端自动运行（Pages + GitHub Actions Cron）

为了让 `app/nsdk` 在云端自动执行（而不是依赖本机常驻进程），仓库新增两条工作流：

- `.github/workflows/nsdk-cron.yml`：
  - 每 5 分钟运行 `realtime`（仅档位触发时推送，保证回撤档位尽快提醒）
  - 工作日 10:30 / 14:30（北京时间）运行 `market`（例行状态推送）
- `.github/workflows/save-settings.yml`：接收网页触发，把当前配置写回 `Config/settings.json`

### 必做配置
1. 在仓库 **Settings → Actions → General** 打开 Workflow 权限（允许读写仓库内容）。
2. 在仓库 **Settings → Secrets and variables → Actions** 新增：
   - `NSDK_SERVERCHAN_SENDKEY`（可选，建议放这里而不是明文写入 settings）
3. 在网页中点击“保存到 GitHub”，填写 owner/repo/branch + 具备 `repo` 与 `workflow` 权限的 PAT。

这样就能实现：网页改配置 → 写回仓库 `Config/settings.json` → 下次 cron 推送读取新配置。

## 使用方式（推荐）
- 页面会自动尝试读取 `Config/settings.json`：
  - 优先读取你在“保存到 GitHub”里配置的 `owner/repo/branch` 对应仓库文件
  - 其次尝试同源静态路径 `./Config/settings.json`
- 若自动读取失败，可点击「打开文件」手动选择 `Config/settings.json`
- 修改参数后点击「保存」可写回本地授权文件；点击「保存到 GitHub」可写回仓库
- 回撤档位执行状态可在页面「回撤档位执行状态（Config/settings.json）」卡片中直接切换，对应字段 `drawdown.executedLevels`
- v3.0 执行面板按 `40% 持仓 / 30% 备用金 / 30% 其他现金` 展示；纳指敞口只统计当前持仓，不把备用金计入敞口，并给出月度 ¥4,000 分配建议。
- 若浏览器不支持文件系统 API，可使用「导出/导入」

## 功能说明
- **持仓维护保持一致**：继续支持在网页里更新纳指持仓、备用金、其他现金等字段，总资产自动汇总。
- **推送功能保持兼容**：`nsdk.pushEnabled` 与 `nsdk.serverChan.sendKey` 仍在配置结构中，`app/nsdk` 读取 `Config/settings.json` 后可继续发送推送。

## 与 NSDK 项目融合（app 目录）

- [app/nsdk](file:///d:/TZ-NSDK/app/nsdk) 是提醒引擎（常驻/单次运行）
- 本项目负责维护/修改资金与纪律参数，写入 `Config/settings.json`
- NSDK 运行时会直接读取 `Config/settings.json` 获取运行配置与资金数据（不再使用 `app/nsdk/config.json`）

单次执行 NSDK（示例）：

```bash
npm run app:run-once
```

## 兼容说明
- 直接写回磁盘文件依赖浏览器的 File System Access API
- 推荐使用 Edge / Chrome（Windows 下可用）
- 如果浏览器不支持，将使用「导出/导入」方式：导出下载 JSON，再手动替换目标文件

分清两种“修改”：

- 只改了 `Config/settings.json`（参数/时间点/开关）：不需要重启进程。scheduler 每 30 秒会重新 `loadConfig()`，会自动吃到最新配置。
- 改了 `app/nsdk/src/*.js`（程序逻辑代码）：必须重启常驻进程，Node 才会加载最新代码。

`npm run app:refresh` 会先停掉常驻进程再拉起，并额外执行一次 `run-once`（可能触发一次推送/日志）。

更纯粹重启（不额外 run-once）：
- `npm run app:restart`


npm run app:run-once -- once  单次手动执行推送
 Get-Content D:\log-nsdk\execution.log -Tail 80  查看执行日志
<!-- eastmoney -->
