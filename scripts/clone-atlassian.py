#!/usr/bin/env python3
"""把 Jira issue / Confluence 頁面 clone 成本機 md（含 SOURCE TRACKING 區塊）。

用法：
    python3 scripts/clone-atlassian.py jira  <輸出目錄> VSFT-10067 VSFT-10065 ...
    python3 scripts/clone-atlassian.py conf  <輸出目錄> 606765141 606568769 ...

認證讀 .env 的 ATLASSIAN_API_TOKEN（絕不印出）。email 讀 ATLASSIAN_EMAIL，
沒設就用 git config user.email。

為什麼是 script 而不是 MCP：re-clone 是週期性動作，六張票＋三頁 spec 一次抓完，
且輸出格式要穩定可 diff（git history 才看得出「規格改了什麼」）。
"""
import json, os, re, sys, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

SITE = "https://viewsonic-vsi.atlassian.net"


def load_env():
    env = {}
    p = Path(__file__).resolve().parent.parent / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def api(path, params=None):
    env = load_env()
    token = env.get("ATLASSIAN_API_TOKEN") or os.environ.get("ATLASSIAN_API_TOKEN")
    if not token:
        sys.exit("缺少 ATLASSIAN_API_TOKEN（見 .env.example）")
    email = env.get("ATLASSIAN_EMAIL") or os.environ.get("ATLASSIAN_EMAIL")
    if not email:
        import subprocess
        email = subprocess.run(["git", "config", "user.email"],
                               capture_output=True, text=True).stdout.strip()
    url = SITE + path + ("?" + urllib.parse.urlencode(params) if params else "")
    import base64
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    req = urllib.request.Request(url, headers={
        "Authorization": f"Basic {auth}", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def adf_to_md(node, depth=0):
    """Atlassian Document Format → markdown。只處理實際出現過的節點型別。"""
    if node is None:
        return ""
    t = node.get("type")
    content = node.get("content", []) or []
    inner = "".join(adf_to_md(c, depth) for c in content)

    if t == "doc":
        return inner
    if t == "paragraph":
        return inner + "\n\n"
    if t == "text":
        txt = node.get("text", "")
        for m in node.get("marks", []) or []:
            mt = m.get("type")
            if mt == "strong":
                txt = f"**{txt}**"
            elif mt == "em":
                txt = f"*{txt}*"
            elif mt == "code":
                txt = f"`{txt}`"
            elif mt == "strike":
                txt = f"~~{txt}~~"
            elif mt == "link":
                txt = f"[{txt}]({m.get('attrs', {}).get('href', '')})"
        return txt
    if t == "heading":
        lvl = node.get("attrs", {}).get("level", 1)
        return "#" * lvl + " " + inner.strip() + "\n\n"
    if t == "bulletList":
        return "".join(f"- {adf_to_md(li, depth).strip()}\n" for li in content) + "\n"
    if t == "orderedList":
        return "".join(f"{i}. {adf_to_md(li, depth).strip()}\n"
                       for i, li in enumerate(content, 1)) + "\n"
    if t == "listItem":
        return inner.strip()
    if t == "codeBlock":
        lang = node.get("attrs", {}).get("language", "")
        return f"```{lang}\n{inner.rstrip()}\n```\n\n"
    if t == "blockquote":
        return "".join(f"> {l}\n" for l in inner.strip().split("\n")) + "\n"
    if t == "rule":
        return "---\n\n"
    if t == "hardBreak":
        return "\n"
    if t == "table":
        rows = []
        for row in content:
            cells = [adf_to_md(c, depth).strip().replace("\n", " ") for c in row.get("content", [])]
            rows.append("| " + " | ".join(cells) + " |")
            if row.get("content") and row["content"][0].get("type") == "tableHeader" and len(rows) == 1:
                rows.append("|" + "---|" * len(cells))
        return "\n".join(rows) + "\n\n"
    if t in ("tableRow", "tableCell", "tableHeader"):
        return inner
    if t == "panel":
        return "> " + inner.strip().replace("\n", "\n> ") + "\n\n"
    if t == "mediaSingle" or t == "media":
        return "*(圖片，見原始頁面)*\n\n"
    if t == "inlineCard":
        return node.get("attrs", {}).get("url", "")
    if t == "status":
        return f"`{node.get('attrs', {}).get('text', '')}`"
    if t == "emoji":
        return node.get("attrs", {}).get("text", "")
    if t == "mention":
        return "@" + node.get("attrs", {}).get("text", "").lstrip("@")
    if t == "expand" or t == "nestedExpand":
        title = node.get("attrs", {}).get("title", "展開")
        return f"<details><summary>{title}</summary>\n\n{inner}\n</details>\n\n"
    return inner


def render_comments(comment_field):
    """留言常是決策的唯一落點（缺陷分析、PM 裁決、驗證紀錄），所以一起 clone。

    只保留作者 / 時間 / 內容 —— 留言 id 與 self link 對閱讀沒有幫助，
    而且會在每次 re-clone 的 diff 裡製造噪音。
    """
    comments = comment_field.get("comments") or []
    if not comments:
        return "\n## Comments\n\n*（無留言）*\n"
    out = [f"\n## Comments（{len(comments)} 則）\n"]
    for c in comments:
        who = (c.get("author") or {}).get("displayName", "—")
        when = c.get("created", "")[:19].replace("T", " ")
        body = adf_to_md(c.get("body")).strip()
        out.append(f"### {when} · {who}\n\n{body}\n")
    return "\n".join(out)


def stamp(kind, ident, url, extra, version, today):
    rows = "\n".join(f"{k:<16}{v}" for k, v in extra.items())
    return f"""<!--
==============================================================
SOURCE TRACKING — 更新來源後請同步更新此區塊與內文
==============================================================

{kind:<16}{ident}
url:            {url}
{rows}
cloned_version: {version}
cloned_at:      {today}

Maintenance rule: 重新 clone 前先看 git diff，若本機有補充註解要先 commit；
                  版號與 cloned_at 一起更新，commit 訊息附來源 URL。
                  取得方式：python3 scripts/clone-atlassian.py …（見該檔 docstring）
==============================================================
-->
"""


def clone_jira(outdir, keys):
    today = date.today().isoformat()
    for key in keys:
        d = api(f"/rest/api/3/issue/{key}",
                {"fields": "summary,description,status,issuetype,priority,assignee,"
                           "reporter,created,updated,labels,resolution,parent,comment"})
        f = d["fields"]
        url = f"{SITE}/browse/{key}"
        body = adf_to_md(f.get("description"))
        who = lambda u: f"{u['displayName']} ({u.get('emailAddress', '—')})" if u else "—"
        st = f["status"]
        md = stamp("issue_key:", key, url, {
            "issue_type:": f["issuetype"]["name"],
            "status:": f"{st['name']}（{st['statusCategory']['name']}）",
            "comments:": str(len((f.get("comment") or {}).get("comments") or [])),
        }, 1, today)
        md += f"""
> | 來源 issue | issue_key | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [{key}]({url}) | {key} | v1 | {today} |

# {key}

## Summary

{f['summary']}

## Metadata

| 欄位 | 值 |
| --- | --- |
| Status | {st['name']}（{st['statusCategory']['name']}） |
| Issue Type | {f['issuetype']['name']} |
| Priority | {f.get('priority', {}).get('name', '—') if f.get('priority') else '—'} |
| Assignee | {who(f.get('assignee'))} |
| Reporter | {who(f.get('reporter'))} |
| Created | {f['created'][:19].replace('T', ' ')} |
| Updated | {f['updated'][:19].replace('T', ' ')} |
| Labels | {', '.join(f.get('labels') or []) or '—'} |

## Description

{body.strip()}
"""
        md += render_comments(f.get("comment") or {})
        out = Path(outdir) / f"{key}.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        print(f"  ✅ {out}  ({len(md.splitlines())} 行)")


def clone_conf(outdir, page_ids):
    today = date.today().isoformat()
    for pid in page_ids:
        d = api(f"/wiki/api/v2/pages/{pid}", {"body-format": "atlas_doc_format"})
        title = d["title"]
        ver = d["version"]["number"]
        url = f"{SITE}/wiki/spaces/_/pages/{pid}"
        adf = json.loads(d["body"]["atlas_doc_format"]["value"])
        body = adf_to_md(adf)
        slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60] or f"page-{pid}"
        md = stamp("page_id:", pid, url, {
            "title:": title,
            "space_id:": str(d.get("spaceId", "—")),
        }, ver, today)
        md += f"""
> | 來源頁面 | page_id | clone 版本 | clone 日期 |
> |---|---|---|---|
> | [{title}]({url}) | {pid} | v{ver} | {today} |

# {title}

{body.strip()}
"""
        out = Path(outdir) / f"{slug}.md"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(md, encoding="utf-8")
        print(f"  ✅ {out}  ({len(md.splitlines())} 行, Confluence v{ver})")


if __name__ == "__main__":
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    mode, outdir, *ids = sys.argv[1:]
    (clone_jira if mode == "jira" else clone_conf)(outdir, ids)
