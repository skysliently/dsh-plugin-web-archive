// End-to-end smoke test for runArchive (no DSH runtime needed).
// Product lands in OUT_DIR; the note is written by the agent via Tolaria MCP (not this tool).
// Usage: node tests/run-archive.mjs [url] [out_dir]
import { runArchive } from "../index.js";
import fs from "node:fs";

const url = process.argv[2] ?? "https://example.com";
const outDir = process.argv[3] ?? "/tmp/dsh-web-archive-test";

const result = await runArchive({ url, out_dir: outDir });
console.log(JSON.stringify(result, null, 2));

for (const p of [result.raw_html, result.snapshot_html, result.article_md, result.meta_json, ...result.images]) {
  if (!fs.existsSync(p)) throw new Error("missing artifact: " + p);
}
const meta = JSON.parse(fs.readFileSync(result.meta_json, "utf8"));
if (!meta.files?.images?.length) throw new Error("meta.json missing image list");
if (result.needs_enrichment !== true) throw new Error("missing needs_enrichment signal");
console.log("OK: archive product complete in", result.out_dir);
