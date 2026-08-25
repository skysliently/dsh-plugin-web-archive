// End-to-end smoke test for runArchive (no DSH runtime needed).
// Usage: node tests/run-archive.mjs [url] [vault]
import { runArchive } from "../index.js";
import fs from "node:fs";

const url = process.argv[2] ?? "https://example.com";
const vault = process.argv[3] ?? "/tmp/dsh-web-archive-test";

const result = await runArchive({ url, vault, tags: ["test-tag"] });
console.log(JSON.stringify(result, null, 2));

for (const p of [result.note_path, result.raw_html, result.snapshot_html, result.article_md, result.meta_json]) {
  if (!fs.existsSync(p)) throw new Error("missing artifact: " + p);
}
const note = fs.readFileSync(result.note_path, "utf8");
if (!note.includes("web-archive")) throw new Error("note is missing the web-archive tag");
if (!note.includes("归档正文")) throw new Error("note is missing the archived body");
console.log("OK artifacts + note verified");
