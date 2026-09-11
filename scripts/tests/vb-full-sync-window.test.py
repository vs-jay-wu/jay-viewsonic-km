#!/usr/bin/env python3
"""vb-bugs.py 全同步窗口判斷的測試。

窗口是**台北時間** 20:00 → 隔天 07:00，一晚只做一次，**過了就不補**。
這段沒有網路，純算時間。

跑法：./scripts/tests/vb-full-sync-window.test.py
"""

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

SCRIPT = Path(__file__).resolve().parent.parent / "vb-bugs.py"
spec = importlib.util.spec_from_file_location("vb_bugs", SCRIPT)
vb = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vb)

TPE = vb.TAIPEI


def tpe(day: int, hour: int, minute: int = 0) -> datetime:
    """2026-09-<day> <hour>:<minute> 台北時間"""
    return datetime(2026, 9, day, hour, minute, tzinfo=TPE)


passed = failed = 0


def check(desc: str, got, want) -> None:
    global passed, failed
    if got == want:
        print(f"  ✓ {desc}")
        passed += 1
    else:
        print(f"  ✗ {desc} —— 期望 {want}，實際 {got}")
        failed += 1


print("窗口本身（台北時間 20:00 → 隔天 07:00）")
check("19:59 還沒進窗口", vb.full_sync_window_start(tpe(11, 19, 59)), None)
check("20:00 進窗口", vb.full_sync_window_start(tpe(11, 20)), tpe(11, 20))
check("23:30 屬於當晚的窗口", vb.full_sync_window_start(tpe(11, 23, 30)), tpe(11, 20))
check("凌晨 03:00 屬於**前一天**開始的窗口",
      vb.full_sync_window_start(tpe(12, 3)), tpe(11, 20))
check("06:59 還在窗口內", vb.full_sync_window_start(tpe(12, 6, 59)), tpe(11, 20))
check("07:00 出窗口", vb.full_sync_window_start(tpe(12, 7)), None)
check("中午不在窗口", vb.full_sync_window_start(tpe(12, 12)), None)

print("\n該不該全同步")
check("窗口內、從來沒同步過 → 要",
      vb.should_full_sync(tpe(11, 21), ""), True)
check("窗口內、這個窗口已經做過 → 不要（一晚只做一次）",
      vb.should_full_sync(tpe(12, 3), tpe(11, 21).isoformat()), False)
check("窗口內、上次是前一晚做的 → 要",
      vb.should_full_sync(tpe(12, 21), tpe(11, 21).isoformat()), True)
check("白天即使很久沒同步 → 不要（**過了不補**）",
      vb.should_full_sync(tpe(12, 12), tpe(8, 21).isoformat()), False)
check("白天、從來沒同步過 → 也不要（初始化走另一條路）",
      vb.should_full_sync(tpe(12, 12), ""), False)
check("窗口內、上次時間壞掉 → 當成沒做過",
      vb.should_full_sync(tpe(11, 21), "not-a-date"), True)

print("\n時區：用台北，不跟機器走")
# UTC 12:00 = 台北 20:00 → 該進窗口
check("UTC 12:00（台北 20:00）在窗口內",
      vb.full_sync_window_start(datetime(2026, 9, 11, 12, tzinfo=timezone.utc)) is not None,
      True)
# UTC 20:00 = 台北隔天 04:00 → 也在窗口內
check("UTC 20:00（台北隔天 04:00）在窗口內",
      vb.full_sync_window_start(datetime(2026, 9, 11, 20, tzinfo=timezone.utc)) is not None,
      True)
# UTC 02:00 = 台北 10:00 → 不在
check("UTC 02:00（台北 10:00）不在窗口內",
      vb.full_sync_window_start(datetime(2026, 9, 11, 2, tzinfo=timezone.utc)), None)

print(f"\n通過 {passed} 筆，失敗 {failed} 筆")
sys.exit(1 if failed else 0)
