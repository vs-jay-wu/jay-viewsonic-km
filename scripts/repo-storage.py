#!/usr/bin/env python3
"""repo 在「本機 ↔ 外接硬碟」之間搬移，並維護 local.workspace.json 的 offloaded 清單。

這支腳本是**搬移這件事的唯一實作**：CLI 與 km web 的「Repos 總覽」都打它，
不要在別的地方各寫一套（清單會漂）。

    repo-storage.py status  [--org ORG]            # 每個 repo 實際在哪（JSON）
    repo-storage.py offload <repo> [--org ORG]     # 本機 → 外接
    repo-storage.py restore <repo> [--org ORG]     # 外接 → 本機
    repo-storage.py reconcile [--org ORG]          # 只修清單，不搬檔案

加 `--json` 會改吐 NDJSON 事件（start / progress / done / error），給 web 讀進度用。

## 為什麼不是直接 `mv`

`mv` 跨檔案系統時是「複製完再刪來源」，但中途失敗會留下一個**看起來像 repo 的半套目錄**，
而且來源已經被刪掉一部分。這裡改成三段：

1. `rsync -a` 複製到 `<dest>.incoming-<pid>`（帶 `.incoming` 尾巴，絕不會被誤認成 repo）
2. 逐檔比對「檔案數 + 邏輯位元組數」，對得起來才 `os.rename` 成正式名字（同檔案系統，原子）
3. 確認搬到了才刪來源，最後才動 JSON

任何一步失敗都不刪來源。所以最壞情況是「多了一個 .incoming 目錄」，不是掉資料。

## 進度為什麼用 du 而不是 rsync

macOS 內建的是 openrsync（`rsync --version` 顯示 2.6.9 相容），**不支援 `--info=progress2`**
（實測 exit 非 0）。所以進度是另一條執行緒去 `du -sk` 目的地算出來的，
不是從 rsync 的輸出解析。
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
KM_ROOT = SCRIPT_DIR.parent
# 測試時用 KM_WORKSPACE_JSON 指到別份設定，才不用拿真的 repo 試搬移
WORKSPACE_JSON = Path(os.environ.get("KM_WORKSPACE_JSON") or (KM_ROOT / "local.workspace.json"))

DEFAULT_ORG = "Viewsonic-EDU"

# repo 名會被接成路徑，所以只收保守的字元集：不能有 `/`、不能是 `.` / `..`、
# 不能以 `.` 或 `-` 開頭（避免 `.git`、避免被當成指令參數）。
REPO_NAME_RE = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9._-]*$")

# 目的地至少要留這麼多餘裕才肯搬（複製過程還有其他東西在寫）
FREE_SPACE_MARGIN_BYTES = 2 * 1024**3
PROGRESS_INTERVAL_SEC = 3.0


class RepoStorageError(Exception):
    """可以直接顯示給使用者看的錯誤（都是預期內的擋下，不是 crash）。"""


# ---------------------------------------------------------------- 搬遷紀錄

HISTORY_FILE = KM_ROOT / "data" / "local-state" / "repo-moves.jsonl"
# 超過這個行數就砍掉最舊的。一次搬移一行，這個量夠看很久了
HISTORY_MAX_LINES = 1000


def append_history(entry: dict) -> None:
    """一次搬移一行 JSON，append-only。

    **只記真的動到磁碟的那些**：preflight 擋下來的（excluded、空間不足、
    兩邊都有…）什麼都沒發生，記進來只會把紀錄洗掉。中途失敗要記 ——
    那才是回頭要查的東西。

    寫紀錄失敗絕不能讓搬移本身變成失敗（檔案早就搬完了），所以整段吞例外。
    """
    try:
        HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
        with HISTORY_FILE.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
        prune_history()
    except OSError:
        pass


def prune_history() -> None:
    try:
        with HISTORY_FILE.open(encoding="utf-8") as fh:
            lines = fh.readlines()
    except OSError:
        return
    if len(lines) <= HISTORY_MAX_LINES + 200:
        return
    tmp = HISTORY_FILE.with_suffix(".jsonl.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        fh.writelines(lines[-HISTORY_MAX_LINES:])
    os.replace(tmp, HISTORY_FILE)


# ---------------------------------------------------------------- 事件輸出


class Emitter:
    """人看的文字 / 機器看的 NDJSON，兩種輸出共用一個介面。"""

    def __init__(self, as_json: bool) -> None:
        self.as_json = as_json
        self._in_progress_line = False

    def emit(self, event: str, **fields: object) -> None:
        if self.as_json:
            sys.stdout.write(json.dumps({"event": event, **fields}, ensure_ascii=False) + "\n")
            sys.stdout.flush()
            return

        if event == "progress":
            total = float(fields.get("totalBytes") or 0)
            copied = float(fields.get("copiedBytes") or 0)
            pct = (copied / total * 100) if total else 0
            sys.stdout.write(f"\r  複製中… {pct:5.1f}%  ({fmt_bytes(copied)} / {fmt_bytes(total)})")
            self._in_progress_line = True
            sys.stdout.flush()
            return

        if self._in_progress_line:
            sys.stdout.write("\n")
            self._in_progress_line = False
        # 錯誤只走 stderr，不然 CLI 會同一句印兩次
        if event != "error":
            msg = fields.get("message")
            if msg:
                sys.stdout.write(f"{msg}\n")
        sys.stdout.flush()


def iso(ts: float) -> str:
    """本地時間的 ISO 8601（含時區）。紀錄要看得出是幾點搬的，UTC 讀起來很痛苦。"""
    return time.strftime("%Y-%m-%dT%H:%M:%S%z", time.localtime(ts))


def fmt_bytes(n: float) -> str:
    for unit, size in (("GB", 1024**3), ("MB", 1024**2), ("KB", 1024)):
        if n >= size:
            return f"{n / size:.1f} {unit}"
    return f"{int(n)} B"


# ---------------------------------------------------------------- workspace


@dataclass
class Org:
    name: str
    local_path: Path
    external_path: Path
    offloaded: list[str] = field(default_factory=list)
    excluded: list[str] = field(default_factory=list)


def load_workspace() -> dict:
    if not WORKSPACE_JSON.exists():
        raise RepoStorageError(f"找不到 {WORKSPACE_JSON}")
    try:
        with WORKSPACE_JSON.open(encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise RepoStorageError(f"local.workspace.json 解析失敗：{exc}") from exc


def save_workspace(data: dict) -> None:
    """先寫同目錄的暫存檔再 rename —— 中途掛掉不會留下半份 JSON。"""
    tmp = WORKSPACE_JSON.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=2)
        fh.write("\n")
    os.replace(tmp, WORKSPACE_JSON)


def get_org(data: dict, org_name: str) -> Org:
    orgs = data.get("orgs") or {}
    raw = orgs.get(org_name)
    if raw is None:
        known = "、".join(orgs.keys()) or "（沒有任何 org）"
        raise RepoStorageError(f"local.workspace.json 裡沒有 org「{org_name}」。現有：{known}")

    local = raw.get("localPath")
    external = raw.get("externalPath")
    missing = [k for k, v in (("localPath", local), ("externalPath", external)) if not v]
    if missing:
        raise RepoStorageError(f"org「{org_name}」缺少 {'、'.join(missing)}")
    if not str(local).startswith("/") or not str(external).startswith("/"):
        raise RepoStorageError(f"org「{org_name}」的 localPath／externalPath 必須是絕對路徑")

    return Org(
        name=org_name,
        local_path=Path(local),
        external_path=Path(external),
        offloaded=list(raw.get("offloaded") or []),
        excluded=list(raw.get("excluded") or []),
    )


def volume_root(path: Path) -> Path | None:
    """`/Volumes/Crucial X9/...` → `/Volumes/Crucial X9`；不在 /Volumes 底下就 None。"""
    parts = path.parts
    if len(parts) >= 3 and parts[1] == "Volumes":
        return Path(parts[0], parts[1], parts[2])
    return None


def external_mounted(org: Org) -> tuple[bool, str | None]:
    """外接碟在不在。回傳 (掛載中, 期待的 volume 路徑)。

    只看目錄存不存在是不夠的 —— 卸載後 `/Volumes/X` 有時會留下一個空目錄，
    往裡面寫就寫進開機磁碟了。所以同時要求它是**掛載點**。
    """
    vol = volume_root(org.external_path)
    if vol is None:
        # 不是外接碟（例如指到本機另一個目錄），只要目錄在就算數
        return org.external_path.parent.exists(), None
    return (vol.is_dir() and os.path.ismount(vol)), str(vol)


# ---------------------------------------------------------------- 狀態


def list_repo_dirs(root: Path) -> set[str]:
    if not root.is_dir():
        return set()
    return {
        e.name
        for e in os.scandir(root)
        if e.is_dir(follow_symlinks=False) and not e.name.startswith(".")
    }


def build_status(org: Org) -> dict:
    mounted, vol = external_mounted(org)
    listed = set(org.offloaded)
    local_dirs = list_repo_dirs(org.local_path)
    # 沒掛載時看不到外接碟上有什麼。這時**用清單當推測值**，不要留空 ——
    # 留空的話 327 個 repo 會全部顯示成「未 clone」，那是假訊息。
    # 差別由 externalKnown 帶出去，UI 要標明這是推測的。
    external_dirs = list_repo_dirs(org.external_path) if mounted else set(listed)
    excluded = set(org.excluded)

    repos = []
    for name in sorted(local_dirs | external_dirs | listed):
        in_local = name in local_dirs
        in_external = name in external_dirs
        if in_local and in_external:
            placement = "both"
        elif in_local:
            placement = "local"
        elif in_external:
            placement = "external"
        else:
            placement = "absent"

        repos.append(
            {
                "name": name,
                "org": org.name,
                "placement": placement,
                "listedOffloaded": name in listed,
                "excluded": name in excluded,
                "protectedReason": protected_reason(org, name),
            }
        )

    return {
        "org": org.name,
        "localPath": str(org.local_path),
        "externalPath": str(org.external_path),
        "externalMounted": mounted,
        # 沒掛載時無法得知外接碟上有什麼，UI 要講清楚而不是顯示「未 clone」
        "externalKnown": mounted,
        "externalVolume": vol,
        "repos": repos,
    }


def protected_reason(org: Org, name: str) -> str | None:
    """回傳「為什麼這個 repo 不能搬」，可以搬就 None。"""
    if name in set(org.excluded):
        return "在 local.workspace.json 的 excluded 清單裡（keystore 等機敏資料），禁止搬移"
    if (org.local_path / name).resolve() == KM_ROOT:
        return "這是 km repo 本身，web server 正跑在它上面"
    return None


# ---------------------------------------------------------------- 前置檢查


def check_repo_name(name: str) -> None:
    if not name or not REPO_NAME_RE.match(name) or name in (".", ".."):
        raise RepoStorageError(
            f"repo 名稱「{name}」不合法：只接受英數與 . _ -，且不能以 . 或 - 開頭"
        )


def is_appledouble(name: str) -> bool:
    """macOS 在 exFAT 上替**每個**檔案自動生的 `._xxx` sidecar（resource fork／xattr）。

    外接碟是 exFAT，所以複製過去之後檔案數會憑空變兩倍、位元組數也對不上
    （實測：160 檔的 repo 搬過去變 320 檔）。這些不是 repo 的內容，
    兩邊都當它們不存在，驗證才有意義。
    """
    return name.startswith("._")


# exFAT 不存 unix 權限，整顆碟讀回來都是 rwx------。所以搬出去時要把
# 「跟預設不一樣」的權限另外記下來，搬回來才還原得了（見 MODE_MANIFEST_SUFFIX）。
DEFAULT_FILE_MODE = 0o644
DEFAULT_DIR_MODE = 0o755
MODE_MANIFEST_SUFFIX = ".repo-storage.json"


# 沒有 manifest 時（舊的 mv 搬法留下的那批）唯一能靠的權限來源是 git index，
# 而 git 只記可執行位元 —— 原本 600 的檔案會被還原成 644。
# 這些檔名一看就是不該給同機其他使用者讀的，所以寧可保守給 600。
# 誤判的代價只是「權限比需要的嚴」，反過來的代價是把密鑰攤開。
SENSITIVE_BASENAMES = {"key.properties", "id_rsa", "id_ed25519", "credentials", "secrets.json"}
SENSITIVE_SUFFIXES = (".jks", ".keystore", ".pem", ".p12", ".p8", ".key")


def looks_sensitive(rel_path: str) -> bool:
    name = rel_path.rsplit("/", 1)[-1]
    return (
        name in SENSITIVE_BASENAMES
        or name.startswith(".env")
        or name.endswith(SENSITIVE_SUFFIXES)
    )


def collect_modes(root: Path) -> dict[str, int]:
    """`相對路徑 → 權限`，但**只記跟預設不一樣的**。

    典型的 repo 裡這只有幾筆（可執行的 script、git hooks、600 的設定檔），
    其餘靠 DEFAULT_FILE_MODE／DEFAULT_DIR_MODE 還原。整棵樹都記的話，
    大型 repo 的 manifest 會有好幾 MB，而且絕大多數是廢話。
    symlink 不記 —— git 不追蹤 symlink 的權限，macOS 也不好改。
    """
    modes: dict[str, int] = {}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        rel_dir = os.path.relpath(dirpath, root)
        prefix = "" if rel_dir == "." else rel_dir + "/"
        for dname in dirnames:
            full = os.path.join(dirpath, dname)
            if os.path.islink(full):
                continue
            try:
                mode = os.lstat(full).st_mode & 0o7777
            except OSError:
                continue
            if mode != DEFAULT_DIR_MODE:
                modes[prefix + dname + "/"] = mode
        for fname in filenames:
            if is_appledouble(fname):
                continue
            full = os.path.join(dirpath, fname)
            if os.path.islink(full):
                continue
            try:
                mode = os.lstat(full).st_mode & 0o7777
            except OSError:
                continue
            if mode != DEFAULT_FILE_MODE:
                modes[prefix + fname] = mode
    return modes


def git_executables(root: Path) -> set[str]:
    """git index 裡標成 100755 的檔案。

    沒有 manifest 時（例如以前用 `mv` 搬到外接碟的那批）唯一可靠的權限來源：
    git 自己就記得哪些追蹤中的檔案該可執行。未追蹤的檔案救不回來，
    但那些本來就不影響 `git status`。
    """
    try:
        out = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--stage"],
            capture_output=True,
            text=True,
            timeout=300,
        )
    except (subprocess.SubprocessError, OSError):
        return set()
    if out.returncode != 0:
        return set()
    execs = set()
    for line in out.stdout.splitlines():
        # `100755 <sha> 0\t<path>`
        if line.startswith("100755 "):
            tab = line.find("\t")
            if tab != -1:
                execs.add(line[tab + 1 :])
    return execs


def apply_modes(root: Path, modes: dict[str, int] | None) -> str:
    """把權限套回 root。回傳一句給人看的說明（要寫進完成訊息裡）。"""
    recorded = modes or {}
    fallback_execs: set[str] = set()
    sensitive = 0
    if modes is None:
        fallback_execs = git_executables(root)

    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        rel_dir = os.path.relpath(dirpath, root)
        prefix = "" if rel_dir == "." else rel_dir + "/"
        for dname in dirnames:
            full = os.path.join(dirpath, dname)
            if os.path.islink(full):
                continue
            _chmod(full, recorded.get(prefix + dname + "/", DEFAULT_DIR_MODE))
        for fname in filenames:
            full = os.path.join(dirpath, fname)
            if os.path.islink(full):
                continue
            rel = prefix + fname
            if rel in recorded:
                _chmod(full, recorded[rel])
            elif rel in fallback_execs:
                _chmod(full, 0o755)
            elif modes is None and looks_sensitive(rel):
                _chmod(full, 0o600)
                sensitive += 1
            else:
                _chmod(full, DEFAULT_FILE_MODE)

    if modes is not None:
        return f"權限依 manifest 還原（{len(recorded)} 筆例外）"
    extra = f"，{sensitive} 個看起來像密鑰的檔案給 600" if sensitive else ""
    return (
        "沒有權限 manifest（以前用 mv 搬過去的），改用 git index 還原"
        f" {len(fallback_execs)} 個可執行檔，其餘回到 644／755{extra}"
    )


def write_mode_manifest(path: Path, repo: str, modes: dict[str, int]) -> None:
    payload = {
        "version": 1,
        "repo": repo,
        "savedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "defaults": {"file": f"{DEFAULT_FILE_MODE:o}", "dir": f"{DEFAULT_DIR_MODE:o}"},
        "modes": {k: f"{v:o}" for k, v in sorted(modes.items())},
    }
    with path.open("w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
        fh.write("\n")


def read_mode_manifest(path: Path) -> dict[str, int] | None:
    """讀不到或格式不對就回 None —— 呼叫端會退回「用 git index 猜」那條路。"""
    if not path.exists():
        return None
    try:
        with path.open(encoding="utf-8") as fh:
            payload = json.load(fh)
        return {k: int(v, 8) for k, v in (payload.get("modes") or {}).items()}
    except (OSError, ValueError, AttributeError):
        return None


def _chmod(path: str, mode: int) -> None:
    try:
        os.chmod(path, mode)
    except OSError:
        pass


def dir_index(root: Path) -> dict[str, int]:
    """`相對路徑 → 大小`。用來驗證複製結果，也是「差在哪」的來源。

    刻意用 `st_size` 而不是 `du` —— APFS 與 exFAT 的配置單位不同，
    du 的數字兩邊本來就對不起來，拿它比對會誤判成「複製失敗」。
    目錄也記一筆（結尾加 `/`），不然「少複製一個空目錄」看不出來。
    symlink 只記大小不解參照。
    """
    index: dict[str, int] = {}
    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        rel_dir = os.path.relpath(dirpath, root)
        prefix = "" if rel_dir == "." else rel_dir + "/"
        for dname in dirnames:
            index[prefix + dname + "/"] = 0
        for fname in filenames:
            if is_appledouble(fname):
                continue
            try:
                index[prefix + fname] = os.lstat(os.path.join(dirpath, fname)).st_size
            except OSError:
                index[prefix + fname] = -1
    return index


def describe_diff(src_index: dict[str, int], dst_index: dict[str, int]) -> str:
    """驗證失敗時「差在哪」。只講前幾筆 —— 要的是能動手查的線索，不是完整清單。"""
    missing = sorted(set(src_index) - set(dst_index))
    extra = sorted(set(dst_index) - set(src_index))
    resized = sorted(
        p for p in src_index if p in dst_index and src_index[p] != dst_index[p]
    )
    parts = []
    for label, items in (("沒複製到", missing), ("多出來", extra), ("大小不同", resized)):
        if items:
            head = "、".join(items[:3])
            more = f" 等 {len(items)} 筆" if len(items) > 3 else ""
            parts.append(f"{label}：{head}{more}")
    return "；".join(parts) or "數量一致但內容對不上"


def rmtree_tolerant(path: Path) -> None:
    """刪整棵樹，但容忍「走訪到一半檔案自己不見了」。

    exFAT 上刪掉 `foo` 的同時，macOS 會一併帶走它的 AppleDouble `._foo`，
    於是 `shutil.rmtree` 稍後要刪 `._foo` 時拿到 FileNotFoundError 整個爆掉
    （實測會在刪來源刪到一半時中斷，留下半個目錄）。
    """
    def on_error(_func, _path, exc_info) -> None:
        if not isinstance(exc_info[1], FileNotFoundError):
            raise exc_info[1]

    shutil.rmtree(path, onerror=on_error)
    if path.exists():
        # 還在就再試一次；仍然失敗才是真的有問題（權限、檔案被佔用）
        shutil.rmtree(path)


def du_bytes(path: Path) -> int:
    """`du -sk` 的位元組數。給進度用，不求精準。"""
    try:
        out = subprocess.run(
            ["/usr/bin/du", "-sk", str(path)],
            capture_output=True,
            text=True,
            timeout=600,
        )
        first = out.stdout.split("\t", 1)[0].strip()
        return int(first) * 1024
    except (subprocess.SubprocessError, ValueError, IndexError):
        return 0


def git_worktree_guard(src: Path) -> None:
    """git worktree 用**絕對路徑**互指，搬走任何一邊都會斷掉，所以直接擋下。

    兩種都要擋：
    - src 自己是 linked worktree（`.git` 是檔案不是目錄）
    - src 是主 repo，而且底下掛了別的 worktree
    """
    dot_git = src / ".git"
    if dot_git.is_file():
        raise RepoStorageError(
            f"「{src.name}」是 git worktree（.git 是檔案，指回主 repo）。"
            "搬走會讓它跟主 repo 斷連，請先 git worktree remove。"
        )
    try:
        out = subprocess.run(
            ["git", "-C", str(src), "worktree", "list", "--porcelain"],
            capture_output=True,
            text=True,
            timeout=60,
        )
    except (subprocess.SubprocessError, OSError):
        return
    if out.returncode != 0:
        return
    others = [
        line[len("worktree ") :]
        for line in out.stdout.splitlines()
        if line.startswith("worktree ")
    ]
    others = [p for p in others if Path(p).resolve() != src.resolve()]
    if others:
        listed = "、".join(Path(p).name for p in others)
        raise RepoStorageError(
            f"「{src.name}」底下還掛著 git worktree（{listed}），"
            "搬走會讓它們全部失效。請先 git worktree remove 再搬。"
        )


def preflight(org: Org, repo: str, action: str) -> tuple[Path, Path, int]:
    """所有「搬之前一定要成立」的條件。回傳 (來源, 目的地, 來源大小)。"""
    check_repo_name(repo)

    reason = protected_reason(org, repo)
    if reason:
        raise RepoStorageError(f"「{repo}」不能搬：{reason}")

    mounted, vol = external_mounted(org)
    if not mounted:
        raise RepoStorageError(
            f"外接硬碟沒有掛載（找不到 {vol or org.external_path}）。接上之後再試一次。"
        )

    if action == "offload":
        src, dst = org.local_path / repo, org.external_path / repo
        src_label, dst_label = "本機", "外接硬碟"
    else:
        src, dst = org.external_path / repo, org.local_path / repo
        src_label, dst_label = "外接硬碟", "本機"

    if src.is_symlink():
        raise RepoStorageError(f"「{repo}」在{src_label}上是 symlink，不處理（請自己確認它指到哪）")
    if not src.exists():
        raise RepoStorageError(f"{src_label}上找不到「{repo}」（{src}）")
    if not src.is_dir():
        raise RepoStorageError(f"「{src}」不是目錄")
    if not (src / ".git").exists():
        raise RepoStorageError(f"「{repo}」不是 git repo（沒有 .git），為安全起見不搬")

    if dst.exists():
        raise RepoStorageError(
            f"{dst_label}上已經有「{repo}」（{dst}）。兩邊都有一份，"
            "請自己確認哪一份才是要留的，再手動刪掉另一份。"
        )

    git_worktree_guard(src)

    dst.parent.mkdir(parents=True, exist_ok=True)
    size = du_bytes(src)
    free = shutil.disk_usage(dst.parent).free
    if free < size + FREE_SPACE_MARGIN_BYTES:
        raise RepoStorageError(
            f"{dst_label}空間不足：需要 {fmt_bytes(size)}"
            f"（另留 {fmt_bytes(FREE_SPACE_MARGIN_BYTES)} 餘裕），只剩 {fmt_bytes(free)}"
        )

    return src, dst, size


# ---------------------------------------------------------------- 搬移


def copy_with_progress(src: Path, staging: Path, total: int, emitter: Emitter) -> None:
    """rsync 複製，另一條執行緒 du 目的地回報進度。"""
    stop = threading.Event()

    def report() -> None:
        while not stop.wait(PROGRESS_INTERVAL_SEC):
            emitter.emit("progress", copiedBytes=du_bytes(staging), totalBytes=total)

    reporter = threading.Thread(target=report, daemon=True)
    reporter.start()
    try:
        proc = subprocess.run(
            # 排除 `._*`：搬出去時來源（APFS）根本沒有這種檔，不受影響；
            # 搬回來時要濾掉外接碟（exFAT）自動生的那一堆，
            # 否則 repo 一回到本機就多出幾百個 untracked 檔案。
            ["/usr/bin/rsync", "-a", "--exclude=._*", f"{src}/", f"{staging}/"],
            capture_output=True,
            text=True,
        )
    finally:
        stop.set()
        reporter.join(timeout=PROGRESS_INTERVAL_SEC + 1)

    if proc.returncode != 0:
        detail = (proc.stderr or proc.stdout or "").strip().splitlines()
        tail = detail[-1] if detail else f"rsync 離開碼 {proc.returncode}"
        raise RepoStorageError(f"複製失敗：{tail}")


def move_repo(org: Org, repo: str, action: str, emitter: Emitter, source: str = "cli") -> dict:
    src, dst, total = preflight(org, repo, action)

    src_index = dir_index(src)
    src_count = len(src_index)
    src_bytes = sum(v for v in src_index.values() if v > 0)

    # 權限 manifest 放在**外接碟那一側、repo 目錄旁邊**（不是裡面）——
    # 放裡面會讓複製結果多一個檔案，驗證就對不起來了。
    manifest = org.external_path / f"{repo}{MODE_MANIFEST_SUFFIX}"
    src_modes = collect_modes(src) if action == "offload" else None

    emitter.emit(
        "start",
        repo=repo,
        org=org.name,
        action=action,
        source=str(src),
        destination=str(dst),
        totalBytes=total,
        fileCount=src_count,
        message=f"搬移 {org.name}/{repo}：{src} → {dst}（{fmt_bytes(total)}，{src_count} 個檔案）",
    )

    staging = dst.with_name(f"{dst.name}.incoming-{os.getpid()}")
    if staging.exists():
        shutil.rmtree(staging, ignore_errors=True)

    # 從這裡開始才會動到磁碟，所以紀錄也從這裡起算（見 append_history）
    started_at = time.time()

    def record(status: str, note: str) -> None:
        append_history(
            {
                "startedAt": iso(started_at),
                "finishedAt": iso(time.time()),
                "durationSec": round(time.time() - started_at, 1),
                "repo": repo,
                "org": org.name,
                "action": action,
                "status": status,
                "source": source,
                "sourcePath": str(src),
                "destination": str(dst),
                "bytes": src_bytes,
                "fileCount": src_count,
                "note": note,
            }
        )

    try:
        copy_with_progress(src, staging, total, emitter)

        dst_index = dir_index(staging)
        if dst_index != src_index:
            raise RepoStorageError(
                "複製結果對不上來源，已保留原本那份沒有動（"
                f"來源 {src_count} 項，複製出來 {len(dst_index)} 項）。"
                f"{describe_diff(src_index, dst_index)}"
            )

        # 同一個檔案系統內改名，原子操作 —— 到這一刻之前都沒有東西叫做 `<repo>`
        os.rename(staging, dst)
    except BaseException as exc:
        shutil.rmtree(staging, ignore_errors=True)
        record("error", str(exc) or exc.__class__.__name__)
        raise

    # 這之後每一步都可能留下「兩邊都有」之類的中間狀態，所以失敗也要進紀錄
    try:
        # 確認新的那份真的在，才敢刪來源
        if not (dst / ".git").exists():
            raise RepoStorageError(f"複製完成但 {dst} 看起來不完整，來源保留在 {src}，請手動確認")

        if action == "offload":
            # 先把 manifest 寫下來再刪來源 —— 反過來的話中途失敗就永遠拿不回權限了
            write_mode_manifest(manifest, repo, src_modes or {})
            mode_note = f"權限記入 {manifest.name}（{len(src_modes or {})} 筆例外）"
        else:
            mode_note = apply_modes(dst, read_mode_manifest(manifest))

        rmtree_tolerant(src)
        if action == "restore":
            manifest.unlink(missing_ok=True)

        # 檔案動完才更新清單。這一步失敗的話清單會跟實際不符，
        # 由 `reconcile` 負責修（status 也看得出來）。
        data = load_workspace()
        entry = data["orgs"][org.name]
        offloaded = set(entry.get("offloaded") or [])
        if action == "offload":
            offloaded.add(repo)
        else:
            offloaded.discard(repo)
        entry["offloaded"] = sorted(offloaded)
        save_workspace(data)
    except BaseException as exc:
        record("error", str(exc) or exc.__class__.__name__)
        raise

    record("done", mode_note)
    emitter.emit(
        "done",
        repo=repo,
        org=org.name,
        action=action,
        destination=str(dst),
        movedBytes=src_bytes,
        fileCount=src_count,
        message=(
            f"完成：{repo} 已在 {dst}，offloaded 清單同步更新（共 {len(offloaded)} 個）。{mode_note}"
        ),
    )
    return {"ok": True, "repo": repo, "destination": str(dst)}


# ---------------------------------------------------------------- reconcile


def reconcile(org: Org, emitter: Emitter) -> dict:
    """只修清單，不碰檔案。用在「搬完但 JSON 沒寫成功」之後。"""
    mounted, vol = external_mounted(org)
    if not mounted:
        raise RepoStorageError(
            f"外接硬碟沒有掛載（找不到 {vol or org.external_path}），"
            "這時候無法分辨「在外接碟上」與「根本沒 clone」，不動清單。"
        )

    status = build_status(org)
    should_be = sorted(
        r["name"] for r in status["repos"] if r["placement"] == "external" and not r["excluded"]
    )
    before = sorted(set(org.offloaded))

    added = [n for n in should_be if n not in before]
    removed = [n for n in before if n not in should_be]

    if added or removed:
        data = load_workspace()
        data["orgs"][org.name]["offloaded"] = should_be
        save_workspace(data)

    emitter.emit(
        "done",
        org=org.name,
        added=added,
        removed=removed,
        total=len(should_be),
        message=(
            f"清單已對齊實際狀態：新增 {len(added)}、移除 {len(removed)}，共 {len(should_be)} 個"
            if added or removed
            else "清單與實際狀態一致，沒有要改的"
        ),
    )
    return {"ok": True, "added": added, "removed": removed}


# ---------------------------------------------------------------- CLI


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("action", choices=["status", "offload", "restore", "reconcile"])
    parser.add_argument("repo", nargs="?", help="repo 名稱（offload／restore 必填）")
    parser.add_argument("--org", default=DEFAULT_ORG)
    parser.add_argument("--json", action="store_true", help="輸出 NDJSON 事件（給程式讀）")
    parser.add_argument(
        "--source", default="cli", choices=["cli", "web"], help="誰發動的（只寫進搬遷紀錄）"
    )
    args = parser.parse_args(argv)

    emitter = Emitter(args.json)
    try:
        org = get_org(load_workspace(), args.org)

        if args.action == "status":
            # status 一律吐 JSON，它本來就是給程式讀的
            json.dump(build_status(org), sys.stdout, ensure_ascii=False, indent=None if args.json else 2)
            sys.stdout.write("\n")
            return 0

        if args.action == "reconcile":
            reconcile(org, emitter)
            return 0

        if not args.repo:
            parser.error(f"{args.action} 要指定 repo 名稱")
        move_repo(org, args.repo, args.action, emitter, source=args.source)
        return 0

    except RepoStorageError as exc:
        emitter.emit("error", message=str(exc))
        if not args.json:
            sys.stderr.write(f"錯誤：{exc}\n")
        return 1
    except KeyboardInterrupt:
        emitter.emit("error", message="已中斷（來源沒有被動過）")
        return 130


if __name__ == "__main__":
    sys.exit(main())
