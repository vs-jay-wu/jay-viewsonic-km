#!/usr/bin/env python3
"""抓 VB 上**所有未完成的單**（不分指派給誰），增量更新。

為什麼不只抓「指派給我」：Jay 要能看任何人的單，而且**不想特地去選人**
（2026-09-11）。實測 VB 未完成的單共 673 筆（全部 2044 筆），全抓一次只要
7 次 API 呼叫，之後走增量就只有變動的那幾筆 —— 那就整份放進快照，
畫面預設只看指派給我的，要看別人的就切篩選或直接搜名字。

跟 `vb-bugs.py` 同一套規則（增量游標、夜間全同步窗口、過了不補），
**認證與時間處理直接重用那支腳本的函式**，不另外複製一份 —— 複製就會漂移。

只看 VB（Jay 2026-09-11）：VSFT／MT 是舊落點，大部分票已經搬到 VB。

用法：
    ./scripts/my-tickets.py --state data/local-state/my-tickets.json [--full]

輸出（stdout）是完整的快照 JSON，呼叫端負責寫檔。
"""

import importlib.util
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent


def _load_vb_bugs():
    """檔名有連字號，import 不進來，所以用 importlib 直接指檔案。"""
    spec = importlib.util.spec_from_file_location("vb_bugs", HERE / "vb-bugs.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


vb = _load_vb_bugs()

PROJECT = "VB"
FIELDS = f"summary,status,priority,updated,issuetype,assignee,reporter,{vb.PRODUCT_FIELD}"


def person(value) -> dict:
    """指派人／回報人。accountId 用來判斷「是不是我」，比對名字會踩到同名。"""
    if not value:
        return {"name": "", "accountId": ""}
    return {
        "name": value.get("displayName") or value.get("emailAddress") or "",
        "accountId": value.get("accountId") or "",
    }


def to_row(issue: dict, my_account_id: str) -> dict:
    f = issue["fields"]
    assignee = person(f.get("assignee"))
    return {
        "key": issue["key"],
        "summary": f.get("summary") or "",
        "status": f["status"]["name"],
        "statusCategory": f["status"]["statusCategory"]["name"],
        "priority": (f.get("priority") or {}).get("name") or "Medium",
        "issueType": (f.get("issuetype") or {}).get("name") or "",
        # VB 的「Project」欄位（多選，取第一個）—— 頁面照它分群
        "product": vb.product_of(f),
        "assignee": assignee,
        "reporter": person(f.get("reporter")),
        # 是不是指派給我的。**用 accountId 比**，不是名字
        "assignedToMe": bool(assignee["accountId"]) and assignee["accountId"] == my_account_id,
        "updated": f.get("updated"),
        "url": f"{vb.SITE}/browse/{issue['key']}",
    }


def search(jql: str, auth: str) -> list:
    issues, token = [], None
    while True:
        params = {"jql": jql, "maxResults": vb.PAGE_SIZE, "fields": FIELDS}
        if token:
            params["nextPageToken"] = token
        data = vb.api_get("/rest/api/3/search/jql", params, auth)
        issues += data.get("issues", [])
        token = data.get("nextPageToken")
        if not token or data.get("isLast"):
            break
    return issues


def main() -> None:
    args = sys.argv[1:]
    force_full = "--full" in args
    state_path = None
    if "--state" in args:
        try:
            state_path = args[args.index("--state") + 1]
        except IndexError:
            sys.exit("--state 需要一個檔案路徑")

    auth = vb.auth_header()

    # 認證壞掉時 Jira 回「0 筆」而不是 401 —— 不先擋就會產出一張空表，
    # 看起來像「沒有指派給我的單」（vb-bugs.py 踩過同一個坑）
    import urllib.error
    try:
        me = vb.api_get("/rest/api/3/myself", {}, auth)
    except urllib.error.HTTPError as e:
        sys.exit(f"Atlassian 認證失敗（HTTP {e.code}）—— 檢查 .env 的 ATLASSIAN_EMAIL 與 TOKEN")
    if not me.get("accountId"):
        sys.exit("Atlassian 認證看起來沒過（/myself 沒有 accountId）")

    prev, prev_rows = {}, {}
    if state_path and Path(state_path).exists():
        try:
            prev = json.loads(Path(state_path).read_text())
            prev_rows = {r["key"]: r for r in prev.get("issues", [])}
        except Exception:
            prev = {}

    last_full = prev.get("lastFullSyncAt")
    cursor = prev.get("cursor")
    bootstrapping = not (prev_rows and cursor)
    due_full = vb.should_full_sync(datetime.now(timezone.utc), last_full or "")
    incremental = not (force_full or bootstrapping or due_full)

    my_id = me.get("accountId") or ""
    open_jql = f"project = {PROJECT} AND statusCategory != Done"
    removed = []

    if incremental:
        since = vb.parse_time(cursor) - timedelta(minutes=vb.OVERLAP_MINUTES)
        # **刻意不帶 statusCategory 條件**：要讓「剛變成 Done」的票也回來，
        # 否則它會永遠留在表上（vb-bugs.py 同一個處理）。
        jql = (f"project = {PROJECT} AND updated >= \"{vb.jql_time(since, 8)}\" "
               f"ORDER BY updated ASC")
        fetched = [to_row(i, my_id) for i in search(jql, auth)]
        rows = dict(prev_rows)
        for r in fetched:
            if vb.is_open(r):
                rows[r["key"]] = r      # 新的或有更新的（含被轉給別人）
            elif r["key"] in rows:
                del rows[r["key"]]       # 做完了 → 下表
                removed.append(r["key"])

        last_full_out = last_full
    else:
        jql = f"{open_jql} ORDER BY updated ASC"
        fetched = [to_row(i, my_id) for i in search(jql, auth)]
        rows = {r["key"]: r for r in fetched if vb.is_open(r)}
        last_full_out = datetime.now(timezone.utc).isoformat()

    issues = sorted(rows.values(), key=lambda r: r.get("updated") or "", reverse=True)
    newest = max((r.get("updated") or "" for r in issues), default=cursor or "")

    json.dump({
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "fetchedAs": me.get("emailAddress") or me.get("displayName") or "?",
        "project": PROJECT,
        "mode": "incremental" if incremental else "full",
        "jql": jql,
        "cursor": newest or cursor or "",
        "lastFullSyncAt": last_full_out,
        "fetchedCount": len(fetched),
        "removedKeys": removed,
        "issueCount": len(issues),
        "issues": issues,
    }, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
