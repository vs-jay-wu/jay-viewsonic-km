# memclean — 清掉佔記憶體的殭屍開發行程
#
# 本檔是 source of truth。~/.zshrc 只會 `source` 它（由
# scripts/setup-memclean.sh 寫入），所以改這裡就生效，不必重跑 setup。
#
# 判準與實測數字：docs/domains/app-build-performance/dev-process-memory-reclaim.md

# 清掉佔記憶體的殭屍開發行程（預設 dry-run，-f 才真的殺）
memclean() {
  python3 - "$@" <<'PY'
import subprocess, sys, time, os, signal

B='\033[1m'; R='\033[0m'; C='\033[1;36m'; G='\033[1;32m'
Y='\033[1;33m'; RED='\033[1;31m'; GRAY='\033[90m'

args = sys.argv[1:]
if '-h' in args or '--help' in args:
    print(f"""
{B}memclean{R} — 清掉佔記憶體的殭屍開發行程{GRAY}（預設只列出，不殺）{R}

  {C}memclean{R}              dry-run：列出符合條件的行程與可回收量
  {C}memclean -f{R}           真的殺掉
  {C}memclean -a 30{R}        年齡門檻改成 30 分鐘{GRAY}（預設 120）{R}
  {C}memclean -g{R}           一併處理 Gradle / Kotlin daemon {GRAY}(不看年齡；build 中勿用){R}
  {C}memclean -l{R}           一併處理 dart language-server {GRAY}(VS Code 會立刻重開){R}
  {C}memclean -f -g -a 60{R}  可組合

{GRAY}預設對象：dart mcp-server（Claude Code 的 Flutter MCP，用過就膨脹到 ~2.3GB
且永遠不縮回去），以及父行程已死的孤兒。{R}
""")
    sys.exit(0)

force    = '-f' in args
do_gradle= '-g' in args
do_ls    = '-l' in args
age_min  = 120
if '-a' in args:
    try: age_min = int(args[args.index('-a') + 1])
    except Exception: pass

def etime_secs(s):
    s = s.strip(); d = 0
    if '-' in s:
        ds, s = s.split('-', 1); d = int(ds)
    p = [int(x) for x in s.split(':')]
    while len(p) < 3: p.insert(0, 0)
    return d * 86400 + p[0] * 3600 + p[1] * 60 + p[2]

def human_age(sec):
    d, r = divmod(sec, 86400); h, r = divmod(r, 3600); m = r // 60
    if d: return f"{d}天{h}時"
    if h: return f"{h}時{m}分"
    return f"{m}分"

def parse_mem(s):
    s = s.rstrip('+')
    mult = {'K': 1/1024, 'M': 1, 'G': 1024}.get(s[-1], 1/1048576)
    try: return float(s[:-1] if s[-1] in 'KMG' else s) * mult
    except ValueError: return 0.0

# footprint 對照表（top 的 MEM 欄＝physical footprint，比 RSS 準）
fp = {}
out = subprocess.run(['top', '-l', '1', '-stats', 'pid,mem', '-n', '5000'],
                     capture_output=True, text=True).stdout
seen_hdr = False
for line in out.splitlines():
    if line.strip().startswith('PID'):
        seen_hdr = True; continue
    if seen_hdr:
        p = line.split()
        if len(p) >= 2 and p[0].isdigit():
            fp[int(p[0])] = parse_mem(p[1])

def swap_line():
    sw = subprocess.run(['sysctl', '-n', 'vm.swapusage'],
                        capture_output=True, text=True).stdout
    used = float(sw.split('used =')[1].split('M')[0])
    tot  = float(sw.split('total =')[1].split('M')[0])
    c = G if used < 4096 else (Y if used < 12288 else RED)
    return f"{C}Swap:{R} {c}{used/1024:.1f}{R}/{tot/1024:.1f}GB"

me = os.getpid()
rows = []
ps = subprocess.run(['ps', '-axo', 'pid,ppid,etime,args'],
                    capture_output=True, text=True).stdout.splitlines()[1:]
for line in ps:
    parts = line.split(None, 3)
    if len(parts) < 4: continue
    pid, ppid, et, cmd = int(parts[0]), int(parts[1]), parts[2], parts[3]
    if pid == me: continue
    try: age = etime_secs(et)
    except Exception: continue

    kind = reason = None
    if 'dart' in cmd and 'mcp-server' in cmd:
        if ppid == 1:
            kind, reason = 'mcp-server', '孤兒（父行程已死）'
        elif age >= age_min * 60:
            kind, reason = 'mcp-server', f'閒置 {human_age(age)}'
    elif do_gradle and ('GradleDaemon' in cmd or 'KotlinCompileDaemon' in cmd):
        kind, reason = ('Gradle daemon' if 'GradleDaemon' in cmd
                        else 'Kotlin daemon'), f'存活 {human_age(age)}'
    elif do_ls and 'language-server' in cmd and 'dart' in cmd:
        kind, reason = 'language-server', 'VS Code 會重開'

    if kind:
        rows.append((pid, kind, reason, fp.get(pid, 0.0), human_age(age)))

print(f"\n{B}🧹 memclean{R}  {GRAY}(門檻 {age_min} 分鐘"
      f"{'，含 Gradle' if do_gradle else ''}"
      f"{'，含 language-server' if do_ls else ''}){R}")
print(f"  清理前：{swap_line()}\n")

if not rows:
    print(f"  {G}✓ 沒有符合條件的行程{R}\n")
    sys.exit(0)

rows.sort(key=lambda r: -r[3])
total = sum(r[3] for r in rows)
print(f"  {GRAY}{'PID':>7}  {'類型':<16} {'佔用':>9}  {'年齡':<8} 原因{R}")
for pid, kind, reason, mem, age in rows:
    print(f"  {Y}{pid:>7}{R}  {kind:<14} {Y}{mem:>7.0f} MB{R}  {age:<8} {GRAY}{reason}{R}")
print(f"\n  {B}合計可回收：{G}{total/1024:.1f} GB{R}  ({len(rows)} 個行程)")

if not force:
    print(f"\n  {GRAY}這是 dry-run。確認無誤後執行：{R} "
          f"{C}memclean -f{' -g' if do_gradle else ''}"
          f"{' -l' if do_ls else ''} -a {age_min}{R}\n")
    sys.exit(0)

print()
killed = []
for pid, kind, _, mem, _ in rows:
    try: os.kill(pid, signal.SIGTERM); killed.append((pid, kind, mem))
    except ProcessLookupError: pass
    except PermissionError: print(f"  {RED}✗ {pid} 權限不足{R}")

time.sleep(2)
for pid, kind, mem in killed:
    try:
        os.kill(pid, 0)
        os.kill(pid, signal.SIGKILL)
        print(f"  {Y}⚡ {pid} {kind} 不理 TERM，已 KILL{R} ({mem:.0f} MB)")
    except ProcessLookupError:
        print(f"  {G}✓ {pid} {kind} 已結束{R} ({mem:.0f} MB)")

print(f"\n  清理後：{swap_line()}")
print(f"  {GRAY}※ swap 不會立刻降，macOS 要一段時間才把 swapfile 收回{R}\n")
PY
}
