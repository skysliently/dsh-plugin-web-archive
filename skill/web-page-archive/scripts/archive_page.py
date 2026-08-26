#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""archive_page.py — generic web page archiver (phase 1-3 of the web-archive workflow).

Read a web page, faithfully save it (raw HTML + images + self-contained snapshot),
transcribe the main content verbatim into Markdown, and emit meta.json + a JSON report.

Usage:
  python3 archive_page.py <url> <out_dir> [--out-name <base>]
  python3 archive_page.py --from-file <rendered.html> <out_dir> <url> [--out-name <base>]

Artifacts are written under <out_dir>/<base>/ (raw.html / <base>.html / article.md / meta.json / imgNN.*).

Exit codes: 0 ok | 2 NEEDS_BROWSER (JS-only / anti-bot page) | 3 NO_CONTENT | 4 IO
"""
import sys, os, re, json, hashlib
import urllib.request
import urllib.parse

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36")
SEP = chr(10)

def http_get(url, timeout=60, referer=None):
    headers = {"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9"}
    if referer: headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")

def http_get_bytes(url, timeout=60, referer=None):
    headers = {"User-Agent": UA}
    if referer: headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()

def fetch(url):
    html = http_get(url)
    # generic JS-only / anti-bot detection -> needs browser
    body_text = re.sub(r"<[^>]+>", " ", html)
    body_text = re.sub(r"\s+", " ", body_text).strip()
    if ("环境异常" in html[:8000]
            or ("just a moment" in html[:2000].lower() and "cf-browser-verification" in html.lower())
            or (len(body_text) < 300 and "<article" not in html and "js_content" not in html)):
        sys.exit(2)  # NEEDS_BROWSER
    return html

def parse(raw, url):
    from lxml import html as lh
    doc = lh.fromstring(raw)
    def meta(prop=None, name=None):
        if prop:
            els = doc.xpath('//meta[@property=%s]/@content' % repr(prop))
        else:
            els = doc.xpath('//meta[@name=%s]/@content' % repr(name))
        return els[0].strip() if els else None
    def xfirst(xp):
        els = doc.xpath(xp)
        return els[0].text_content().strip() if els else None
    m = {}
    m["title"] = (xfirst('//*[@id="activity-name"]') or xfirst('//h1[@id="activity-name"]')
                  or meta(prop="og:title") or meta(name="twitter:title")
                  or xfirst('//title'))
    m["desc"] = meta(prop="og:description") or meta(name="description")
    m["site"] = (meta(prop="og:site_name") or urllib.parse.urlparse(url).netloc or "")
    domain = urllib.parse.urlparse(url).netloc.lower()
    m["domain"] = domain
    m["author"] = xfirst('//*[@id="js_author_name"]') or meta(name="author")
    m["publish_time"] = (meta(prop="article:published_time") or meta(name="date")
                         or meta(name="pubdate") or xfirst('//*[@id="publish_time"]')
                         or xfirst('//time[@datetime]'))
    mm = re.search(r"var createTime = '([^']*)'", raw)
    if mm: m["publish_time"] = mm.group(1)
    m["url"] = url
    content = None
    for sel in ('//*[@id="js_content"]', '//article', '//main', '//*[@id="content"]',
                '//*[@class="post-content"]', '//*[contains(@class,"article-content")]'):
        els = doc.xpath(sel)
        if els:
            text = re.sub(r"\s+", " ", els[0].text_content()).strip()
            if len(text) > 300:
                content = els[0]
                m["main_selector"] = sel
                break
    if content is None:
        # fallback: body minus chrome
        body = doc.xpath('//body')[0] if doc.xpath('//body') else None
        if body is None: sys.exit(3)
        for bad in ('//script', '//style', '//noscript', '//nav', '//header', '//footer',
                    '//aside', '//iframe', '//form', '//svg', '//button'):
            for el in body.xpath(bad):
                el.getparent().remove(el)
        content = body
        m["main_selector"] = "body-fallback"
    return m, content

BLOCK = {'p','div','section','article','figure','figcaption','blockquote','ul','ol','li',
         'h1','h2','h3','h4','h5','h6','hr','table'}

def body_to_markdown(content):
    imgs = []
    def inline(el):
        parts = [el.text or '']
        for ch in el:
            parts.append(inline_tag(ch)); parts.append(ch.tail or '')
        return ''.join(parts)
    def inline_tag(ch):
        if not isinstance(ch.tag, str): return ch.text or ''
        t = ch.tag.lower()
        if t == 'br': return SEP
        if t == 'img':
            src = ch.get('data-src') or ch.get('src') or ''
            alt = ch.get('alt') or ''
            if 'emoji' in (ch.get('class') or '') or 'emoji' in (ch.get('data-type') or '') or src.startswith('data:'):
                return alt
            if src:
                imgs.append(src)
                return '![{{IMG' + str(len(imgs) - 1) + '}}]'
            return alt
        if t in ('strong','b','em','i','u','s','del','span','sup','sub','big','small','font'):
            inner = inline(ch)
            if t in ('strong','b'): return ('**' + inner + '**') if inner.strip() else ''
            if t in ('em','i'): return ('*' + inner + '*') if inner.strip() else ''
            return inner
        if t == 'code':
            return '\u0060' + inline(ch) + '\u0060'
        if t == 'a':
            href = ch.get('href') or ''
            inner = inline(ch)
            return ('[' + inner + '](' + href + ')') if inner.strip() else ''
        return inline(ch)
    def clean(txt):
        return SEP.join(re.sub('[' + chr(32) + chr(9) + chr(160) + ']+', ' ', ln) for ln in txt.split(SEP)).strip()
    out = []
    def mdify(el, out, depth=0):
        for c in el:
            if not isinstance(c.tag, str): continue
            t = c.tag.lower()
            if t in ('script','style','noscript','audio','video','iframe','source','button','form'): continue
            if t == 'img':
                src = c.get('data-src') or c.get('src') or ''
                if 'emoji' in (c.get('class') or '') or 'emoji' in (c.get('data-type') or '') or src.startswith('data:'): continue
                if src:
                    imgs.append(src)
                    out.append('![{{IMG' + str(len(imgs) - 1) + '}}]'); out.append('')
                continue
            if t == 'br': out.append(''); continue
            if t in ('h1','h2','h3','h4','h5','h6'):
                out.append('#' * int(t[1]) + ' ' + clean(inline(c))); out.append(''); continue
            if t == 'blockquote':
                q = []; mdify(c, q, depth + 1)
                for ln in clean(SEP.join(q)).split(SEP):
                    if ln.strip(): out.append('> ' + ln.strip())
                out.append(''); continue
            if t in ('ul','ol'):
                for li in c:
                    if not isinstance(li.tag, str) or li.tag.lower() != 'li': continue
                    sub = []
                    if any(isinstance(cc.tag, str) and cc.tag.lower() in BLOCK for cc in li):
                        mdify(li, sub, depth + 1)
                        out.append(('  ' * depth) + '- ' + clean(inline(li)).split(SEP)[0]); out.append(''); out.extend(sub)
                    else:
                        out.append(('  ' * depth) + '- ' + clean(inline(li))); out.append('')
                continue
            if t in ('p','section','div','article','figure','figcaption','li','td','th','tr','table','tbody','thead'):
                has_block = any(isinstance(cc.tag, str) and cc.tag.lower() in BLOCK for cc in c) or t == 'figure'
                if has_block: mdify(c, out, depth)
                else:
                    txt = clean(inline(c))
                    if txt: out.append(txt); out.append('')
                continue
            txt = clean(inline(c))
            if txt: out.append(txt); out.append('')
    mdify(content, out)
    text = re.sub('(?:' + SEP + '){3,}', SEP + SEP, SEP.join(out))
    if len(text) < 100: sys.exit(3)
    return text, imgs

def self_contain_html(raw, img_pairs, title, page_url):
    from lxml import html as lh, etree
    root = lh.fromstring(raw)
    for s in root.xpath('//script'):
        s.getparent().remove(s)
    for jc in root.xpath('//*[@id="js_content"] | //article | //main'):
        st = jc.get('style') or ''
        if 'visibility: hidden' in st: st = st.replace('visibility: hidden', 'visibility: visible')
        if 'opacity: 0' in st: st = st.replace('opacity: 0', 'opacity: 1')
        jc.set('style', st)
    def resolve(u):
        if not u or u.startswith('data:'): return ''
        if u.startswith('//'): return 'https:' + u
        if not u.startswith('http'): return urllib.parse.urljoin(page_url, u)
        return u
    for im in root.xpath('//img'):
        ds = im.get('data-src') or ''
        src = im.get('src') or ''
        cand = resolve(ds or src)
        key = None
        for j, pair in enumerate(img_pairs):
            if pair[0] in ds or pair[0] in src or pair[0] == cand or (cand and pair[0] in cand): key = j; break
        if key is not None:
            im.set('src', img_pairs[key][1])
            if ds: im.set('data-original-src', ds)
        else:
            real = resolve(ds or src)
            if real: im.set('src', real)
        for a in ('data-src','data-w','data-h'):
            if im.get(a) is not None and a != 'data-original-src': del im.attrib[a]
    for a in root.xpath('//a[@href]'):
        h = a.get('href')
        if h and h.startswith('//'): a.set('href', 'https:' + h)
    for l in root.xpath('//link[@href]'):
        h = l.get('href')
        if h and h.startswith('//'): l.set('href', 'https:' + h)
    t = root.xpath('//title')
    if t: t[0].text = title
    head = root.xpath('//head')[0] if root.xpath('//head') else root
    st = etree.SubElement(head, 'style')
    st.text = ("html,body{opacity:1!important;visibility:visible!important;background:#fff!important}"
               "img{max-width:100%!important;height:auto!important;display:block;margin:8px auto}"
               "body{font-family:-apple-system,'Helvetica Neue','PingFang SC','Microsoft YaHei',sans-serif;"
               "color:#333;font-size:16px;line-height:1.8;padding:0 8px}"
               "h1{font-size:22px;color:#222;line-height:1.5;margin:20px 0 10px}")
    return etree.tostring(root, encoding='UTF-8', method='html')

def slugify(s, maxlen=48):
    s = re.sub(r'[^A-Za-z0-9]+', '-', s).strip('-').lower()
    return s[:maxlen].strip('-') or 'page'

def main():
    args = sys.argv[1:]
    from_file = None
    if args and args[0] == '--from-file':
        from_file = args[1]; url = args[3] if len(args) > 3 else ''
        out_dir = args[2]
        rest = args[4:]
        raw = open(from_file, encoding='utf-8').read()
    else:
        if len(args) < 2:
            print(__doc__); sys.exit(1)
        url, out_dir = args[0], args[1]
        raw = fetch(url)
        rest = args[2:]
    out_name = None
    if '--out-name' in rest:
        i = rest.index('--out-name'); out_name = rest[i + 1]
    m, content = parse(raw, url)
    date = ''
    if m.get('publish_time'):
        mm = re.search(r'(\d{4})-(\d{2})-(\d{2})', m['publish_time'])
        if mm: date = mm.group(0)
    if not date:
        import datetime
        date = datetime.datetime.now().isoformat()[:10]
    text, img_urls = body_to_markdown(content)
    img_urls = [urllib.parse.urljoin(url, u) for u in img_urls]
    token = re.search(r'/s/([A-Za-z0-9_-]+)', url)
    token = token.group(1).lower() if token else hashlib.md5(url.encode()).hexdigest()[:12]
    DOMAIN_SLUGS = {'mp.weixin.qq.com': 'wechat'}
    host = urllib.parse.urlparse(url).netloc.replace('www.', '').lower()
    domain_slug = DOMAIN_SLUGS.get(host) or slugify(host.split('.')[0])
    base = out_name or (date + '-' + domain_slug + '-' + token)
    out = os.path.join(out_dir, base)
    os.makedirs(out, exist_ok=True)
    raw_path = os.path.join(out, base + '-raw.html')
    if not os.path.exists(raw_path):
        open(raw_path, 'w', encoding='utf-8').write(raw)
    pairs = []
    for i, u in enumerate(img_urls):
        q = u.split('?')
        ext = ('gif' if 'gif' in q[1] else ('jpeg' if 'jpeg' in q[1] else 'png')) if len(q) > 1 else 'png'
        fname = base + '-img%02d.' % i + ext
        path = os.path.join(out, fname)
        if not os.path.exists(path):
            open(path, 'wb').write(http_get_bytes(u, referer=url))
        pairs.append((u, fname, path))
    html_path = os.path.join(out, base + '.html')
    open(html_path, 'wb').write(self_contain_html(raw, pairs, m.get('title') or '', url))
    for i, pair in enumerate(pairs):
        text = text.replace('![{{IMG' + str(i) + '}}]', '![' + pair[1] + ']')
    md_path = os.path.join(out, base + '-article.md')
    open(md_path, 'w', encoding='utf-8').write(text)
    meta = dict(m)
    meta['date'] = date
    meta['base'] = base
    meta['word_count'] = len(re.sub(r'\s+', '', text))
    meta['image_count'] = len(pairs)
    meta['files'] = {'raw': raw_path, 'html': html_path, 'article_md': md_path,
                     'images': [p[2] for p in pairs]}
    meta['image_originals'] = [p[0] for p in pairs]
    meta['suggested_note'] = date + '-' + slugify(m.get('title') or base, 60) + '.md'
    meta_path = os.path.join(out, base + '-meta.json')
    open(meta_path, 'w', encoding='utf-8').write(json.dumps(meta, ensure_ascii=False, indent=2))
    print(json.dumps(meta, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try:
        main()
    except SystemExit as e:
        if str(e) == '2': print('NEEDS_BROWSER: JS-only / anti-bot page - render via agent-browser then --from-file'); sys.exit(2)
        if str(e) == '3': print('NO_CONTENT: main content not found in page'); sys.exit(3)
        raise
