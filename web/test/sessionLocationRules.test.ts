import { describe, expect, it } from "vitest";
import { projectLocation } from "@/lib/sessionLocationRules";

const H = "/Users/jay.wj.wu";

describe("projectLocation", () => {
  it("Orca 的工作區歸到它自己的 repo（不是三個不相干的專案）", () => {
    for (const ws of ["thresher", "pilotfish", "kingfish"]) {
      expect(projectLocation(`${H}/orca/workspaces/edu-vbo/${ws}`)).toEqual({
        repo: "edu-vbo",
        label: `edu-vbo/${ws}`,
        kind: "orca",
      });
    }
  });

  it("org 底下的 repo：拿掉 `Orgs` 那一層，標籤帶著 org", () => {
    expect(projectLocation(`${H}/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-vbo`)).toEqual({
      repo: "edu-vbo",
      label: "Viewsonic-EDU/edu-vbo",
      kind: "repo",
    });
  });

  it("其他分組（Battle）也是同一種形狀", () => {
    expect(projectLocation(`${H}/ProjectsWork_GitHub/Battle/customer-support-ai`).label).toBe(
      "Battle/customer-support-ai"
    );
  });

  it("工作區根目錄正下方的 repo（km 自己）", () => {
    expect(projectLocation(`${H}/ProjectsWork_GitHub/jay-viewsonic-km`)).toEqual({
      repo: "jay-viewsonic-km",
      label: "jay-viewsonic-km",
      kind: "repo",
    });
  });

  it("認不得的路徑退回最後一段，不要硬湊", () => {
    expect(projectLocation("/tmp/scratch")).toEqual({
      repo: "scratch",
      label: "scratch",
      kind: "other",
    });
    expect(projectLocation("")).toEqual({ repo: "", label: "", kind: "other" });
  });

  it("worktree 是獨立的 repo 目錄，就照它自己的名字（不要併回主 repo）", () => {
    // `edu-droid-flutter-hotfix-3.10.207` 跟主 checkout 的內容不同，併在一起會看錯
    expect(
      projectLocation(`${H}/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-droid-flutter-hotfix-3.10.207`)
        .repo
    ).toBe("edu-droid-flutter-hotfix-3.10.207");
  });
});
