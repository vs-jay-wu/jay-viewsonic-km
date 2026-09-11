import { describe, expect, it } from "vitest";
import { groupEventsByPr, prUrlOf, type MyPrEventLike } from "@/lib/myPrEventRules";

const ev = (o: Partial<MyPrEventLike> & { id: string; at: string }): MyPrEventLike => ({
  type: "commented", actor: "someone", repo: "Viewsonic-EDU/edu-droid-flutter",
  number: 237, title: "[Task VSFT-9941] …",
  url: "https://github.com/Viewsonic-EDU/edu-droid-flutter/pull/237#discussion_r1",
  read: false, ...o,
});

describe("groupEventsByPr", () => {
  it("同一張 PR 的併成一群，群內新的在上面", () => {
    const groups = groupEventsByPr([
      ev({ id: "a", at: "2026-09-11T01:00:00Z" }),
      ev({ id: "b", at: "2026-09-11T03:00:00Z", type: "approved", actor: "jacky" }),
      ev({ id: "c", at: "2026-09-11T02:00:00Z" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events.map((e) => e.id)).toEqual(["b", "c", "a"]);
    expect(groups[0].latestAt).toBe("2026-09-11T03:00:00Z");
  });

  it("不同 PR 分開，最新有動靜的排最前面（跟已讀無關）", () => {
    const groups = groupEventsByPr([
      ev({ id: "a", at: "2026-09-10T01:00:00Z", number: 1, read: false }),
      ev({ id: "b", at: "2026-09-11T09:00:00Z", number: 2, read: true }),
    ]);
    expect(groups.map((g) => g.number)).toEqual([2, 1]);
  });

  it("未讀是逐群算的", () => {
    const groups = groupEventsByPr([
      ev({ id: "a", at: "2026-09-11T01:00:00Z", read: false }),
      ev({ id: "b", at: "2026-09-11T02:00:00Z", read: true }),
      ev({ id: "c", at: "2026-09-11T03:00:00Z", read: false }),
    ]);
    expect(groups[0].unread).toBe(2);
  });

  it("標題以最新那則為準（PR 改過名時舊事件記的是舊標題）", () => {
    const groups = groupEventsByPr([
      ev({ id: "a", at: "2026-09-11T01:00:00Z", title: "舊標題" }),
      ev({ id: "b", at: "2026-09-11T05:00:00Z", title: "新標題" }),
    ]);
    expect(groups[0].title).toBe("新標題");
  });

  it("群的連結指向 PR 本身，不是某一則留言的錨點", () => {
    expect(prUrlOf("https://github.com/o/r/pull/7#pullrequestreview-123"))
      .toBe("https://github.com/o/r/pull/7");
    expect(prUrlOf("https://github.com/o/r/pull/7")).toBe("https://github.com/o/r/pull/7");
  });

  it("沒有事件就沒有群", () => {
    expect(groupEventsByPr([])).toEqual([]);
  });
});
