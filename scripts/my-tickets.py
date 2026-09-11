#!/usr/bin/env python3
"""抓「指派給我、還沒完成」的 VB 單，增量更新。

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
FIELDS = "summary,status,priority,updated,issuetype,assignee"


def to_row(issue: dict) -> dict:
    f = issue["fields"]
    return {
        "key": issue["key"],
        "summary": f.get("summary") or "",
        "status": f["status"]["name"],
        "statusCategory": f["status"]["statusCategory"]["name"],
        "priority": (f.get("priority") or {}).get("name") or "Medium",
        "issueType": (f.get("issuetype") or {}).get("name") or "",
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

    mine_open = (f"project = {PROJECT} AND assignee = currentUser() "
                 f"AND statusCategory != Done")
    removed = []

    if incremental:
        since = vb.parse_time(cursor) - timedelta(minutes=vb.OVERLAP_MINUTES)
        jql = (f"{mine_open} AND updated >= \"{vb.jql_time(since, 8)}\" "
               f"ORDER BY updated ASC")
        fetched = [to_row(i) for i in search(jql, auth)]
        rows = dict(prev_rows)
        for r in fetched:
            rows[r["key"]] = r

        # 增量查詢帶著 assignee／statusCategory 條件，所以「被轉走」或「做完」的票
        # **不會**出現在結果裡 —— 會一直留在表上。所以反過來問一次手上這批還在不在。
        # 這一問的成本跟「我手上的票數」成正比（幾十筆），很便宜。
        if rows:
            keys = ", ".join(sorted(rows))
            gone_jql = (f"project = {PROJECT} AND key in ({keys}) "
                        f"AND (assignee != currentUser() OR assignee is EMPTY "
                        f"OR statusCategory = Done)")
            for issue in search(gone_jql, auth):
                if issue["key"] in rows:
                    del rows[issue["key"]]
                    removed.append(issue["key"])
        last_full_out = last_full
    else:
        jql = f"{mine_open} ORDER BY updated ASC"
        fetched = [to_row(i) for i in search(jql, auth)]
        rows = {r["key"]: r for r in fetched}
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
