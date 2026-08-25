// dsh-plugin-web-archive — archive any web page into a Tolaria vault.
// Ship path A (plugin): registers the `web_archive` tool via @deepseek-ai/dsh-tools.
// Ship path B (skill): the same bundle under skill/web-page-archive/ is a copyable DSH skill.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_FILE = path.join(__dirname, "skill", "web-page-archive", "scripts", "archive_page.py");

const name = "plugin-web-archive";
const inject = ["tools"];
const description = "Archive any web page (URL) into a local Tolaria vault as a faithful web archive: raw HTML snapshot, downloaded images, offline self-contained snapshot, verbatim Markdown transcription, and a web-archive tagged note (frontmatter + summary + full text). Use when the user asks to save, archive or preserve a web page/article locally, or to create a web-archive note. Handles WeChat 公众号 articles; JS-only or anti-bot pages fail with NEEDS_BROWSER (then render via agent-browser and retry, or use the web-page-archive skill).";

const TIMEOUT_MS = 240_000;
const SITE_TAG = { "mp.weixin.qq.com": "微信公众号" };

function runScript(args, signal) {
  return new Promise((resolve, reject) => {
    const argv = [SCRIPT_FILE, args.url, args.vault];
    if (args.out_name) argv.push("--out-name", args.out_name);
    const child = spawn("python3", argv, {
      stdio: ["ignore", "pipe", "pipe"],
      signal: signal ?? void 0,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* noop */ } }, TIMEOUT_MS);
    child.stdout.on("data", (d) => { stdout += d; });
    child.stderr.on("data", (d) => { stderr += d; });
    const fail = (msg) => { clearTimeout(timer); reject(new Error(msg)); };
    child.on("error", (err) => fail("spawn python3 failed: " + err.message));
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        try {
          resolve(JSON.parse(stdout));
        } catch {
          fail("archive script returned invalid JSON. stderr: " + stderr.slice(0, 300));
        }
        return;
      }
      if (code === 2) {
        fail("NEEDS_BROWSER: JS-only or anti-bot page - render with a browser (agent-browser) and retry via the web-page-archive skill");
        return;
      }
      fail("archive script exited " + code + ": " + (stderr || stdout).trim().slice(0, 600));
    });
  });
}

function dedupe(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function buildNote(meta, tags) {
  const article = fs.readFileSync(meta.files.article_md, "utf8");
  const siteTags = SITE_TAG[meta.domain] ? [SITE_TAG[meta.domain]] : [];
  const allTags = dedupe(["web-archive", ...siteTags, ...(tags ?? [])]);
  const first = article.split(/\n\n+/).map((l) => l.trim()).find((l) => l && !l.startsWith("!["));
  const summary = meta.desc || first || "";
  const basenames = (p) => path.basename(p);
  return [
    "---",
    "type: Note",
    "status: Active",
    "captured: " + meta.date,
    "url: " + meta.url,
    "source: " + (meta.author || meta.site || meta.domain) + "（" + meta.domain + "）",
    "archive: web-archive",
    "tags:",
    ...allTags.map((t) => "  - " + t),
    "---",
    "",
    "# " + (meta.title || meta.url),
    "",
    "> **Status:** 已完成本地化网页存档（web archive），正文完整保留。",
    "> **Summary:** " + summary,
    "> **Archive note:** 原始 HTML / 自包含快照 / 图片 / meta.json 见 attachments/" + meta.base + "-*。",
    "",
    "## 元数据 (Metadata)",
    "",
    "| 字段 | 值 |",
    "| --- | --- |",
    "| 标题 | " + (meta.title ?? "") + " |",
    "| 来源 | " + (meta.site ?? "") + "（" + meta.domain + "） |",
    "| 发布时间 | " + meta.date + " |",
    "| 原文链接 | " + meta.url + " |",
    "| 字数 | " + meta.word_count + " |",
    "| 图片数 | " + meta.image_count + " |",
    "| 正文选区 | " + (meta.main_selector ?? "") + " |",
    "| 原始 HTML | [" + basenames(meta.files.raw) + "](attachments/" + basenames(meta.files.raw) + ") |",
    "| 自包含快照 | [" + basenames(meta.files.html) + "](attachments/" + basenames(meta.files.html) + ") |",
    "| 正文 MD | [" + basenames(meta.files.article_md) + "](attachments/" + basenames(meta.files.article_md) + ") |",
    "",
    "## 归档正文（原文完整保留）",
    "",
    article.trim(),
    "",
  ].join("\n");
}

function buildNotePath(meta, vault) {
  const year = /^\d{4}/.test(meta.date || "") ? meta.date.slice(0, 4) : String(new Date().getFullYear());
  return path.join(vault, year, meta.base + ".md");
}

export async function runArchive(args, signal) {
  if (!args?.url || !args?.vault) throw new Error("url and vault are required");
  const meta = await runScript(args, signal);
  const notePath = buildNotePath(meta, args.vault);
  fs.mkdirSync(path.dirname(notePath), { recursive: true });
  fs.writeFileSync(notePath, buildNote(meta, args.tags), "utf8");
  const attDir = path.dirname(meta.files.raw);
  return {
    title: meta.title ?? "",
    date: meta.date ?? "",
    base: meta.base ?? "",
    note_path: notePath,
    raw_html: meta.files.raw,
    snapshot_html: meta.files.html,
    article_md: meta.files.article_md,
    meta_json: path.join(attDir, meta.base + "-meta.json"),
    images: meta.files.images ?? [],
    needs_enrichment: true,
  };
}

export async function apply(ctx, config = {}) {
  const { defineTool } = await import("@deepseek-ai/dsh-tools");
  const defaultVault = config?.vaultPath || process.env.DSH_WEB_ARCHIVE_VAULT || "";
  ctx.tools.register(defineTool({
    name: "web_archive",
    description,
    parameters: {
      url: {
        type: "string",
        required: true,
        description: "Full URL of the web page to archive.",
      },
      vault: {
        type: "string",
        description: "Tolaria vault root directory. Defaults to plugin config vaultPath or DSH_WEB_ARCHIVE_VAULT.",
      },
      tags: {
        type: "array",
        description: "Extra frontmatter tags for the note (web-archive is always added).",
        items: { type: "string" },
      },
      out_name: {
        type: "string",
        description: "Optional artifact base name (date-site-token). Default is derived from the page.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          title: { type: "string", required: true },
          date: { type: "string", required: true },
          base: { type: "string", required: true },
          note_path: { type: "string", required: true },
          raw_html: { type: "string", required: true },
          snapshot_html: { type: "string", required: true },
          article_md: { type: "string", required: true },
          meta_json: { type: "string", required: true },
          images: { type: "array", required: true, items: { type: "string" } },
          needs_enrichment: { type: "boolean", required: true },
        },
      },
      render: (_args, value) => [{ type: "text", text: JSON.stringify(value, null, 2) }],
    },
    timeoutMs: TIMEOUT_MS + 30_000,
    async execute(args, exec) {
      const vault = args.vault || defaultVault;
      if (!vault) {
        throw new Error("vault is required: pass vault arg, set plugin config vaultPath, or export DSH_WEB_ARCHIVE_VAULT");
      }
      return runArchive(
        { url: args.url, vault, tags: args.tags ?? [], out_name: args.out_name },
        exec.signal,
      );
    },
  }));
}

export { name, inject };
