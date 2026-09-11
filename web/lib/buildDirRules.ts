/**
 * 「哪些目錄算 build 產物、怎麼清」的規則。純函式（客戶端也要用）。
 *
 * 每種專案的 build 目錄與清法不一樣，所以先判斷專案類型再決定看哪些目錄。
 * **清的方式一律是刪目錄**，不是跑 `flutter clean` / `./gradlew clean`：
 * 那兩個指令做的事就是刪掉這些目錄，但要有 SDK、要起 daemon、而且會慢很多。
 * UI 上要把「實際會刪掉什麼」講出來，不要只寫「清除」。
 */

/** 超過這個大小才列出來（Jay 2026-09-11：只想看大的） */
export const SIZE_THRESHOLD_BYTES = 500 * 1024 * 1024;

export type ProjectKind = "flutter" | "gradle" | "node" | "rust" | "python" | "unknown";

export interface KindSpec {
  kind: ProjectKind;
  label: string;
  /** 判斷用的檔案（存在任一個就算） */
  markers: string[];
  /** repo 根目錄底下的 build 產物目錄 */
  dirs: string[];
  /** 子模組底下也會有的目錄名（往下找一層） */
  nestedDirs: string[];
  /** 給人看的說明：清掉之後會發生什麼 */
  note: string;
}

export const KIND_SPECS: KindSpec[] = [
  {
    kind: "flutter",
    label: "Flutter",
    markers: ["pubspec.yaml"],
    dirs: ["build", ".dart_tool"],
    nestedDirs: [],
    note: "等同 flutter clean；下次 build 要重跑 codegen 與整包編譯",
  },
  {
    kind: "gradle",
    label: "Gradle / Android",
    markers: ["settings.gradle", "settings.gradle.kts", "build.gradle", "build.gradle.kts"],
    dirs: ["build", ".gradle", ".cxx"],
    nestedDirs: ["build", ".cxx"],
    note: "等同 ./gradlew clean，另外連 .gradle 的本地快取一起清",
  },
  {
    kind: "node",
    label: "Node",
    markers: ["package.json"],
    dirs: ["node_modules", ".next", "dist", "out", ".turbo"],
    nestedDirs: [],
    note: "node_modules 要重新 install 才跑得起來",
  },
  { kind: "rust", label: "Rust", markers: ["Cargo.toml"], dirs: ["target"], nestedDirs: [],
    note: "下次 build 要整包重編" },
  { kind: "python", label: "Python", markers: ["pyproject.toml", "requirements.txt"],
    dirs: [".venv", "venv"], nestedDirs: [],
    note: "虛擬環境要重建" },
];

/** 所有可能被刪掉的目錄名 —— 刪除端用它做白名單 */
export const CLEANABLE_DIR_NAMES = new Set(
  KIND_SPECS.flatMap((s) => [...s.dirs, ...s.nestedDirs])
);

/**
 * 從 repo 根目錄的檔案清單判斷專案類型。
 *
 * 一個 repo 可能同時符合多種（Flutter 專案底下就有 android/ 的 gradle 檔），
 * 所以回傳**全部**符合的，取聯集去找目錄。
 */
export function kindsOf(rootEntries: string[]): KindSpec[] {
  const set = new Set(rootEntries);
  return KIND_SPECS.filter((s) => s.markers.some((m) => set.has(m)));
}

export interface BuildDirEntry {
  /** 相對 repo 根目錄的路徑，例如 `app/build` */
  path: string;
  bytes: number;
  kind: ProjectKind;
  /** 這個目錄沒有被 gitignore —— 不刪，顯示原因 */
  notIgnored?: boolean;
}

export interface RepoBuildDirs {
  repo: string;
  /** 絕對路徑，刪除時由 server 自己重算，不吃前端傳來的 */
  repoPath: string;
  kinds: ProjectKind[];
  dirs: BuildDirEntry[];
  totalBytes: number;
}

export interface BuildDirsSnapshot {
  scannedAt: string;
  /** 掃了幾個 repo（含沒有 build 產物的） */
  repoCount: number;
  /** 超過門檻的目錄總和 */
  totalBytes: number;
  repos: RepoBuildDirs[];
  error?: string | null;
}

/** 只留超過門檻的目錄，並依大小排序 */
export function filterBig(repos: RepoBuildDirs[]): RepoBuildDirs[] {
  return repos
    .map((r) => {
      const dirs = r.dirs
        .filter((d) => d.bytes >= SIZE_THRESHOLD_BYTES)
        .sort((a, b) => b.bytes - a.bytes);
      return { ...r, dirs, totalBytes: dirs.reduce((n, d) => n + d.bytes, 0) };
    })
    .filter((r) => r.dirs.length > 0)
    .sort((a, b) => b.totalBytes - a.totalBytes);
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / 1024 ** 2)} MB`;
}

export function noteForKinds(kinds: ProjectKind[]): string {
  return KIND_SPECS.filter((s) => kinds.includes(s.kind)).map((s) => s.note).join("；");
}
