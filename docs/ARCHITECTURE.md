# Architecture (dsh-plugin-web-archive)

## Goal

Any web page → local faithful archive in a Tolaria vault:
raw HTML + downloaded images + offline self-contained snapshot + verbatim Markdown + a
web-archive tagged note that humans AND agents can read. WeChat is only one adapter.

## Five phases and ownership

| Phase | Owner | Output |
| --- | --- | --- |
| 1 Read | script (browser UA direct fetch); JS-only/anti-bot → NEEDS_BROWSER exit 2; skill route renders via agent-browser and retries with `--from-file` | raw HTML |
| 2 Faithful save | script | `attachments/<date>-<site>-<token>-raw.html` + images + self-contained `...html` |
| 3 Verbatim Markdown | script: main-content heuristics → Markdown, images become local references | `...-article.md` |
| 4 Extract tags/summary | **LLM agent** (from article.md; user-mandated tags verbatim) | note tags + Summary + 关键信息 |
| 5 Store to Tolaria | agent (skill route) or plugin (tool route writes scaffold note) | `<year>/<date>-<slug>.md` + attachments/ |

Rationale: deterministic fidelity (fetch/parse/download/transcribe/verify) belongs to code;
semantic judgment (tags/summary/key facts) belongs to the model — so the plugin stays site-agnostic
and the note quality comes from the conversation, not hardcoded rule lists.

## Shipping paths

1. **Skill** (copy-to-install): `skill/web-page-archive/` → `~/.agents/skills/web-page-archive/`
   (or project `.dsh/skills/`, `~/.dsh/skills/`). Watcher hot-reloads; model catalog picks it up.
   Scripts and SKILL.md live in one folder = fully self-contained bundle.
2. **Tool plugin** (npm): `index.js` exports the Cordis plugin `{ name, inject, apply }`;
   `apply(ctx)` dynamically imports `@deepseek-ai/dsh-tools` and registers `web_archive`
   (pattern from `@deepseek-ai/dsh-tool-ask-user`). Enable via profile `cordis.patch.yml`:
   `name` = package name, config `vaultPath`. Same python script, single source of truth.

## Tool contract

- Input: `url` (required), `vault` (config/env fallback), `tags[]`, `out_name`.
- Output (canonical JSON): title/date/base, artifact paths, `needs_enrichment: true` — a signal for
  the model to follow up and add the semantic layer (tags/summary/关键信息) by editing the note.
- Errors: exit 0 ok / 2 NEEDS_BROWSER (JS-only/anti-bot → skill route browser fallback) / 3 NO_CONTENT /
  4 IO. Timeout + AbortSignal forwarded to the child process; args passed as array (no shell).

## Self-contained snapshot transformation

- Original page has lazy images (`data-src`) and often `visibility:hidden` content + dozens of scripts.
- Rewrite: remove `<script>`, remap imgs to local files (keep `data-original-src`), force visible,
  https-absolute protocol-relative URLs, minimal inline CSS, set title → opens offline with pictures.

## Note schema (dual read)

frontmatter: type/status/captured/url/source/archive: web-archive/tags（必含 web-archive 英文标识）.
Body: Status/Summary/Archive-note block → metadata table → 关键信息 → full original article verbatim.
Matches the vault AGENTS.md cross-agent conventions.

## Honesty & limits

- Original text is never rewritten; summary/metadata are additive layers.
- Partial access (paywall/login) is marked `access: partial` + reason.
- v1 limits: table-heavy layouts flatten in Markdown; PDF/video unsupported; JS pages need the
  skill-route browser fallback (the plugin tool exits with NEEDS_BROWSER).
- Vault writes outside the session workspace may require wider sandbox permission; the skill
  documents the approval flow instead of working around denials.

## Roadmap

- v0.1: skill + tool plugin, direct-fetch adapters (wechat/static), self-contained snapshot, note scaffold.
- next: built-in browser-engine escape hatch (agent-browser / playwright render → `--from-file`),
  table → Markdown structure, optional LLM-summary hook config, vault view conventions doc.
