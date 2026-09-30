"use client";

import { Fragment, useState } from "react";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";
import { FileRow, StageBadge, TreeRows, type ViewMode } from "@/components/FileList";
import { buildTree, countByStage, splitByStage, type ChangedFile, type WipSide } from "@/lib/changesRules";
import { laneColor, wipRowIndex, type Commit, type Graph, type GraphRow } from "@/lib/gitViewRules";

/**
 * commit 歷史 ＋ 左邊的 graph。
 *
 * 一列一個 commit，graph 用 SVG 畫在同一列裡（不是整張大圖），這樣 hover、展開、
 * 捲動都跟一般清單一樣，不必自己算捲動位置。走線的計算在 `lib/gitViewRules.ts`
 * 的 `layoutGraph`（有測試），這裡只負責畫。
 *
 * 兩個踩過的坑（Jay 2026-09-16 對照 VS Code 回報）：
 *
 * 1. **列高一定要釘死**。原本讓內容決定高度、SVG 固定 26px，於是每一列的線
 *    上下都留一截空白，整條線看起來是虛線。分支標籤會把列撐高，落差更明顯。
 * 2. **展開的區塊也要把線接下去**。VS Code 展開檔案清單時左邊的線是連續的；
 *    只畫在 commit 那一列的話，一展開線就斷一大段。
 */

/** 一列的高度（px）。**釘死**，不讓內容決定 —— 見檔頭第 1 點 */
const ROW_H = 26;
const LANE_W = 14;
const DOT_R = 3.5;

const x = (lane: number) => lane * LANE_W + LANE_W / 2;

/**
 * 一段線的顏色取「比較右邊的那條 lane」。
 *
 * 往右開出去＝新分支，用新 lane 的顏色；往左收回去＝那條分支結束，用它自己的顏色。
 * 一條規則同時涵蓋兩種，而且**同一條分支從頭到尾都是同一個顏色**（眼睛才追得下去）。
 */
const linkColor = (from: number, to: number) => laneColor(Math.max(from, to));

/** 未提交那一列分成兩區：索引（已 git add）與工作區（還沒）。
    定義在 `lib/changesRules.ts` —— 「未提交的改動」那頁也是切這兩區，不要各定義一份 */
export type { WipSide };

export default function CommitGraph({
  commits,
  graph,
  openSha,
  info,
  onToggle,
  onOpenFile,
  view,
  collapsedDirs,
  onToggleDir,
  openFile,
  flashSha,
  wip,
  headSha = null,
}: {
  commits: Commit[];
  graph: Graph;
  openSha: string | null;
  info: Record<string, { message: string; files: ChangedFile[] }>;
  onToggle: (sha: string) => void;
  onOpenFile: (sha: string | null, file: ChangedFile, side?: WipSide) => void;
  /** 展開後的檔案清單要平鋪還是樹狀（跟其他頁共用同一個偏好） */
  view: ViewMode;
  collapsedDirs: Set<string>;
  onToggleDir: (key: string) => void;
  openFile: { sha: string | null; path: string; side?: WipSide } | null;
  /** 剛跳過去的那一列，短暫highlight —— 不然在一百多列裡看不出停在哪 */
  flashSha?: string | null;
  /**
   * 本機 HEAD 的 sha。**未提交那一列要接在它上面**，不是接在清單第一列 ——
   * 看「全部分支」時第一列通常是別人的 `origin/main`（見 `wipRowIndex`）。
   */
  headSha?: string | null;
  /** 未提交的改動。畫在 HEAD 那一列上面，圓圈是虛線（照 VS Code） */
  wip?: {
    files: ChangedFile[];
    open: boolean;
    onToggle: () => void;
  };
}) {
  const width = Math.max(1, graph.width) * LANE_W;
  const hasWip = !!wip && wip.files.length > 0;
  /** 未提交要插在哪一列之前（HEAD 那一列；HEAD 不在畫面上就是最上面） */
  const wipAt = wipRowIndex(commits, headSha);
  // 畫在 HEAD 所在的 lane 上，並往下接到那一列
  const wipLane = graph.rows[wipAt]?.lane ?? 0;

  const wipRow = hasWip && wip && (
        <li>
          <button
            onClick={wip.onToggle}
            style={{ height: ROW_H }}
            className={`flex w-full items-center gap-2 overflow-hidden text-left hover:bg-surface-raised ${
              wip.open ? "bg-surface-selected" : ""
            }`}
          >
            <svg width={width} height={ROW_H} className="shrink-0" aria-hidden>
              {/* 往下接到第一個 commit */}
              <line
                x1={x(wipLane)}
                y1={ROW_H / 2}
                x2={x(wipLane)}
                y2={ROW_H}
                stroke={laneColor(wipLane)}
                strokeWidth={1.5}
              />
              {/* 虛線圓圈＝還沒進版控 */}
              <circle
                cx={x(wipLane)}
                cy={ROW_H / 2}
                r={DOT_R + 0.5}
                fill="#fff"
                stroke={laneColor(wipLane)}
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />
            </svg>
            <span className="flex min-w-0 flex-1 items-center gap-2 pr-3 text-xs">
              <span className="shrink-0 rounded-full border border-dashed border-line-strong px-1.5 font-mono text-[10px] leading-[14px] text-fg-muted">
                未提交
              </span>
              <span className="min-w-0 flex-1 truncate text-fg">
                {wip.files.length} 個檔案還沒 commit
              </span>
              {/* 收起來的時候也要看得出「有東西已經 add 了」，不然要展開才知道 */}
              {(() => {
                const n = countByStage(wip.files);
                if (!n.staged && !n.partial) return null;
                return (
                  <span className="shrink-0 text-[11px] text-fg-muted">
                    {n.staged > 0 && <span className="text-ok">{n.staged} staged</span>}
                    {n.partial > 0 && (
                      <span className="text-info">
                        {n.staged > 0 ? " · " : ""}
                        {n.partial} 部分 staged
                      </span>
                    )}
                    {n.unstaged > 0 && ` · ${n.unstaged} 未 staged`}
                  </span>
                );
              })()}
            </span>
          </button>

          {/*
            * 照 VS Code 分成兩區：**部分 staged 的檔案會同時出現在兩邊**
            * （`MM` ＝ 索引有一版、工作區還有沒 add 的改動），而且兩邊點開
            * 看到的 diff 不一樣 —— staged 那側是 `git diff --cached`
            * （commit 會帶走的），未 staged 那側是 `git diff`（不會帶走的）。
            * 標題一律畫（就算只有一區）—— 它同時是收合／展開的把手，
            * 而收合狀態跟目錄共用同一個 `collapsedDirs`，不必再開一份 state。
            */}
          {wip.open &&
            (() => {
              const { index: staged, worktree: unstaged } = splitByStage(wip.files);
              const section = (files: ChangedFile[], side: WipSide, title: string) => {
                if (files.length === 0) return null;
                const key = `wip-sec:${side}`;
                const open = !collapsedDirs.has(key);
                return (
                  <ExpandedFiles
                    key={side}
                    width={width}
                    lanes={[wipLane]}
                    files={open ? files : []}
                    keyPrefix={`wip:${side}`}
                    view={view}
                    collapsedDirs={collapsedDirs}
                    onToggleDir={onToggleDir}
                    openPath={
                      openFile && openFile.sha === null && (openFile.side ?? "worktree") === side
                        ? openFile.path
                        : null
                    }
                    onOpenFile={(f) => onOpenFile(null, f, side)}
                    onlyPartialBadge
                    header={
                      <button
                        onClick={() => onToggleDir(key)}
                        className="flex w-full items-center gap-1 text-left text-[11px] font-medium text-fg-muted hover:text-fg"
                      >
                        <Icon
                          name={open ? "chevronDown" : "chevronRight"}
                          size={12}
                          className="shrink-0 text-fg-subtle"
                        />
                        {title}
                        <span className="font-normal text-fg-subtle">{files.length}</span>
                      </button>
                    }
                  />
                );
              };
              return (
                <>
                  {section(staged, "index", "Staged Changes")}
                  {section(unstaged, "worktree", "Changes")}
                </>
              );
            })()}
        </li>
      );

  return (
    <ul>
      {/* HEAD 不在這批 commit 裡（切到別條分支、只載入前面幾頁）時 `wipAt` 是 0，
          跟以前一樣畫在最上面 */}
      {wipAt === 0 && wipRow}
      {commits.map((c, i) => {
        const row = graph.rows[i];
        const open = openSha === c.sha;
        /*
         * 第一列的上半格。
         *
         * `layoutGraph` 不知道有「未提交」那一列，所以第一個 commit 的 `up` 是空的
         * （沒有任何 lane 在等它）。上面畫了未提交那一列時，這半格要自己補，
         * 否則虛線圓圈與第一個 commit 之間會缺半列（Jay 2026-09-17 回報）。
         */
        const joinWip = i === wipAt && hasWip && row;
        return (
          <Fragment key={c.sha}>
          {i === wipAt && wipAt !== 0 && wipRow}
          <li data-sha={c.sha}>
            <button
              onClick={() => onToggle(c.sha)}
              style={{ height: ROW_H }}
              className={`flex w-full items-center gap-2 overflow-hidden text-left transition-colors hover:bg-surface-raised ${
                flashSha === c.sha ? "bg-warn/20" : open ? "bg-surface-selected" : ""
              }`}
            >
              <svg width={width} height={ROW_H} className="shrink-0" aria-hidden>
                {joinWip && (
                  <line
                    x1={x(row.lane)}
                    y1={0}
                    x2={x(row.lane)}
                    y2={ROW_H / 2}
                    stroke={laneColor(row.lane)}
                    strokeWidth={1.5}
                  />
                )}
                {row?.up.map((l, k) => (
                  <path
                    key={`u${k}`}
                    d={`M ${x(l.from)} 0 C ${x(l.from)} ${ROW_H / 4}, ${x(l.to)} ${ROW_H / 4}, ${x(l.to)} ${ROW_H / 2}`}
                    stroke={linkColor(l.from, l.to)}
                    strokeWidth={1.5}
                    fill="none"
                  />
                ))}
                {row?.down.map((l, k) => (
                  <path
                    key={`d${k}`}
                    d={`M ${x(l.from)} ${ROW_H / 2} C ${x(l.from)} ${(ROW_H * 3) / 4}, ${x(l.to)} ${(ROW_H * 3) / 4}, ${x(l.to)} ${ROW_H}`}
                    stroke={linkColor(l.from, l.to)}
                    strokeWidth={1.5}
                    fill="none"
                  />
                ))}
                {row && (
                  <circle
                    cx={x(row.lane)}
                    cy={ROW_H / 2}
                    r={c.parents.length > 1 ? DOT_R + 1 : DOT_R}
                    fill={c.parents.length > 1 ? "#fff" : laneColor(row.lane)}
                    stroke={laneColor(row.lane)}
                    strokeWidth={1.5}
                  />
                )}
              </svg>

              <span className="flex min-w-0 flex-1 items-center gap-2 pr-3 text-xs">
                {c.refs.map((r) => (
                  <span
                    key={r.name}
                    className={`shrink-0 rounded-full border px-1.5 font-mono text-[10px] leading-[14px] ${
                      r.kind === "head"
                        ? "border-accent/50 bg-surface-selected text-accent"
                        : r.kind === "remote"
                          ? "border-line bg-surface-raised text-fg-muted"
                          : r.kind === "tag"
                            ? "border-warn/40 bg-warn-bg text-warn"
                            : "border-ok/40 bg-ok-bg text-ok"
                    }`}
                  >
                    {r.kind === "head" && "HEAD → "}
                    {r.name}
                  </span>
                ))}
                <span className="min-w-0 flex-1 truncate text-fg">{c.subject}</span>
                <span className="shrink-0 font-mono text-[11px] text-fg-disabled">{c.shortSha}</span>
                <span className="w-16 shrink-0 truncate text-right text-[11px] text-fg-subtle">
                  {c.author}
                </span>
                <span className="w-20 shrink-0 text-right text-[11px] text-fg-subtle">
                  {c.date.slice(0, 10)}
                </span>
              </span>
            </button>

            {open && (
              <Expanded
                commit={c}
                row={row}
                width={width}
                info={info[c.sha]}
                onOpenFile={(f) => onOpenFile(c.sha, f)}
                view={view}
                collapsedDirs={collapsedDirs}
                onToggleDir={onToggleDir}
                openPath={openFile?.sha === c.sha ? openFile.path : null}
              />
            )}
          </li>
          </Fragment>
        );
      })}
    </ul>
  );
}

/** 展開的內容：**檔案清單**（照 VS Code 的預設），訊息全文要按才看得到 */
function Expanded({
  commit,
  row,
  width,
  info,
  onOpenFile,
  view,
  collapsedDirs,
  onToggleDir,
  openPath,
}: {
  commit: Commit;
  row: GraphRow | undefined;
  width: number;
  info?: { message: string; files: ChangedFile[] };
  onOpenFile: (f: ChangedFile) => void;
  view: ViewMode;
  collapsedDirs: Set<string>;
  onToggleDir: (key: string) => void;
  openPath: string | null;
}) {
  const [showMessage, setShowMessage] = useState(false);
  // 訊息只有 subject 那一行時，再給一顆「訊息」按鈕只會讓人白按一次
  const hasBody = !!info && info.message.trim() !== commit.subject.trim();

  if (!info) {
    return (
      <ExpandedFiles width={width} lanes={(row?.down ?? []).map((l) => l.to)} files={[]} keyPrefix={commit.sha}
        view={view} collapsedDirs={collapsedDirs} onToggleDir={onToggleDir} openPath={null}
        onOpenFile={onOpenFile} header={<span className="text-[11px] text-fg-subtle">讀取中…</span>} />
    );
  }

  return (
    <ExpandedFiles
      width={width}
      lanes={(row?.down ?? []).map((l) => l.to)}
      files={info.files}
      keyPrefix={commit.sha}
      view={view}
      collapsedDirs={collapsedDirs}
      onToggleDir={onToggleDir}
      openPath={openPath}
      onOpenFile={onOpenFile}
      header={
        <>
          <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
            <span>{info.files.length} 個檔案</span>
            {hasBody && (
              <button
                onClick={() => setShowMessage((v) => !v)}
                className="inline-flex items-center gap-1 rounded border border-line bg-surface px-1.5 py-px text-fg-muted hover:bg-surface-raised"
              >
                <Icon name={showMessage ? "chevronDown" : "chevronRight"} size={10} />
                訊息
              </button>
            )}
            <span className="font-mono text-fg-disabled">{commit.sha}</span>
          </div>
          {showMessage && (
            <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded border border-line bg-surface px-2 py-1.5 font-mono text-[11px] leading-relaxed text-fg">
              {info.message}
            </pre>
          )}
        </>
      }
    />
  );
}

/**
 * 展開區塊：左邊把 graph 的線接下去，右邊是檔案清單。
 *
 * commit 與「未提交的改動」共用同一個 —— 兩種展開看起來要一樣，
 * 各寫一份會在縮排、狀態字母、樹狀切換上慢慢長歪。
 */
function ExpandedFiles({
  width,
  lanes,
  files,
  keyPrefix,
  view,
  collapsedDirs,
  onToggleDir,
  openPath,
  onOpenFile,
  header,
  onlyPartialBadge,
}: {
  width: number;
  /** 這一段要往下延續的 lane */
  lanes: number[];
  files: ChangedFile[];
  keyPrefix: string;
  view: ViewMode;
  collapsedDirs: Set<string>;
  onToggleDir: (key: string) => void;
  openPath: string | null;
  onOpenFile: (f: ChangedFile) => void;
  header?: React.ReactNode;
  /** 已經分區了就不用每列再標一次 staged（見 StageBadge） */
  onlyPartialBadge?: boolean;
}) {
  return (
    <div className="relative flex bg-surface-raised">
      {/* 展開區塊裡把線接下去。`preserveAspectRatio="none"` ＋ 直線，
          高度隨內容拉長也不會變形（曲線才會） */}
      <svg
        width={width}
        className="absolute inset-y-0 left-0"
        height="100%"
        viewBox={`0 0 ${width} 10`}
        preserveAspectRatio="none"
        aria-hidden
      >
        {lanes.map((lane, k) => (
          <line
            key={k}
            x1={x(lane)}
            y1={0}
            x2={x(lane)}
            y2={10}
            stroke={laneColor(lane)}
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      <div style={{ width }} className="shrink-0" />
      <div className="min-w-0 flex-1 border-y border-line py-1.5 pr-3">
        {header}
        <div className="-ml-4 mt-1">
          {view === "list" ? (
            files.map((f) => (
              <FileRow
                key={f.path}
                file={f}
                label="path"
                selected={openPath === f.path}
                onOpen={() => onOpenFile(f)}
                trailing={
                  <>
                    {f.from && (
                      <Tooltip label={`從 ${f.from} 改名`}>
                        <span className="shrink-0 text-[10px] text-accent">R</span>
                      </Tooltip>
                    )}
                    <StageBadge file={f} onlyPartial={onlyPartialBadge} />
                  </>
                }
              />
            ))
          ) : (
            <TreeRows
              nodes={buildTree(files)}
              keyPrefix={keyPrefix}
              collapsed={collapsedDirs}
              onToggle={onToggleDir}
              selectedPath={openPath}
              onOpen={onOpenFile}
              extras={(f) => ({
                trailing: <StageBadge file={f} onlyPartial={onlyPartialBadge} />,
              })}
            />
          )}
        </div>
      </div>
    </div>
  );
}
