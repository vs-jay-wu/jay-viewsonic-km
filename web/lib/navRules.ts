/**
 * 導覽項目 —— 側邊欄與分頁標題**共用同一份**。
 *
 * 分開放兩份的話一定會漂移：改了側邊欄的字，分頁標題還是舊的，而且不會有人發現
 * （那兩個地方不會同時出現在視野裡）。純規則，沒有 React 相依。
 */

import type { IconName } from "@/components/Icon";

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

export const NAV: NavItem[] = [
  { href: "/", label: "首頁", icon: "home" },
  { href: "/tickets", label: "單追蹤", icon: "clipboard" },
  { href: "/vb-bugs", label: "VB Bug 總覽", icon: "alert" },
  { href: "/changes", label: "未提交的改動", icon: "code" },
  { href: "/git", label: "Repo 檢視", icon: "repos" },
  { href: "/code", label: "程式碼", icon: "code" },
  { href: "/docs", label: "文件", icon: "clipboard" },
  { href: "/sessions", label: "Claude Sessions", icon: "layers" },
  { href: "/settings", label: "設定", icon: "settings" },
];

/** 不在側邊欄、但也該有自己分頁標題的頁 */
const EXTRA_TITLES: Record<string, string> = {
  "/my-prs": "我的 PR",
  "/pr-inbox": "PR 巡邏",
  "/review-runs": "本地 review 紀錄",
  "/repos": "Repo 清單",
  "/repo-sync": "Repo 同步",
  "/work": "工作彙整",
  "/memory": "記憶體",
  "/chat": "Teams 歸檔",
};

export const APP_NAME = "KM 工作台";

/**
 * 這條路徑的分頁標題。
 *
 * **取最長的前綴**，`/repos/history` 這種子頁才會落到 `/repos` 而不是 `/`。
 * 認不得就只給 app 名字 —— 標題錯總比標題是別頁的名字好。
 */
export function titleForPath(pathname: string): string {
  if (pathname === "/") return APP_NAME;
  const all: Record<string, string> = { ...EXTRA_TITLES };
  for (const n of NAV) if (n.href !== "/") all[n.href] = n.label;

  let best = "";
  for (const href of Object.keys(all)) {
    if ((pathname === href || pathname.startsWith(href + "/")) && href.length > best.length) {
      best = href;
    }
  }
  return best ? `${all[best]} · ${APP_NAME}` : APP_NAME;
}
