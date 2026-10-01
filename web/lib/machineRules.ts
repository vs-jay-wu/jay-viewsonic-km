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
  lastSeenAt: string;
  /** 那台推上來的 session 清單（原樣存，hub 不解讀內容） */
  sessions: unknown[];
}

export interface MachineRegistry {
  machines: MachineEntry[];
}

export const EMPTY_REGISTRY: MachineRegistry = { machines: [] };

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
): MachineRegistry {
  const entry: MachineEntry = {
    id: machine.id,
    name: machine.name,
    lastSeenAt: new Date(now).toISOString(),
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
        machine: { id: m.id, name: m.name },
        lastSeenAt: m.lastSeenAt,
        stale: isStale(m, now),
      })),
    );
}
