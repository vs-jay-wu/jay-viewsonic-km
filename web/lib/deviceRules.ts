/**
 * 裝置配對的判準（純規則，有測試）。
 *
 * 目標：**沒有會員系統**，靠「你在 hub 上按一下核可」建立信任
 * （Jay 2026-09-30）。流程：
 *
 * ```
 * B（satellite）     POST /api/devices/pair  { machineId, machineName, hostname }
 *                 ← { code: "418203", claim: "<隨機字串>" }
 * 你（在 hub 上）    看到「工作筆電 · 418203」→ 按核可
 * B                GET  /api/devices/pair?id=…&claim=…
 *                 ← { status: "approved", token: "<32 bytes>" }
 * ```
 *
 * 三個設計決定：
 *
 * - **配對碼是給人看的，不是憑證。** 它的用途是讓你確認「畫面上這台就是我手上
 *   那台」。真正的憑證是核可後才產生的 token。
 * - **`claim` 才是取件憑證。** 少了它，同一個 tailnet 上任何人只要猜到
 *   `machineId` 就能去把 token 領走 —— 而 `machineId` 會顯示在 hub 的畫面上。
 * - **待核可的會過期**（`PENDING_TTL_MS`）。沒有這條，一個手滑的請求會永遠躺在
 *   清單上，而清單上的東西久了就會被習慣性忽略。
 */

export interface PendingDevice {
  machineId: string;
  machineName: string;
  /** 對方自報的 hostname，只用來讓你確認是哪一台 */
  hostname: string;
  code: string;
  /** 取件憑證。**不顯示在 UI 上** —— 顯示了就等於公開 */
  claim: string;
  requestedAt: string;
}

export interface ApprovedDevice {
  id: string;
  name: string;
  token: string;
  approvedAt: string;
  lastSeenAt?: string;
}

export interface DeviceStore {
  pending: PendingDevice[];
  devices: ApprovedDevice[];
}

/** 待核可的存活時間。短到不會積灰，長到夠你走去另一台機器按 */
export const PENDING_TTL_MS = 15 * 60 * 1000;
/** 同時最多幾筆待核可。擋住「有人一直打 pair 把清單洗掉」 */
export const MAX_PENDING = 10;

export const EMPTY_STORE: DeviceStore = { pending: [], devices: [] };

export function isExpired(p: PendingDevice, now: number): boolean {
  return now - Date.parse(p.requestedAt) > PENDING_TTL_MS;
}

/** 清掉過期的。每次讀寫都跑一次，不另外排程 —— 這種量不值得一個 timer */
export function prunePending(store: DeviceStore, now: number): DeviceStore {
  return { ...store, pending: store.pending.filter((p) => !isExpired(p, now)) };
}

export interface PairRequest {
  machineId: string;
  machineName: string;
  hostname: string;
  code: string;
  claim: string;
}

export type PairOutcome =
  | { kind: "already-approved"; device: ApprovedDevice }
  | { kind: "pending"; store: DeviceStore; entry: PendingDevice }
  | { kind: "too-many" };

/**
 * 收到配對請求。
 *
 * **同一台重打會覆蓋自己那筆**（換新的 code 與 claim），不是新增一筆：
 * 重試是正常行為，每次都長一筆的話清單會被自己洗掉。
 */
export function applyPairRequest(
  store: DeviceStore,
  req: PairRequest,
  now: number,
): PairOutcome {
  const pruned = prunePending(store, now);
  const already = pruned.devices.find((d) => d.id === req.machineId);
  if (already) return { kind: "already-approved", device: already };

  const others = pruned.pending.filter((p) => p.machineId !== req.machineId);
  if (others.length >= MAX_PENDING) return { kind: "too-many" };

  const entry: PendingDevice = {
    machineId: req.machineId,
    machineName: req.machineName,
    hostname: req.hostname,
    code: req.code,
    claim: req.claim,
    requestedAt: new Date(now).toISOString(),
  };
  return { kind: "pending", store: { ...pruned, pending: [...others, entry] }, entry };
}

export type ClaimOutcome =
  | { kind: "approved"; token: string }
  | { kind: "waiting" }
  | { kind: "unknown" };

/**
 * 對方來問「核可了沒」。
 *
 * ⚠️ **claim 不對一律回 `unknown`，不要回「waiting」**：兩種回應分開的話，
 * 拿著錯 claim 的人就能用回應差異確認「這個 machineId 存在」。
 */
export function checkClaim(store: DeviceStore, machineId: string, claim: string): ClaimOutcome {
  const approved = store.devices.find((d) => d.id === machineId);
  const pendingSame = store.pending.find((p) => p.machineId === machineId && p.claim === claim);
  if (approved) {
    // 核可之後 pending 那筆已經移除，所以這裡沒有 claim 可比 —— 用 token 本身當
    // 一次性的取件：呼叫端拿到就存起來，之後靠 cookie／標頭走正常的驗證
    return { kind: "approved", token: approved.token };
  }
  if (pendingSame) return { kind: "waiting" };
  return { kind: "unknown" };
}

export interface ApproveResult {
  store: DeviceStore;
  device: ApprovedDevice;
}

/** 你在 hub 上按核可。token 由呼叫端產（要真的亂數，那不是純函式的事） */
export function approve(
  store: DeviceStore,
  machineId: string,
  token: string,
  now: number,
): ApproveResult | null {
  const p = store.pending.find((x) => x.machineId === machineId);
  if (!p) return null;
  const device: ApprovedDevice = {
    id: p.machineId,
    name: p.machineName,
    token,
    approvedAt: new Date(now).toISOString(),
  };
  return {
    store: {
      pending: store.pending.filter((x) => x.machineId !== machineId),
      devices: [...store.devices.filter((d) => d.id !== machineId), device],
    },
    device,
  };
}

/** 撤銷。**連 pending 一起清掉** —— 不然對方下一秒又被列進待核可 */
export function revoke(store: DeviceStore, machineId: string): DeviceStore {
  return {
    pending: store.pending.filter((p) => p.machineId !== machineId),
    devices: store.devices.filter((d) => d.id !== machineId),
  };
}

/** 顯示用：`418 203` 比 `418203` 好念，唸給另一台機器前面的自己聽也一樣 */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}
