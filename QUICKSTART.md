# Quick Start — dsh-plugin-web-archive

> 30 秒开始存档第一个网页。更完整文档见 `README.md` / `docs/ARCHITECTURE.md`。

## 0. 前置条件 (Prerequisites)

| 需要 | 说明 |
| --- | --- |
| DeepSeek Harness | 已安装并能运行 `dsh web` / headless |
| python3 + lxml | `python3 -m pip install lxml`（旧 mac python 若失败：`pip3 install --user lxml` 或 `brew install python@3.11`） |
| 一个 Tolaria vault | 本地目录即可（如 `~/tolaria`）；Tolaria MCP 可选——没配 MCP 时 agent 直接写 .md 文件，效果等价 |

## 1. 技能路线（推荐，零构建，一条命令）

```bash
git clone -q https://github.com/<owner>/dsh-plugin-web-archive.git  && mkdir -p ~/.agents/skills  && cp -R dsh-plugin-web-archive/skill/web-page-archive ~/.agents/skills/  && python3 -m pip install -q lxml  && echo "installed ✓"
```

重启 `dsh web`（或等 watcher 热加载）。之后在任意会话里直接说：

> 把 https://mp.weixin.qq.com/s/... 存档到我的 Tolaria，标签加：创业、AI harness

模型会自动加载 `web-page-archive` skill 并完成五步：抓取 → 忠实保存（raw HTML + 图片 + 自包含快照）→ 逐字转写 Markdown → 提取标签/摘要 → 写入 Tolaria 笔记（含 `web-archive` 标签）。

## 2. 不启动 DSH 也能验证 (Smoke test)

```bash
python3 dsh-plugin-web-archive/skill/web-page-archive/scripts/archive_page.py https://example.com ~/tolaria
# 输出 JSON（title / date / files / suggested_note）；attachments/ 下生成：
#   <base>-raw.html  原样快照
#   <base>.html      自包含离线快照（本地图片、无脚本、正文可见）
#   <base>-article.md  逐字 Markdown
#   <base>-meta.json   元数据
```

## 3. 工具插件路线（可选：一行调用）

```bash
cd ~/.dsh/profiles/web
pnpm add github:<owner>/dsh-plugin-web-archive   # 已发布 npm 时：pnpm add dsh-plugin-web-archive
```

`cordis.patch.yml` 追加后重启 `dsh web`：

```yaml
- insert:
    - id: web-archive
      name: 'dsh-plugin-web-archive'
      config:
        vaultPath: /Users/you/tolaria
```

模型即可一次调用 `web_archive`（url / vault / tags），返回 `needs_enrichment: true`，随后自动补充标签与摘要。

## 4. 还没推到 GitHub / npm 时怎么分享

```bash
cd dsh-plugin-web-archive && git archive --format=zip HEAD -o dsh-plugin-web-archive.zip
```

对方解压后按第 1 步安装（把 git clone 换成解压目录；第 3 步把 `github:<owner>/...` 换成 `file:/path/to/repo`）。

## 5. 常见问题 (Troubleshooting)

- **微信文章报 NEEDS_BROWSER / 环境异常**：属预期检测（反爬验证页）。skill 会提示用 agent-browser 渲染后 `--from-file` 续跑；先装 `agent-browser` skill 即可自动兜底。
- **技能没出现在模型列表**：确认 `~/.agents/skills/web-page-archive/SKILL.md` 存在 + 重启 `dsh web`（watcher 热加载）。
- **写入 vault 被拒绝**：vault 在会话工作区外时需更宽文件沙箱许可——走批准流程，不要绕过（skill 文档同样写明）。
- **lxml 装不上**：macOS 系统 python 用 `pip3 install --user lxml`，或 `brew install python@3.11` 后再 pip。
- **只看图/只存文**：快照已本地化全部配图；原图 CDN 地址保留在 `data-original-src` 与笔记元数据中。
