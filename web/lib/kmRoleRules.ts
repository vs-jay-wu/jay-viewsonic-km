/**
 * 這台機器在多機器架構裡的角色（純規則，有測試）。
 *
 * 設計見 `docs/ideas/km-multi-machine.md` §8。三個要點：
 *
 * 1. **絕不自動判定角色。** 連「連得到 hub 就自己當 satellite」這種聰明作法也不要 ——
 *    身分自動變動會連帶**資料同步方向**自動變動，那是預期外行為最貴的一種。
 *    沒設定就明講沒設定，不要猜一個預設值。
 * 2. `machine.id` 是一次性產生的 uuid，**不要拿 hostname 當 id**：macOS 的 hostname
 *    會被網路環境改掉（連到某些 DHCP 就變），拿它當 key 會在某天安靜地變成另一台機器。
 * 3. `machine.name` 是給人看的標籤，隨時可改，改了不影響任何關聯。
 */

export type KmRole = "hub" | "satellite";

export interface KmMachine {
  /** 一次性產生的 uuid，永不變 */
  id: string;
  /** 給人看的名字，例如「工作筆電」 */
  name: string;
}

export interface KmConfig {
  role: KmRole;
  /**
   * satellite 才需要：hub 的網址。
   *
   * 走 SSH port forward 的話這是**本機的轉發埠**（例如 `http://localhost:9488`），
   * 不是 hub 的 IP —— 9487 被這台自己的 km 佔著，轉發不能撞號。
   * 見 `docs/ideas/km-multi-machine.md` §9。
   */
  hubUrl?: string;
  /**
   * satellite 才有：hub 要連回這台時，用的是 **hub 自己 loopback 上的這個 port**
   * （`ssh -R <reversePort>:localhost:9487` 轉過去的）。
   *
   * ⚠️ 多台 satellite **不能用同一個號碼** —— 第二條 `ssh -R` 會綁不上，
   * 而我們開了 `ExitOnForwardFailure=yes`，所以那條隧道整個起不來（大聲失敗，
   * 比安靜共用一個 port 好）。
   */
  reversePort?: number;
  machine: KmMachine;
}

export const SETUP_HINT =
  "在 local.workspace.json 加一段 km（role / machine.id / machine.name），見 docs/ideas/km-multi-machine.md §8";

/**
 * 從 `local.workspace.json` 解析出來的物件挑出 `km` 那一段。
 *
 * 回傳 `{ error }` 而不是丟例外：呼叫端要決定「這個情境值不值得擋下來」——
 * 寫 hub 狀態值得，只是想在側邊欄顯示機器名不值得。
 */
export function parseKmConfig(workspace: unknown): { config: KmConfig } | { error: string } {
  const km = (workspace as { km?: unknown } | null)?.km;
  if (!km || typeof km !== "object") {
    return { error: `local.workspace.json 沒有 km 這一段 —— ${SETUP_HINT}` };
  }
  const raw = km as Record<string, unknown>;
  const role = raw.role;
  if (role !== "hub" && role !== "satellite") {
    return { error: `km.role 要是 "hub" 或 "satellite"（目前是 ${JSON.stringify(role)}）—— ${SETUP_HINT}` };
  }
  const machine = raw.machine as Record<string, unknown> | undefined;
  const id = machine?.id;
  const name = machine?.name;
  if (typeof id !== "string" || !id.trim()) {
    return { error: `km.machine.id 沒設 —— 產一個 uuid 放進去（uuidgen），${SETUP_HINT}` };
  }
  if (typeof name !== "string" || !name.trim()) {
    return { error: `km.machine.name 沒設 —— 給這台機器一個看得懂的名字，${SETUP_HINT}` };
  }
  const hubUrl = typeof raw.hubUrl === "string" && raw.hubUrl.trim() ? raw.hubUrl.trim() : undefined;
  const rp = raw.reversePort;
  const reversePort = typeof rp === "number" && Number.isInteger(rp) && rp > 0 && rp < 65536 ? rp : undefined;
  if (role === "satellite" && !hubUrl) {
    return { error: `km.role 是 satellite 但沒有 km.hubUrl —— 它要向誰取第一類資料？` };
  }
  return { config: { role, hubUrl, reversePort, machine: { id: id.trim(), name: name.trim() } } };
}

/**
 * satellite 試圖寫 hub 擁有的狀態時的訊息。
 *
 * 訊息要講**為什麼**，不只是「不允許」：這條擋下來的通常不是惡意，而是某個抓取
 * 流程在 satellite 上被觸發了（例如有人在 B 按了「重新整理」），而正確的修法是
 * 讓它走 hub，不是放寬這條。
 */
export function hubWriteRefusal(fileName: string, machineName: string): string {
  return (
    `「${machineName}」是 satellite，不能寫 hub 擁有的狀態（${fileName}）。` +
    "第一類資料只有 hub 抓，satellite 要的話向 hub 取 —— " +
    "見 docs/ideas/km-multi-machine.md §2。"
  );
}
