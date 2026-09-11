#!/usr/bin/env python3
"""vb-bugs.py — 抓 VB 專案的 bug，依「產品 × 狀態分組 × 優先度」聚合成矩陣。

對應 Confluence 上舊的 "mVB Suite Bug Ticket Overview by Platform"（VSFT 空間），
但**不是照抄**：新專案的欄位與狀態都不一樣，見下。

舊頁是 264 條 JQL 連結，每一格都要點出去才知道數字。這裡改成一次把票抓回來
在本地聚合（幾百筆、3 個 API 呼叫），所以每一格連「是哪幾張票」都留著，
頁面可以直接展開，不必跳去 Jira。

與舊頁的差異（查證日期 2026-09-11）：

  產品面   舊：Platform[Dropdown]（VSFT，單選，11 個平台值）
           新：Project（customfield_12435，**多選**）—— 沒有平台細分，
               myViewBoard 就是一個值，不再分 Windows／Flutter。
               多選票只取第一個值（Jay 2026-09-11 決定），未填的歸「未分類」。

  狀態     舊頁的 Open / In Progress / PENDING 在 VB 都不存在或拼法不同：
           VB 是「進行中」（中文）、「Pending」（非全大寫）、
           「STAGE READY(READY FOR QA)」（括號前沒有空格）。
           所以分組表照 VB 實際查到的狀態寫，不從舊頁搬。

認證：.env 的 ATLASSIAN_API_TOKEN ＋ ATLASSIAN_EMAIL。
**兩個都要** —— token 不自帶身分，Basic auth 的帳號欄位就是 email。
少了 email 時 Jira 回「0 筆」而不是 401，看起來像沒資料，所以這支會先打
/myself 驗身分，讓它在認證壞掉時**大聲失敗**。

用法：
  ./scripts/vb-bugs.py              # JSON 到 stdout
  ./scripts/vb-bugs.py --include-done   # 連已完成的也算（預設只看未完成）
"""

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SITE = "https://viewsonic-vsi.atlassian.net"
PROJECT = "VB"
PRODUCT_FIELD = "customfield_12435"  # VB 的「Project」欄位（多選）
UNCATEGORISED = "（未分類）"

# 優先度：欄。沿用舊頁的五級與顯示名。
PRIORITIES = [
    {"key": "Urgent", "label": "P0", "sub": "Urgent"},
    {"key": "Highest", "label": "P1", "sub": "Highest"},
    {"key": "High", "label": "High P2", "sub": "High"},
    {"key": "Medium", "label": "P2", "sub": "Medium"},
    {"key": "Low", "label": "P3", "sub": "Low"},
]

# 狀態分組：列。值是 VB 實際查到的狀態名，不是從舊頁搬過來的。
STATUS_GROUPS = [
    {"key": "todo", "label": "待處理",
     "statuses": ["BACKLOG", "待辦事項", "READY FOR DEV", "DISCOVERY/REFINEMENT"]},
    {"key": "in_progress", "label": "進行中",
     "statuses": ["進行中", "IN CODE REVIEW", "PR MERGED"]},
    {"key": "verifying", "label": "待驗證",
     "statuses": ["STAGE READY(READY FOR QA)", "TRACKING BY QA", "VERIFYING", "QA REJECT"]},
    {"key": "production_ready", "label": "Production Ready",
     "statuses": ["PRODUCTION READY", "QA ACCEPTED"]},
    {"key": "on_hold", "label": "擱置",
     "statuses": ["Pending", "Blocked"]},
]


def load_env() -> dict:
    env = {}
    p = Path(__file__).resolve().parent.parent / ".env"
    if p.exists():
        for line in p.read_text().splitlines():
            if line.strip() and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def auth_header() -> str:
    env = load_env()
    token = env.get("ATLASSIAN_API_TOKEN") or os.environ.get("ATLASSIAN_API_TOKEN")
    if not token:
        sys.exit("缺少 ATLASSIAN_API_TOKEN（見 .env.example）")
    email = env.get("ATLASSIAN_EMAIL") or os.environ.get("ATLASSIAN_EMAIL")
    if not email:
        email = subprocess.run(["git", "config", "user.email"],
                               capture_output=True, text=True).stdout.strip()
    if not email:
        sys.exit("缺少 ATLASSIAN_EMAIL（見 .env.example）—— token 不自帶身分，Basic auth 需要 email")
    return "Basic " + base64.b64encode(f"{email}:{token}".encode()).decode()


def api_get(path: str, params: dict, auth: str):
    url = f"{SITE}{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": auth, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def fetch_bugs(auth: str, include_done: bool) -> list:
    jql = f"project = {PROJECT} AND issuetype = Bug"
    if not include_done:
        jql += " AND statusCategory != Done"
    jql += " ORDER BY created DESC"

    issues, token = [], None
    while True:
        params = {
            "jql": jql,
            "maxResults": 100,
            "fields": f"summary,status,priority,created,updated,{PRODUCT_FIELD}",
        }
        if token:
            params["nextPageToken"] = token
        data = api_get("/rest/api/3/search/jql", params, auth)
        issues += data.get("issues", [])
        token = data.get("nextPageToken")
        if not token or data.get("isLast"):
            break
    return issues


def product_of(fields: dict) -> str:
    """多選欄位只取第一個值（Jay 2026-09-11 決定）；沒填的歸未分類。"""
    vals = fields.get(PRODUCT_FIELD) or []
    for v in vals:
        name = v.get("value") if isinstance(v, dict) else str(v)
        if name:
            return name
    return UNCATEGORISED


def main() -> None:
    include_done = "--include-done" in sys.argv[1:]
    auth = auth_header()

    # 先驗身分：認證壞掉時 Jira 會回「0 筆」而不是 401，不先擋就會產出一張
    # 全 0 的漂亮報表，看起來像「沒有 bug」。
    try:
        me = api_get("/rest/api/3/myself", {}, auth)
    except urllib.error.HTTPError as e:
        sys.exit(f"Atlassian 認證失敗（HTTP {e.code}）—— 檢查 .env 的 ATLASSIAN_EMAIL 與 TOKEN")
    if not me.get("accountId"):
        sys.exit("Atlassian 認證看起來沒過（/myself 沒有 accountId）")

    issues = fetch_bugs(auth, include_done)

    status_to_group = {}
    for g in STATUS_GROUPS:
        for st in g["statuses"]:
            status_to_group[st] = g["key"]

    products, unknown_statuses = {}, {}
    for issue in issues:
        f = issue["fields"]
        status = f["status"]["name"]
        group = status_to_group.get(status)
        if group is None:
            # 沒歸到任何一組的狀態要講出來，不要靜靜吞掉 —— 那代表分組表過期了
            unknown_statuses.setdefault(status, 0)
            unknown_statuses[status] += 1
            continue
        prio = (f.get("priority") or {}).get("name") or "Medium"
        if prio not in {p["key"] for p in PRIORITIES}:
            prio = "Medium"

        name = product_of(f)
        cells = products.setdefault(name, {})
        cell = cells.setdefault(f"{group}|{prio}", [])
        cell.append({
            "key": issue["key"],
            "summary": f.get("summary") or "",
            "status": status,
            "priority": prio,
            "updated": f.get("updated"),
            "url": f"{SITE}/browse/{issue['key']}",
        })

    out_products = []
    for name, cells in products.items():
        total = sum(len(v) for v in cells.values())
        out_products.append({
            "name": name,
            "total": total,
            "cells": {k: {"count": len(v), "issues": v} for k, v in cells.items()},
        })
    out_products.sort(key=lambda p: (p["name"] == UNCATEGORISED, -p["total"]))

    print(json.dumps({
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "fetchedAs": me.get("emailAddress") or me.get("accountId"),
        "project": PROJECT,
        "includeDone": include_done,
        "issueCount": len(issues),
        "priorities": PRIORITIES,
        "statusGroups": STATUS_GROUPS,
        "products": out_products,
        # 分組表沒涵蓋到的狀態。不是空的就代表 VB 加了新狀態，要回來補。
        "unmappedStatuses": unknown_statuses,
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
