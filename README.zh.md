# dsh-plugin-web-archive（中文文档）

> **项目定位：忠实、完整地把网页内容本地存储，沉淀形成属于自己的文档库。** 把任意网页完整存档——原始 HTML + 本地图片 + 离线自包含快照 + 逐字 Markdown——再通过 Tolaria MCP 把带 `web-archive` 标签的笔记写入知识库：读过的网页不再随链接失效而消失。
> **Tolaria 对 AI 模型友好**：笔记是带结构化 frontmatter 的纯 Markdown，agent 可解析、可检索、可管理——符合「AI 模型管理文档」的发展趋势。
>
> English: [README.md](README.md)

## 为什么做这件事

读过网页之后，留下来的应该是一份**本地可信的存档**，而不是一段会过期的链接：

- 全文、图片、原页面 HTML 全部落地，离线也能看；
- 转写为逐字 Markdown，人可读、agent 可解析；
- 存入 Tolaria 知识库时带 `web-archive` 标签与完整元数据；
- **沉淀属于自己的文档库**：每一篇被存档的网页都是你个人知识资产的一部分，不依赖第三方链接存续；
- **Tolaria 是 AI 模型友好的知识库**：纯 Markdown + 结构化 frontmatter，agent 能稳定解析与持续管理——这正是 AI 模型管理文档趋势下知识库应有的形态。

## 关键设计：官方分工

| 阶段 | 谁来做 | 产物落在哪 |
| --- | --- | --- |
| ① 读取网页 | 插件脚本（浏览器 UA 直连；JS 渲染/反爬页 → `NEEDS_BROWSER`） | — |
| ② 忠实保存 | 插件脚本 | **会话当前工作目录** `web-archive/<date>-<site>-<token>/`：raw.html + 全部配图 + 自包含快照 |
| ③ 逐字转写 | 插件脚本（正文选区启发式；图片转本地引用；原图 CDN 保留在 meta.json） | `.../article.md` + `.../meta.json` |
| ④ 语义提取 | **LLM（对话中）**：内容标签、摘要、关键信息 | 笔记的 tags / Summary / 关键信息 |
| ⑤ 写入 Tolaria | **agent 经 Tolaria MCP**（`mcp__tolaria__create_note` 等），不做任何 vault 直写 | vault `<year>/<date>-<slug>.md` |

**原则**：确定性的保真工作（抓取/解析/下载/转写/校验）交给脚本；语义判断（标签/摘要/关键信息）与知识库写入交给模型 + Tolaria MCP。插件站点无关、永不直接触碰 vault。

## 安装

**前置条件**

- DeepSeek Harness（`dsh`）已安装（node ≥ 20）
- `python3` + `lxml`：`python3 -m pip install lxml`
- Tolaria MCP 已挂载进 dsh（官方 `@deepseek-ai/dsh-mcp-client` + profile `cordis.patch.yml` 的 `mcp-tolaria` 条目）——vault 写入依赖它
- 工具插件路线需要 `pnpm` 在 PATH：`npm i -g pnpm`，并把 `~/.npm-global/bin` 加入 PATH

### 路径 A：Skill（零构建，推荐先用）

```bash
mkdir -p ~/.agents/skills
cp -R skill/web-page-archive ~/.agents/skills/
```

重启 `dsh web`（或等文件系统 watcher 热加载）。模型目录出现 `web-page-archive` 后，会话里直接说：

> 把 https://mp.weixin.qq.com/s/... 存档，标签加：创业、AI harness

### 路径 B：工具插件（官方命令，一次调用）

```bash
dsh plugin --profile web add file:/path/to/dsh-plugin-web-archive
```

`cordis.patch.yml` 追加（与官方 `mcp-tolaria` 条目同构）：

```yaml
- insert:
    - id: web-archive
      name: 'dsh-plugin-web-archive'
```

重启 `dsh web`。模型即可调用 `web_archive`：

```json
{"url": "https://mp.weixin.qq.com/s/..."}
```

> 官方提示：未声明 `dsh.bundle` 时按**普通依赖 + patch insert** 加载（即本插件的用法，与官方 mcp-client 一致）；声明 `dsh.bundle` 可升级为 profile layer（进阶可选）。

## 使用说明

- 工具产物：默认落 `<会话 cwd>/web-archive/<base>/`，可用 `out_dir` 参数指定（相对 cwd 或绝对路径）；`base` 形如 `2026-08-25-wechat-<token>`。
- 工具返回 `needs_enrichment: true`：表示确定性存档完成、语义层（标签/摘要/关键信息）待模型补齐——模型随后用 Tolaria MCP 组装笔记。
- 笔记（经 MCP 写入）：frontmatter 含 `archive: web-archive` + `tags`（必含 **`web-archive`** 英文标识 + 用户标签 + 站点标签 + 内容标签）+ `url`/`source`/`captured`；正文 = Status/Summary/Archive-note 块 → 元数据表 → 关键信息 → **完整原文（一字不改）**。笔记内图片用原图 CDN 链接（MCP 不收二进制附件；本地副本在 cwd 产品中，原图清单在 meta.json `image_originals`）。

## 归档产物结构

```
web-archive/2026-08-25-wechat-<token>/
├── 2026-08-25-wechat-<token>-raw.html     # 原样快照（防 CDN 失效）
├── 2026-08-25-wechat-<token>.html         # 自包含离线快照（本地图、无脚本、正文可见）
├── 2026-08-25-wechat-<token>-article.md   # 逐字转写（图片本地引用）
├── 2026-08-25-wechat-<token>-meta.json    # 元数据 + files 绝对路径 + image_originals
└── 2026-08-25-wechat-<token>-imgNN.*      # 全部配图
```

## 验证状态

- 已在真实 dsh profile（web + headless）用**官方命令**安装并注册；对运行时自身的 `@deepseek-ai/dsh-tools` 通过 apply/execute 集成验证。
- 真实 headless 会话复现了完整流程：`web_archive` 落产物到 cwd → Tolaria MCP 写入带 `web-archive` 标签、含 LLM 摘要与完整正文的笔记（85 段落比对 0 缺失，16 处问答齐全）。

## 测试

```bash
npm test                          # 产品落 /tmp/dsh-web-archive-test，产物完整性自检
node tests/run-archive.mjs <url> <out_dir>
```

## 目录结构

| 路径 | 说明 |
| --- | --- |
| `index.js` | Cordis 插件：注册 `web_archive`（`defineTool`，形态对齐官方 `dsh-tool-ask-user`/`dsh-skill-filesystem`） |
| `skill/web-page-archive/SKILL.md` | 可复制的 DSH skill 指令（五阶段 + 校验清单 + 边界） |
| `skill/web-page-archive/scripts/archive_page.py` | 归档脚本唯一事实源（插件与 skill 共用） |
| `tests/run-archive.mjs` | 无需 DSH 运行时的端到端冒烟测试 |
| `docs/ARCHITECTURE.md` / `docs/ARCHITECTURE.zh.md` | 架构文档（英/中） |
| `QUICKSTART.md` | 30 秒上手 |

## 边界与诚实性

- 原文逐字保留；摘要/元数据只是附加层；受限访问（会员/登录页）标注 `access: partial`，不假装完整。
- v1 限制：表格类布局转 Markdown 较扁平；PDF/视频不支持；JS 渲染页需 skill 路线浏览器兜底（工具返回 `NEEDS_BROWSER`）。
- 插件只写会话工作目录；写入知识库一律走 Tolaria MCP。

## 常见问题

- 微信文章报 `NEEDS_BROWSER` / 环境异常 → 预期检测（反爬验证页）；用 agent-browser 渲染后 `--from-file` 续跑（skill 已写明）。
- 技能没出现在模型列表 → 确认 `~/.agents/skills/web-page-archive/SKILL.md` 存在 + 重启 `dsh web`。
- Tolaria MCP 未挂载 → 写入必须走 `mcp__tolaria__*`；没有 MCP 时 agent 应告知用户，而不是直接改 vault 文件。
- `lxml` 装不上 → macOS 旧 python 用 `pip3 install --user lxml` 或 `brew install python@3.11`。

## License

MIT
