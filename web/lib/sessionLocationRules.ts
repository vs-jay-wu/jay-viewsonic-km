/**
 * session 的 cwd 要怎麼變成「這是哪個專案、在哪個位置」（純規則，有測試）。
 *
 * 為什麼需要：`/sessions` 的專案下拉原本只取路徑最後一段，於是
 * `thresher`／`pilotfish`／`kingfish` 這種 Orca 工作區看起來像三個不相干的專案
 * ——它們其實都是 `edu-vbo`（Jay 2026-09-30：要能照位置篩）。
 *
 * 認得的三種落點（其餘一律退回最後一段）：
 *
 * | 路徑 | repo | 位置標籤 |
 * |---|---|---|
 * | `…/ProjectsWork_GitHub/Orgs/<org>/<repo>` | `<repo>` | `<org>/<repo>` |
 * | `…/ProjectsWork_GitHub/<group>/<repo>` | `<repo>` | `<group>/<repo>` |
 * | `…/orca/workspaces/<repo>/<ws>` | `<repo>` | `<repo>/<ws>` |
 */

export interface SessionLocation {
  /** 篩選用的鍵：同一個 repo 的不同工作區要落在一起 */
  repo: string;
  /** 畫面上顯示的位置（帶一層上層目錄，才分得出是哪一個） */
  label: string;
  kind: "repo" | "orca" | "other";
}

export function projectLocation(cwd: string): SessionLocation {
  const parts = cwd.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? cwd;

  const orca = parts.indexOf("workspaces");
  if (orca >= 0 && parts[orca - 1] === "orca" && parts.length >= orca + 3) {
    const repo = parts[orca + 1];
    return { repo, label: `${repo}/${parts[orca + 2]}`, kind: "orca" };
  }

  const root = parts.indexOf("ProjectsWork_GitHub");
  if (root >= 0) {
    const rest = parts.slice(root + 1);
    // `Orgs/<org>/<repo>` 多墊一層，拿掉 `Orgs` 之後跟其他分組同形
    const seg = rest[0] === "Orgs" ? rest.slice(1) : rest;
    if (seg.length >= 2) return { repo: seg[1], label: `${seg[0]}/${seg[1]}`, kind: "repo" };
    if (seg.length === 1) return { repo: seg[0], label: seg[0], kind: "repo" };
  }

  return { repo: last, label: last, kind: "other" };
}
