/**
 * 多機器的 session 匯總（純規則，有測試）。
 *
 * **方向是 satellite 推給 hub，不是 hub 去問 satellite。**
 *
 * 原因是通道：`ssh -L 9488:localhost:9487` 讓 **B 連得到 A，但 A 連不到 B**。
 * 設計文件原本寫「hub 去問各 satellite」—— 那要 B 再開一條 `-R` 反向轉發。
 * 推送不需要，而且順便有離線容忍：B 不在的時候 hub 手上仍有上次推的那份。
 *
 * 代價是**資料只新到上一次心跳**，所以每筆都帶 `lastSeenAt`，畫面要講得出
 * 「這是多久前的」。
 */

/** 多久沒心跳就當這台離線了。心跳是 60 秒一次，給三次的寬容 */
export const MACHINE_STALE_MS = 3 * 60 * 1000;

export interface MachineRef {
  id: string;
  name: string;
}

export interface MachineEntry extends MachineRef {
  /**
   * 在 hub 上改的名字。**心跳不會動它** —— `name` 是那台自己報的
   * （來自它的 `local.workspace.json`），每分鐘覆寫一次；要讓 hub 上的改名活得下去，
   * 就得有一個心跳碰不到的欄位。
   *
   * 兩個都留著是故意的：你在 hub 上叫它「工作筆電」，但出事要連過去時需要知道
   * 它自己叫什麼（hostname 風格的那個）。
   */
  displayName?: string;
  lastSeenAt: string;
  /**
   * hub 要連回這台時用的 port（hub 自己的 loopback，`ssh -R` 轉過去）。
   * 沒有就代表那台沒開反向轉發 —— 「在那台開 session」會做不到，要講清楚。
   */
  reversePort?: number;
  /** 那台推上來的 session 清單（原樣存，hub 不解讀內容） */
  sessions: unknown[];
}

export interface MachineRegistry {
  machines: MachineEntry[];
}

export const EMPTY_REGISTRY: MachineRegistry = { machines: [] };

/** 畫面上要顯示的名字：hub 改過的優先，沒改過就用那台自己報的 */
export function machineLabel(m: MachineEntry): string {
  return m.displayName?.trim() || m.name;
}

/** 在 hub 上改名。空字串＝取消覆寫，回到那台自己報的名字 */
export function renameMachine(reg: MachineRegistry, id: string, displayName: string): MachineRegistry {
  const next = displayName.trim();
  return {
    machines: reg.machines.map((m) =>
      m.id === id ? { ...m, displayName: next || undefined } : m
    ),
  };
}

/**
 * 從註冊表移除。那台若還活著，**下一次心跳就會自己回來** —— 這是對的：
 * 這個動作是「清掉不再用的機器」，不是封鎖。要真的擋住它是裝置 token 那一層的事。
 */
export function forgetMachine(reg: MachineRegistry, id: string): MachineRegistry {
  return { machines: reg.machines.filter((m) => m.id !== id) };
}

export function isStale(m: MachineEntry, now: number): boolean {
  return now - Date.parse(m.lastSeenAt) > MACHINE_STALE_MS;
}

/**
 * 收到一次心跳。**同一台是覆蓋，不是新增** —— `id` 是一次性 uuid，
 * 改名字不會變成另一台（`kmRoleRules.ts` 的 `machine.id`）。
 */
export function applyHeartbeat(
  reg: MachineRegistry,
  machine: MachineRef,
  sessions: unknown[],
  now: number,
  reversePort?: number,
): MachineRegistry {
  const prev = reg.machines.find((m) => m.id === machine.id);
  const entry: MachineEntry = {
    id: machine.id,
    name: machine.name,
    // 心跳不覆寫 hub 上改過的名字
    displayName: prev?.displayName,
    lastSeenAt: new Date(now).toISOString(),
    reversePort,
    sessions,
  };
  return { machines: [...reg.machines.filter((m) => m.id !== machine.id), entry] };
}

export interface RemoteSession {
  /** 那一台推上來的原始 session 物件 */
  session: Record<string, unknown>;
  machine: MachineRef;
  /** 這台機器上次有消息是什麼時候 */
  lastSeenAt: string;
  stale: boolean;
}

/**
 * 攤平成「別台機器的 session」清單。
 *
 * **排除自己**（`selfId`）：hub 自己的 session 是現場掃出來的，別再從 registry
 * 讀一份 —— 兩份會不一致，而且使用者會看到同一個 session 出現兩次。
 */
export function remoteSessions(
  reg: MachineRegistry,
  selfId: string | null,
  now: number,
): RemoteSession[] {
  return reg.machines
    .filter((m) => m.id !== selfId)
    .flatMap((m) =>
      m.sessions.map((s) => ({
        session: s as Record<string, unknown>,
        machine: { id: m.id, name: machineLabel(m) },
        lastSeenAt: m.lastSeenAt,
        stale: isStale(m, now),
      })),
    );
}

/**
 * 要把動作送到某台機器上執行時，它的網址。
 *
 * 回 `{ error }` 而不是 null，因為**做不到的理由有三種**，而使用者需要分得出來：
 * 沒這台、那台沒開反向轉發、那台離線了。三種的下一步完全不同。
 */
export function machineCommandUrl(
  reg: MachineRegistry,
  machineId: string,
  now: number,
): { url: string } | { error: string } {
  const m = reg.machines.find((x) => x.id === machineId);
  if (!m) return { error: "不認得這台機器（它還沒送過心跳）" };
  if (!m.reversePort) {
    return {
      error: `「${machineLabel(m)}」沒有開反向轉發，從這裡下不了指令 —— 在那台重跑 setup-km-tunnel.sh`,
    };
  }
  if (isStale(m, now)) {
    return { error: `「${machineLabel(m)}」已經離線（上次心跳 ${m.lastSeenAt}）` };
  }
  return { url: `http://localhost:${m.reversePort}` };
}
