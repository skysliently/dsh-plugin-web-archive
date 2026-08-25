---
name: web-page-archive
description: Archive any web page (URL) into the Tolaria vault as a complete local web archive: faithful raw HTML + local images + offline self-contained snapshot, verbatim Markdown transcription, then a dual-read (human + agent) note with frontmatter tags incl. the web-archive marker, key tags and a summary. Use when the user asks to save, archive, or preserve a web page/article locally, or to create a web-archive tagged Tolaria note. Works for WeChat 公众号 articles, blogs, docs and JS-rendered pages (with the agent-browser fallback).
allowed-tools: Bash(python3:*), Bash(curl:*), Bash(cp:*), Bash(mkdir:*), Bash(npx agent-browser:*), Tolaria(mcp__tolaria__*)
---

# Web Page → Tolaria Local Archive

Archive any web page into the vault (`attachments/` + note under the current year folder). Five phases: read → faithful save → verbatim Markdown → extract tags/summary → store to Tolaria. Deterministic work is script-driven; semantic extraction (tags, summary, key facts) is your LLM job.

## Requirements

- `python3` with `lxml`（`python3 -m pip install lxml`）
- 本 skill 目录完整复制到 skills 根（`~/.agents/skills/web-page-archive/` 或项目 `.dsh/skills/`），脚本在 `scripts/archive_page.py`

## Inputs

- Target URL（任意网页）；vault path（未提供则询问，例如 /Users/you/tolaria）；用户指定的必选标签（原词保留，默认含 `web-archive`）

## Steps

1. **运行脚本**（读取+保存+转写+下载+自包含，输出归档 JSON）：

   ```bash
   python3 scripts/archive_page.py "<url>" "<vaultPath>"
   ```

2. **结果分派**：
   - 脚本成功 → 读 `...-meta.json` 和 `...-article.md`。
   - 退出码 2（`NEEDS_BROWSER`：JS 渲染/反爬验证页）→ `npx agent-browser open <url>`（必要时 `--session` 保留登录态），eval 取 `document.documentElement.outerHTML` 存为 `/tmp/page.html`，然后 `python3 scripts/archive_page.py --from-file /tmp/page.html <vaultPath> <url>`。
   - 仅部分可访问：按实际可见内容存档，笔记元数据标注 `access: partial` + 原因，向用户说明，不假装完整。
3. **语义提取（LLM）**：从 article.md 生成——内容标签（kebab-case 英文为主）、`## 关键信息`（人/产品/事实/结论，机器可读 bullet）、`> Summary`（1-3 行）。
4. **组装 Tolaria 笔记**：路径 `<year>/<date>-<slug>.md`；frontmatter `type: Note / status: Active / captured: <文章发布日期或今天> / url / source: <站点名或域名> / archive: web-archive`；tags 必须含 `web-archive`（网页存档英文标识）+ 用户指定标签 + 站点标签 + 内容标签。正文顺序：Status/Summary/Archive note 块 → 元数据表（标题/来源/日期/URL/快照链接/字数/图片数）→ 关键信息 → **完整原文（逐字保留，图片引用 attachments/ 本地路径）**。原文不改一字；摘要与元数据只是附加层。面向人 + agent 双读（vault AGENTS.md 跨 agent 约定）。
5. **校验**：段落/chunk 比对 0 缺失；所有本地图片文件存在；tags 含 `web-archive`；自包含 HTML 无残留脚本、正文可见。然后 refresh vault 并给用户打开笔记。

## Notes / 边界

- 写 vault（工作区外）可能需要更宽的 sandbox 许可——通过批准流程获取，禁止绕过。
- 日期优先用页面元数据（og:article:published_time / createTime），缺失才用当天。
- 受限访问（登录/付费墙）如实标注 `access: partial`；不得伪造原文完整性。
- 站点适配器常识：mp.weixin.qq.com 直接抓取可能命中"环境异常"（脚本已检测）；懒加载图片取 `data-src`；非 HTML（PDF/视频）v1 不支持。
- 若安装了本插件的 `web_archive` 工具，阶段 1-3 + 笔记骨架可由工具一次性完成（`vault` 参数或插件配置），随后按步骤 3-5 补充语义层。
