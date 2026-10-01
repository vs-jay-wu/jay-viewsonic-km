// server 啟動時跑一次（每個 Next.js server instance 一次）。
// 三個排程掛在這裡，設定都存在 data/hub/ 底下，所以 dev server
// 重開會自己接回上次的狀態：
//   - PR 巡邏（別人的單，會叫 AI）
//   - 我的 PR（自己的單，只抓狀態與通知）
//   - VB Bug 總覽（Jira 的 bug 矩陣）
//   - 指派給我的單（Jira，增量）
//   - Repo 同步（夜間把 org 的 repo 全部 pull 一次，不叫 AI）
//   - 未提交改動的快照預熱（只在有人看那一頁的時候跑）
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // 角色印在啟動 log 最前面：多機器之後「我現在看的是哪一台的 km」會是最常問的
  // 問題，而 log 是唯一在畫面之外也查得到的地方（launchd 的 log 見 AGENTS.md）。
  const { kmConfig } = await import("@/lib/kmRole");
  const cfg = kmConfig();
  console.log(
    cfg
      ? `[km] 角色：${cfg.role}．機器：${cfg.machine.name}${cfg.hubUrl ? `．hub：${cfg.hubUrl}` : ""}`
      : "[km] 角色：未設定（單機模式）—— 見 docs/ideas/km-multi-machine.md §8",
  );

  /*
   * **satellite 不跑任何排程。** 第一類資料（PR／Jira／VB Bug）只有 hub 抓
   * （docs/ideas/km-multi-machine.md §2）—— 兩台各巡一遍就是這整個設計要避免的事。
   *
   * 不只是浪費：satellite 上的排程會去寫 `data/hub/…`，被 `writeStateFile` 的守衛
   * 擋下來丟例外，於是健康度開始累積失敗、首頁跳警告，而那些警告一個都不是真的。
   */
  if (cfg?.role === "satellite") {
    console.log("[km] satellite：排程不啟動（第一類資料向 hub 取）");
    /*
     * 唯一的例外：心跳。它**不抓任何遠端資料**，只是把本機事實（這台有哪些
     * session）推給 hub，所以不違反「第一類資料只有 hub 抓」。
     * 少了它，hub 上看不到這台的 session（`lib/machineRules.ts`）。
     */
    const { initHeartbeat } = await import("@/lib/machineHeartbeat");
    initHeartbeat();
    return;
  }

  // hub 也要登記自己，否則註冊表裡沒有它，satellite 上就看不到 hub 的 session
  const { initHeartbeat } = await import("@/lib/machineHeartbeat");
  initHeartbeat();

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
