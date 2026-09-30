// server 啟動時跑一次（每個 Next.js server instance 一次）。
// 三個排程掛在這裡，設定都存在 data/local-state/ 底下，所以 dev server
// 重開會自己接回上次的狀態：
//   - PR 巡邏（別人的單，會叫 AI）
//   - 我的 PR（自己的單，只抓狀態與通知）
//   - VB Bug 總覽（Jira 的 bug 矩陣）
//   - 指派給我的單（Jira，增量）
//   - Repo 同步（夜間把 org 的 repo 全部 pull 一次，不叫 AI）
//   - 未提交改動的快照預熱（只在有人看那一頁的時候跑）
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [prInbox, myPrs, vbBugs, repoSync, myTickets, changes] = await Promise.all([
    import("@/lib/prInboxScheduler"),
    import("@/lib/myPrs"),
    import("@/lib/vbBugs"),
    import("@/lib/repoSync"),
    import("@/lib/myTickets"),
    import("@/lib/changesScheduler"),
  ]);
  await Promise.all([
    prInbox.initScheduler().catch(() => undefined),
    myPrs.initScheduler().catch(() => undefined),
    vbBugs.initScheduler().catch(() => undefined),
    repoSync.initScheduler().catch(() => undefined),
    myTickets.initScheduler().catch(() => undefined),
    changes.initScheduler().catch(() => undefined),
  ]);
}
