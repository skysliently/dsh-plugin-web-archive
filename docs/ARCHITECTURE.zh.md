# 架构（中文版）— dsh-plugin-web-archive

> English: [ARCHITECTURE.md](ARCHITECTURE.md)

## 目标

任意网页 → 在 **agent 当前工作目录**生成本地可信存档（raw HTML、全部配图、离线自包含快照、逐字 Markdown、meta.json），再由模型**通过已挂载的 Tolaria MCP**写入带 `web-archive` 标签、人/agent 双读的知识库笔记。

最终沉淀为**属于自己的文档库**：读过的网页被忠实本地存储、可长期复用；知识库采用**对 AI 模型友好**的形态（纯 Markdown + 结构化 frontmatter，agent 可解析/检索/管理），符合「AI 模型管理文档」的发展趋势。微信只是适配器之一。

## 官方分工

| 阶段 | 归属 | 位置 |
| --- | --- | --- |
| 1 读取 | 插件脚本（UA 直连）；JS 渲染/反爬 → 退出码 2 `NEEDS_BROWSER`；skill 路线用 agent-browser 渲染后 `--from-file` 续跑 | — |
| 2 忠实保存 | 插件脚本 | 会话 cwd `web-archive/<date>-<site>-<token>/`：raw.html + 图片 + 自包含 `<base>.html` |
| 3 逐字转写 | 插件脚本（正文选区启发式；图片→本地引用；原图保留在 meta.json `image_originals`） | `.../article.md` + `.../meta.json` |
| 4 语义提取 | **LLM agent**（依据 article.md；用户指定标签原词保留） | 笔记 tags + Summary + 关键信息 |
| 5 写入 Tolaria | **agent 经 Tolaria MCP**（`mcp__tolaria__create_note` + `refresh_vault`/`open_note`）——绝不直接写 vault 文件 | vault `<year>/<date>-<slug>.md` |

**理由**：确定性的保真工作（抓取/解析/下载/转写/校验）属于插件；语义判断（标签/摘要/关键信息）与知识库写入属于模型 + Tolaria MCP 集成——插件站点无关、永不触碰 vault，MCP 可独立挂载/卸载（官方 `@deepseek-ai/dsh-mcp-client` + profile `cordis.patch.yml` 条目）。

## 双安装路径

1. **Skill**：`skill/web-page-archive/` → `~/.agents/skills/web-page-archive/`（或 `.dsh/skills/`、`~/.dsh/skills/`）。watcher 热加载；模型目录自动收录；SKILL.md + scripts/ 自包含。
2. **工具插件**：`index.js` 导出 `{ name, inject, apply }`；`apply(ctx, config = {})` 动态导入 `@deepseek-ai/dsh-tools` 并注册 `web_archive`（先例：`dsh-tool-ask-user` / `dsh-skill-filesystem`）。经 profile `cordis.patch.yml` insert 启用；与脚本共用同一份 `archive_page.py`（单一事实源）。

## 工具契约

- 入参：`url`（必填）；`out_dir`（默认 `<会话 cwd>/web-archive`，按 DSH 惯例从 `exec.agent.session.header.cwd` 解析，相对或绝对）；`out_name`。
- 出参（canonical JSON）：title/date/base/out_dir + 各产物绝对路径 + `needs_enrichment: true`（提示模型经 Tolaria MCP 组装笔记）。
- 错误：0 ok / 2 NEEDS_BROWSER / 3 NO_CONTENT / 4 IO；超时与 AbortSignal 转发到子进程；参数以数组传入（无 shell 注入面）。

## 自包含快照转换

原页面常带懒加载图片（`data-src`）、隐藏正文（`visibility: hidden`）与大量脚本。转换：移除 `<script>`、图片改指本地文件（保留 `data-original-src`）、强制可见、协议相对 URL 补 https、注入最小内联样式并设置标题——离线打开即有图有文。

## 笔记结构（经 MCP 写入，双读）

frontmatter：type/status/captured/url/source/`archive: web-archive`/tags（必含 `web-archive` + 站点标签 + 用户标签 + 内容标签）。正文：Status/Summary/Archive-note 块 → 元数据表 → 关键信息 → 完整原文逐字保留。笔记图片引用原图 CDN（meta.json `image_originals`；MCP 不收二进制附件；本地副本留在 cwd 产品）。

## 诚实性与限制

- 原文永不改写；摘要/元数据为附加层；部分可访问（付费墙/登录）标注 `access: partial` + 原因。
- v1：表格布局转 MD 较扁平；PDF/视频不支持；JS 页需 skill 路线浏览器兜底。
- 插件只写会话工作目录；其余一切经 MCP（无沙箱绕过）。

## 路线图

- v0.2：skill + 工具插件、直连适配器（微信/静态页）、自包含快照、MCP 写入流程、中文文档。
- 下一步：内置浏览器引擎兜底（agent-browser/playwright 渲染 → `--from-file`）、表格 → MD 结构、LLM 摘要 hook 配置、vault 视图约定文档。
