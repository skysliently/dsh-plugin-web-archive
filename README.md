# dsh-plugin-web-archive

> **中文文档:** [README.zh.md](README.zh.md) · **English:** shareable DSH plugin

> **Purpose: build your own document library.** Archive **any web page** into a **Tolaria vault** as a faithful local web archive — raw HTML snapshot, downloaded images, offline self-contained snapshot, verbatim Markdown transcription, and a **web-archive tagged note** readable by **humans and agents alike** — so content you read is stored faithfully **locally** and never vanishes with a dead link. **Tolaria is AI-model friendly by design**: plain Markdown with structured frontmatter that agents can parse, search and manage — aligned with where AI-driven knowledge management is heading.

## What it does

```
URL → ①read (UA direct fetch; JS-only/anti-bot → browser fallback)
     → ②faithful save into the agent's current working directory (raw HTML + images + offline self-contained snapshot)
     → ③verbatim Markdown (main-content extraction, zero rewrites)
     → ④semantic layer by the model (tags / summary / key facts)
     → ⑤write the note into Tolaria via the mounted Tolaria MCP (mcp__tolaria__*)
```

Deterministic work (fetch / parse / download / transcribe / verify) is script-driven; semantic work (tags, summary, key facts) is done by the model in conversation — so the plugin stays site-agnostic and note quality follows the user's instructions.

> **New here? Start with [QUICKSTART.md](QUICKSTART.md)** — 30-second setup, copy-paste commands, smoke test and troubleshooting.
>
> **Verification status:** installed into real dsh profiles (web + headless, pnpm file-install + `cordis.patch.yml` insert), integration-verified against the runtime's own `@deepseek-ai/dsh-tools`, and a real headless dsh run archived a WeChat article into the session cwd with the `web_archive` tool. Vault writes go through the Tolaria MCP (`mcp__tolaria__*`), which must be mounted into dsh.

## Install

Requires: Node ≥ 20, `python3` + `lxml` (`python3 -m pip install lxml`).

### Path A — Skill (zero build, recommended first)

```bash
mkdir -p ~/.agents/skills
cp -R skill/web-page-archive ~/.agents/skills/
```

The filesystem watcher hot-reloads skills (also `~/.dsh/skills`, `<projectRoot>/.dsh/skills`). The model's catalog then lists `web-page-archive`; say "存档这个页面" or name it explicitly.

### Path B — Tool plugin (one-call atomic)

Requires pnpm on PATH (`npm i -g pnpm`). Use the official dsh plugin command (it forwards pnpm into the profile directory):

```bash
dsh plugin --profile web add file:/path/to/dsh-plugin-web-archive
```

Then append to `cordis.patch.yml`:

```yaml
- insert:
    - id: web-archive
      name: 'dsh-plugin-web-archive'
```

Restart `dsh web`. The model now has the `web_archive` tool:

```json
{"url": "https://mp.weixin.qq.com/s/..."}
```

The tool saves the archive product into the session working directory (`web-archive/<base>/` by default) and returns the artifact paths with `needs_enrichment: true`; the model then writes the web-archive note into the knowledge base **through the Tolaria MCP** (`mcp__tolaria__create_note`), which must be mounted into dsh (official `dsh-mcp-client` entry — see `cordis.patch.yml` `mcp-tolaria`).

## Usage notes

- **JS-only / anti-bot pages**: the script exits with `NEEDS_BROWSER`; render with agent-browser (`npx agent-browser open <url>`, eval `document.documentElement.outerHTML`) and retry with `--from-file <rendered.html>` (skill route) — documented in the skill.
- **Tolaria MCP required for vault writes**: writing into Tolaria goes through `mcp__tolaria__*`, mounted into dsh via `@deepseek-ai/dsh-mcp-client` (profile `cordis.patch.yml` `mcp-tolaria` entry). The tool never touches the vault directly.
- **Honesty**: the original text is preserved verbatim; partial access (paywalls) is marked `access: partial`.

## Contents

| Path | Purpose |
| --- | --- |
| `index.js` | Cordis plugin (registers `web_archive` via `@deepseek-ai/dsh-tools`; `{ name, inject, apply }` pattern per `dsh-tool-ask-user`) |
| `skill/web-page-archive/SKILL.md` | Copyable DSH skill instructions |
| `skill/web-page-archive/scripts/archive_page.py` | Single source of truth archiver (used by both paths) |
| `tests/run-archive.mjs` | End-to-end smoke test without a DSH runtime |
| `docs/ARCHITECTURE.md` | Five-phase design, adapters, limits, roadmap |

## Test

```bash
node tests/run-archive.mjs https://mp.weixin.qq.com/s/G556iFAwzYFwxU-YcwZ7hw /tmp/archive-test
```

## License

MIT

## 中文速览

把任意网页完整存档到 Tolaria：原始 HTML + 本地图片 + 离线自包含快照 + 逐字 Markdown + 带 `web-archive` 标签、人/agent 双读的笔记。微信只是第一个适配器。确定性工作（抓取/解析/下载/转写/校验）由脚本负责，语义工作（标签/摘要/关键信息）由模型在对话中完成——因此站点无关、标签可随用户指令定制。两种安装方式：拷贝 Skill（零构建）或作为 Cordis 工具插件（`dsh plugin` 一行调用）。
