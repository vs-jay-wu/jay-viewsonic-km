import { describe, expect, it } from "vitest";
import {
  REVEAL_TTL_MS, isHardBlocked, sortEntries, type TreeEntry, isRevealable, isSensitivePath, maskEnvValues,
  revealSecondsLeft,
} from "@/lib/codeBrowseRules";

describe("機敏檔案的解鎖分級", () => {
  it("excluded 的 keystore 目錄連解鎖都不給", () => {
    // excluded-dirs.md 寫的是「禁止讀取」，比「預設不顯示」更強
    for (const p of ["mvbf_keystore/MVBA_PlatForm.jks", "playstore_keystore/anything.txt"]) {
      expect(isHardBlocked(p), p).toBe(true);
      expect(isRevealable(p), p).toBe(false);
    }
  });

  it("repo 裡的 keystore 檔不是 hard block，但也不給解鎖按鈕（它是二進位）", () => {
    for (const p of ["android/app/release.jks", "a/b/viewsonic.keystore", "cert.p12"]) {
      expect(isSensitivePath(p), p).toBe(true);
      expect(isHardBlocked(p), p).toBe(false);
      expect(isRevealable(p), p).toBe(false); // looksBinary 那條擋下來，訊息也才誠實
    }
  });

  it("兩個 repo 的簽章密碼檔名字不一樣，兩個都要擋", () => {
    // mvbf 叫 key.properties、ragdoll-cat 叫 keystore.properties。
    // 只列其中一個的話，另一個完全沒擋（2026-09-23 實測 695 bytes 直接讀得到）
    for (const p of ["android/key.properties", "keystore.properties"]) {
      expect(isSensitivePath(p), p).toBe(true);
      expect(isRevealable(p), p).toBe(true);
    }
  });

  it(".env 與設定 json 是「預設遮起來、但可以按一下看」", () => {
    for (const p of [
      ".env",
      ".env.local",
      "app/google-services.json",
      "x-firebase-adminsdk-abc.json",
    ]) {
      expect(isSensitivePath(p), p).toBe(true);
      expect(isHardBlocked(p), p).toBe(false);
      expect(isRevealable(p), p).toBe(true);
    }
  });

  it("一般檔案不受影響", () => {
    for (const p of ["src/index.ts", ".env.example", "README.md"]) {
      expect(isSensitivePath(p), p).toBe(false);
      expect(isRevealable(p), p).toBe(false);
    }
  });
});

describe("maskEnvValues", () => {
  it("值換成 ••••，欄位名留著", () => {
    expect(maskEnvValues("TOKEN=abc123")).toBe("TOKEN=••••");
  });

  it("值裡有 = 也要整段遮掉", () => {
    // base64 的 padding 就長這樣，只切第一個 = 不夠的話會漏出後半段
    expect(maskEnvValues("KEY=aGVsbG8=world=")).toBe("KEY=••••");
  });

  it("註解與空行原樣保留（常寫著這個欄位去哪裡拿）", () => {
    const src = "# 去 Jira 設定頁拿\n\nTOKEN=xyz";
    expect(maskEnvValues(src)).toBe("# 去 Jira 設定頁拿\n\nTOKEN=••••");
  });

  it("空值不會被加上 ••••（看起來像有值）", () => {
    expect(maskEnvValues("EMPTY=")).toBe("EMPTY=");
  });

  it("沒有 = 的行原樣留著", () => {
    expect(maskEnvValues("just a line")).toBe("just a line");
  });

  it("遮完之後找不到原本的值", () => {
    const out = maskEnvValues("A=secret1\nB=secret2\n# c\nC=");
    expect(out).not.toContain("secret1");
    expect(out).not.toContain("secret2");
  });
});

describe("解鎖的自動收回", () => {
  it("剛解鎖時是整個 TTL", () => {
    expect(revealSecondsLeft(1_000, 1_000)).toBe(REVEAL_TTL_MS / 1000);
  });

  it("倒數是無條件進位 —— 不會在還有 0.4 秒時就顯示 0", () => {
    expect(revealSecondsLeft(0, REVEAL_TTL_MS - 400)).toBe(1);
  });

  it("到期就是 0", () => {
    expect(revealSecondsLeft(0, REVEAL_TTL_MS)).toBe(0);
  });

  it("過期很久也是 0，不會變成負數", () => {
    expect(revealSecondsLeft(0, REVEAL_TTL_MS * 10)).toBe(0);
  });

  it("時鐘倒退時夾在 TTL，不會倒數出一個更大的數字", () => {
    // 睡眠喚醒或改系統時間會讓 now 比 revealedAt 早
    expect(revealSecondsLeft(10_000, 5_000)).toBe(REVEAL_TTL_MS / 1000);
  });
});

describe("sortEntries", () => {
  const e = (name: string, kind: "dir" | "file" = "file") => ({ name, path: name, kind }) as TreeEntry;

  it("目錄在檔案前面", () => {
    const out = sortEntries([e("zzz.ts"), e("aaa", "dir")]).map((x) => x.name);
    expect(out).toEqual(["aaa", "zzz.ts"]);
  });

  it("點開頭的排在最前面，不是最後面（跟 VS Code 一樣）", () => {
    // 排到最後面時 `.claude`、`.github` 看起來像被藏起來了
    const out = sortEntries([
      e("android", "dir"), e(".claude", "dir"), e("assets", "dir"), e(".github", "dir"),
    ]).map((x) => x.name);
    expect(out).toEqual([".claude", ".github", "android", "assets"]);
  });

  it("檔案也一樣", () => {
    const out = sortEntries([e("README.md"), e(".gitignore")]).map((x) => x.name);
    expect(out[0]).toBe(".gitignore");
  });
});
