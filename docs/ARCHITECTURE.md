# Architecture (dsh-plugin-web-archive)

## Goal

Any web page → local faithful archive **in the agent's current working directory**, plus a
web-archive tagged Tolaria note written **through the mounted Tolaria MCP** — a dual-read
(human + agent) knowledge-base entry.

The result is **your own document library**: pages you read are stored faithfully and
locally, reusable over time, in an **AI-model-friendly knowledge base** (plain Markdown +
structured frontmatter that agents can parse, search and manage) — aligned with the trend
of AI-driven document management. WeChat is only one adapter.

## Official split of responsibilities (per DSH conventions)

| Phase | Owner | Where |
| --- | --- | --- |
| 1 Read | plugin script (UA direct fetch); JS-only/anti-bot → NEEDS_BROWSER exit 2; skill route renders via agent-browser and retries with `--from-file` | — |
| 2 Faithful save | plugin script | session cwd `web-archive/<date>-<site>-<token>/`: raw.html + images + self-contained `<base>.html` |
| 3 Verbatim Markdown | plugin script (main-content heuristics; images → local refs; originals kept in meta.json `image_originals`) | `.../article.md` + `.../meta.json` |
| 4 Extract tags/summary | **LLM agent** (from article.md; user-mandated tags verbatim) | note tags + Summary + 关键信息 |
| 5 Store to Tolaria | **agent via Tolaria MCP** (`mcp__tolaria__create_note` + `refresh_vault` / `open_note`) — never direct vault file writes | vault `<year>/<date>-<slug>.md` |

Rationale: deterministic fidelity (fetch/parse/download/transcribe/verify) belongs to the plugin;
semantic judgment (tags/summary/key facts) and knowledge-base writes belong to the model + the
Tolaria MCP integration — the plugin stays site-agnostic, never touches the vault, and MCP mounts/unmounts
independently (official `@deepseek-ai/dsh-mcp-client` entry in the profile `cordis.patch.yml`).

## Shipping paths

1. **Skill**: `skill/web-page-archive/` → `~/.agents/skills/web-page-archive/` (or `.dsh/skills/`, `~/.dsh/skills/`). Watcher hot-reloads; model catalog picks it up. Self-contained bundle (SKILL.md + scripts/).
2. **Tool plugin**: `index.js` exports `{ name, inject, apply }`; `apply(ctx, config)` dynamically imports `@deepseek-ai/dsh-tools` and registers `web_archive` (pattern from `dsh-tool-ask-user` / `dsh-skill-filesystem`). Enable via profile `cordis.patch.yml` insert. Same python script — single source of truth.

## Tool contract

- Input: `url` (required); `out_dir` (default `<session cwd>/web-archive`, absolute or relative to cwd — resolved from `exec.agent.session.header.cwd` per DSH convention); `out_name`.
- Output (canonical): title/date/base/out_dir + artifact paths + `needs_enrichment: true` — a signal for the model to compose and write the note via Tolaria MCP.
- Errors: 0 ok / 2 NEEDS_BROWSER (JS-only/anti-bot → skill route browser fallback) / 3 NO_CONTENT / 4 IO. Timeout + AbortSignal forwarded to the child process; args passed as array (no shell).

## Self-contained snapshot transformation

Original pages often lazy-load images (`data-src`), hide content (`visibility:hidden`) and carry dozens of scripts. The rewrite removes `<script>`, remaps imgs to local files (keeping `data-original-src`), forces visible, https-absolutes protocol-relative URLs, adds minimal inline CSS and sets the title — the snapshot then opens offline with all pictures.

## Note schema (dual read, written via MCP)

frontmatter: type/status/captured/url/source/archive: web-archive/tags (must include `web-archive` + site tag + user tags + content tags). Body: Status/Summary/Archive-note block → metadata table → 关键信息 → full original article verbatim. Images in the note reference the original CDN URLs (from meta.json `image_originals`) because MCP takes no binary attachments; the local copies live in the cwd product.

## Honesty & limits

- Original text is never rewritten; summary/metadata are additive layers.
- Partial access (paywall/login) is marked `access: partial` + reason.
- v1 limits: table-heavy layouts flatten in Markdown; PDF/video unsupported; JS pages need the skill-route browser fallback (the plugin tool exits with NEEDS_BROWSER).
- The plugin writes only inside the session working directory; anything beyond it goes through MCP (no sandbox bypass).

## Roadmap

- v0.1: skill + tool plugin, direct-fetch adapters (wechat/static), self-contained snapshot, MCP note flow.
- next: built-in browser-engine escape hatch (agent-browser / playwright render → `--from-file`), table → Markdown structure, optional LLM-summary hook config, vault view conventions doc.
