#!/usr/bin/env python3
"""vb-bugs.py — 抓 VB 專案的 bug（支援增量），輸出扁平的票清單。

對應 Confluence 上舊的 "mVB Suite Bug Ticket Overview by Platform"（VSFT 空間），
但**不是照抄**：新專案的欄位與狀態都不一樣，見 web/lib/vbBugsRules.ts 的說明。

## 分工

這支只負責**抓與合併**，輸出扁平的 issue 清單；
「產品 × 狀態分組 × 優先度」的矩陣在 web/lib/vbBugsRules.ts 算（純函式，有測試）。
分組規則放那邊而不是這裡，是為了讓規則改動有測試守著。

## 為什麼要增量

全 BU 的單之後都會搬進 VB，票數會長到幾千。每半小時全抓一次的話：
5000 筆 ≈ 50 次 API 呼叫 × 48 次/天 ≈ 2400 次/天。
改成只抓「上次之後有更新的」：實測 VB 近 24h 只有 97 筆更新，多數輪次是 0–5 筆。

### 三個實測過的前提（2026-09-11）

1. **已完成的票會出現在 `updated >= X` 的結果裡**（近 24h 有 7 筆 Done）。
   所以增量查詢**不能**帶 `statusCategory != Done` —— 要讓它回來，才知道
   「這張已經完成了，從表上拿掉」。
2. `updated` 的 JQL 只到**分鐘**精度，且用 Jira 帳號的時區（這裡是 Asia/Taipei）。
   所以游標要往回退 `OVERLAP_MINUTES` 分鐘，寧可重抓幾筆也不要漏。
   合併以 issue key 為準，重抓不會出錯。
3. **被硬刪或搬去別的專案的票，增量永遠看不到** —— 它不會再出現在任何查詢裡，
   只會留在快照裡變成幽靈。所以每 `FULL_SYNC_HOURS` 小時要做一次全同步。

## 用法

  ./scripts/vb-bugs.py                      # 全抓（沒有既有狀態時）
  ./scripts/vb-bugs.py --state <file>       # 有既有快照就自動走增量
  ./scripts/vb-bugs.py --state <file> --full  # 強制全抓
"""

import base64
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

SITE = "https://viewsonic-vsi.atlassian.net"
PROJECT = "VB"
PRODUCT_FIELD = "customfield_12435"  # VB 的「Project」欄位（多選）
UNCATEGORISED = "（未分類）"

PAGE_SIZE = 100
OVERLAP_MINUTES = 2   # JQL 只到分鐘精度，往回退一點
FULL_SYNC_HOURS = 24  # 幽靈票的唯一解法


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
    url = f"{SITE}{path}" + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url, headers={"Authorization": auth, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def search_all(jql: str, auth: str) -> list:
    """把符合的票全部抓回來（分頁）。回傳原始 issue 物件。"""
    issues, token = [], None
    while True:
        params = {
            "jql": jql,
            "maxResults": PAGE_SIZE,
            "fields": f"summary,status,priority,updated,{PRODUCT_FIELD}",
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
    for v in fields.get(PRODUCT_FIELD) or []:
        name = v.get("value") if isinstance(v, dict) else str(v)
        if name:
            return name
    return UNCATEGORISED


def to_row(issue: dict) -> dict:
    f = issue["fields"]
    return {
        "key": issue["key"],
        "summary": f.get("summary") or "",
        "status": f["status"]["name"],
        "statusCategory": f["status"]["statusCategory"]["name"],
        "priority": (f.get("priority") or {}).get("name") or "Medium",
        "product": product_of(f),
        "updated": f.get("updated"),
        "url": f"{SITE}/browse/{issue['key']}",
    }


def is_open(row: dict) -> bool:
    """Done 的不進表。statusCategory 用英文比對不可靠（這個站是中文），
    所以用 Jira 的 key 概念反過來寫：只要不是「完成」就留著。"""
    return row["statusCategory"] not in ("Done", "完成")


def parse_time(v: str) -> datetime:
    """Jira 回的是 `2026-09-11T08:44:59.383+0800` —— 偏移量沒有冒號，
    Python 3.9 的 fromisoformat 吃不下（3.11 才支援）。這台跑的就是 3.9。"""
    if len(v) >= 5 and v[-5] in "+-" and v[-3] != ":":
        v = v[:-2] + ":" + v[-2:]
    return datetime.fromisoformat(v)


def jql_time(dt: datetime, tz_offset_hours: int) -> str:
    """JQL 的時間字串要用 Jira 帳號的時區，精度到分鐘。"""
    local = dt.astimezone(timezone(timedelta(hours=tz_offset_hours)))
    return local.strftime("%Y/%m/%d %H:%M")


def main() -> None:
    args = sys.argv[1:]
    force_full = "--full" in args
    state_path = None
    if "--state" in args:
        try:
            state_path = args[args.index("--state") + 1]
        except IndexError:
            sys.exit("--state 需要一個檔案路徑")

    auth = auth_header()

    # 先驗身分：認證壞掉時 Jira 回「0 筆」而不是 401，不先擋就會產出一張
    # 全 0 的漂亮報表，看起來像「沒有 bug」。
    try:
        me = api_get("/rest/api/3/myself", {}, auth)
    except urllib.error.HTTPError as e:
        sys.exit(f"Atlassian 認證失敗（HTTP {e.code}）—— 檢查 .env 的 ATLASSIAN_EMAIL 與 TOKEN")
    if not me.get("accountId"):
        sys.exit("Atlassian 認證看起來沒過（/myself 沒有 accountId）")

    # Jira 帳號的時區決定 JQL 時間字串怎麼寫
    tz_offset = 8  # Asia/Taipei；抓不到就用這個
    try:
        probe = api_get("/rest/api/3/search/jql",
                        {"jql": f"project = {PROJECT} ORDER BY updated DESC",
                         "maxResults": 1, "fields": "updated"}, auth)
        u = probe["issues"][0]["fields"]["updated"]  # 例：2026-09-11T09:12:00.000+0800
        tz_offset = int(u[-5:-2]) if u[-5] in "+-" else 8
    except Exception:
        pass

    prev = {}
    prev_rows = {}
    if state_path and Path(state_path).exists():
        try:
            prev = json.loads(Path(state_path).read_text())
            prev_rows = {r["key"]: r for r in prev.get("issues", [])}
        except Exception:
            prev = {}

    last_full = prev.get("lastFullSyncAt")
    cursor = prev.get("cursor")
    stale_full = True
    if last_full:
        try:
            age = datetime.now(timezone.utc) - parse_time(last_full)
            stale_full = age > timedelta(hours=FULL_SYNC_HOURS)
        except Exception:
            stale_full = True

    incremental = bool(prev_rows and cursor and not force_full and not stale_full)

    if incremental:
        since = parse_time(cursor) - timedelta(minutes=OVERLAP_MINUTES)
        # 不帶 statusCategory 條件 —— 要讓「剛變成 Done」的票回來，才知道要移除
        jql = (f'project = {PROJECT} AND issuetype = Bug '
               f'AND updated >= "{jql_time(since, tz_offset)}" ORDER BY updated ASC')
    else:
        jql = (f"project = {PROJECT} AND issuetype = Bug "
               f"AND statusCategory != Done ORDER BY updated ASC")

    fetched = [to_row(i) for i in search_all(jql, auth)]

    if incremental:
        rows = dict(prev_rows)
        removed = []
        for r in fetched:
            if is_open(r):
                rows[r["key"]] = r
            elif r["key"] in rows:
                del rows[r["key"]]
                removed.append(r["key"])
        last_full_out = last_full
    else:
        rows = {r["key"]: r for r in fetched if is_open(r)}
        removed = []
        last_full_out = datetime.now(timezone.utc).isoformat()

    # 游標取「這批看到的最大 updated」，不是 now —— 用 now 會把查詢與寫入之間
    # 更新的票永遠跳過去。
    updates = [r["updated"] for r in fetched if r.get("updated")]
    if updates:
        new_cursor = max(updates)
    else:
        new_cursor = cursor or datetime.now(timezone.utc).isoformat()

    print(json.dumps({
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "fetchedAs": me.get("emailAddress") or me.get("accountId"),
        "project": PROJECT,
        "mode": "incremental" if incremental else "full",
        "jql": jql,
        "cursor": new_cursor,
        "lastFullSyncAt": last_full_out,
        "fetchedCount": len(fetched),
        "removedKeys": removed,
        "issueCount": len(rows),
        "issues": sorted(rows.values(), key=lambda r: r["key"]),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
