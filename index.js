// dsh-plugin-web-archive — archive any web page into the agent's current working directory.
// Official split of responsibilities:
//   - THIS PLUGIN (web_archive tool) produces the archive product in the session cwd:
//     raw HTML, downloaded images, offline self-contained snapshot, verbatim Markdown, meta.json.
//   - Writing into the user's knowledge base (Tolaria vault) is done by the agent through the
//     Tolaria MCP (mcp__tolaria__*), which is mounted into dsh via @deepseek-ai/dsh-mcp-client.
// Ship path B (skill): the same bundle under skill/web-page-archive/ is a copyable DSH skill.
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_FILE = path.join(__dirname, "skill", "web-page-archive", "scripts", "archive_page.py");

const name = "plugin-web-archive";
const inject = ["tools"];
const description = "Archive any web page into the agent's current working directory under web-archive/<base>/: raw HTML snapshot, downloaded images, offline self-contained snapshot, verbatim Markdown transcription and meta.json. Returns the artifact paths and metadata; the agent then writes the web-archive note into the user's knowledge base via the Tolaria MCP tools (mcp__tolaria__*) mounted in dsh. WeChat 公众号 articles supported; JS-only or anti-bot pages fail with NEEDS_BROWSER (render via agent-browser, then retry, or use the web-page-archive skill).";

const TIMEOUT_MS = 240_000;

function runScript(args, signal) {
  return new Promise((resolve, reject) => {
    const argv = [SCRIPT_FILE, args.url, args.out_dir];
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

export async function runArchive(args, signal) {
  if (!args?.url || !args?.out_dir) throw new Error("url and out_dir are required");
  const meta = await runScript({
    url: args.url,
    out_dir: args.out_dir,
    out_name: args.out_name,
  }, signal);
  const dir = path.dirname(meta.files.raw);
  return {
    title: meta.title ?? "",
    date: meta.date ?? "",
    base: meta.base ?? "",
    out_dir: dir,
    raw_html: meta.files.raw,
    snapshot_html: meta.files.html,
    article_md: meta.files.article_md,
    meta_json: meta.files.meta ?? path.join(dir, meta.base + "-meta.json"),
    images: meta.files.images ?? [],
    needs_enrichment: true,
  };
}

export async function apply(ctx, config = {}) {
  const { defineTool } = await import("@deepseek-ai/dsh-tools");
  ctx.tools.register(defineTool({
    name: "web_archive",
    description,
    parameters: {
      url: {
        type: "string",
        required: true,
        description: "Full URL of the web page to archive.",
      },
      out_dir: {
        type: "string",
        description: "Directory for the archive product (default: <session cwd>/web-archive). Absolute path, or relative to the session working directory.",
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
          out_dir: { type: "string", required: true },
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
      const cwd = exec.agent?.session.header.cwd || process.cwd();
      const outDir = args.out_dir
        ? path.resolve(cwd, args.out_dir)
        : path.join(cwd, "web-archive");
      return runArchive(
        { url: args.url, out_dir: outDir, out_name: args.out_name },
        exec.signal,
      );
    },
  }));
}

export { name, inject };
