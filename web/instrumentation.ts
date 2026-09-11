// server 啟動時跑一次（每個 Next.js server instance 一次）。
// 三個排程掛在這裡，設定都存在 data/local-state/ 底下，所以 dev server
// 重開會自己接回上次的狀態：
//   - PR 巡邏（別人的單，會叫 AI）
//   - 我的 PR（自己的單，只抓狀態與通知）
//   - VB Bug 總覽（Jira 的 bug 矩陣）
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [prInbox, myPrs, vbBugs] = await Promise.all([
    import("@/lib/prInboxScheduler"),
    import("@/lib/myPrs"),
    import("@/lib/vbBugs"),
  ]);
  await Promise.all([
    prInbox.initScheduler().catch(() => undefined),
    myPrs.initScheduler().catch(() => undefined),
    vbBugs.initScheduler().catch(() => undefined),
  ]);
}
