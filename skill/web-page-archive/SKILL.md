---
name: web-page-archive
description: Archive any web page (URL) into the agent's current working directory (raw HTML + local images + offline self-contained snapshot + verbatim Markdown + meta.json), then write the web-archive note into the Tolaria vault via the Tolaria MCP tools (mcp__tolaria__*) mounted in dsh — a dual-read (human + agent) note with frontmatter tags incl. the web-archive marker, key tags and a summary. Use when the user asks to save, archive or preserve a web page/article locally, or to create a web-archive tagged Tolaria note. Works for WeChat 公众号 articles, blogs, docs and JS-rendered pages (with the agent-browser fallback).
allowed-tools: Bash(python3:*), Bash(curl:*), Bash(cp:*), Bash(mkdir:*), Bash(npx agent-browser:*), Tolaria(mcp__tolaria__*)
---

# Web Page → Local Archive → Tolaria (official flow)

Five phases. Deterministic work (fetch / parse / download / transcribe / verify) is the plugin script's job and its product lands in the **agent's current working directory**; writing into the user's knowledge base happens **only through the Tolaria MCP** (mcp__tolaria__*), which must be mounted into dsh (official mcp-client entry, see profile cordis.patch.yml `mcp-tolaria`).

## Requirements

- `python3` + `lxml`（`python3 -m pip install lxml`）
- Tolaria MCP 已挂载进 dsh（`@deepseek-ai/dsh-mcp-client` + `mcp-tolaria` 配置；vault path 在 MCP 侧配置）——没有 MCP 时先告知用户，不要直接写 vault 文件
- 本 skill 目录完整复制到 skills 根（`~/.agents/skills/web-page-archive/` 或项目 `.dsh/skills/`），脚本在 `scripts/archive_page.py`

## Steps

1. **运行脚本**（产品落 cwd：默认可输出到 `./web-archive/` 或用户指定目录，写入 `<out_dir>/<base>/`）：

   ```bash
   python3 scripts/archive_page.py "<url>" ./web-archive
   ```

2. **结果分派**：
   - 成功 → 读 `<meta-dir>/<base>-meta.json` 与 `<base>-article.md`（图片本地引用为 `![<base>-imgNN.ext]`，原始 CDN 在 meta.json `image_originals`）。
   - 退出码 2（`NEEDS_BROWSER`）→ `npx agent-browser open <url>`（必要时 `--session`），eval 取 `document.documentElement.outerHTML` 存 `/tmp/page.html`，然后 `python3 scripts/archive_page.py --from-file /tmp/page.html ./web-archive <url>`。
   - 仅部分可访问：按实际内容存档，并如实说明。
3. **语义提取（LLM）**：内容标签（kebab-case 英文为主，含用户指定标签原词）、`## 关键信息` bullet、`> Summary` 1-3 行。
4. **通过 Tolaria MCP 写入 vault**（禁止直接改 vault 文件）：
   - `mcp__tolaria__create_note`：path `<year>/<date>-<slug>.md`；完整 content = frontmatter（`type: Note`、`status: Active`、`captured: <文章发布日期>`、`url`、`source: <公众号/站点>（<域名>）`、`archive: web-archive`、`tags` 必含 `web-archive` + 用户标签 + 站点标签 + 内容标签）+ 正文（Status/Summary/Archive note 块 → 元数据表 → 关键信息 → **完整原文**）。
   - 图片：正文中的本地引用替换为原始 CDN URL（对照 meta.json `image_originals` 顺序）——MCP 不接收二进制附件；本地副本保留在 cwd 产品目录并在元数据表注明。
   - 原文不改一字；摘要/元数据为附加层。
5. **校验 + 交互**：`mcp__tolaria__refresh_vault` + `open_note`；确认 tags 含 `web-archive`、正文完整（段落/chunk 比对 0 缺失）、`article.md` 与笔记正文一致；向用户报告：cwd 产品路径 + vault 笔记路径。
