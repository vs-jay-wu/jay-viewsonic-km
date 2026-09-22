"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icon from "@/components/Icon";
import { buildTree, type TreeNode } from "@/lib/changesRules";

/**
 * 可以打字搜尋的下拉選單。
 *
 * 原本用原生 `<select>`，但 ragdoll-cat 有 103 條分支 —— 原生選單只能一路捲，
 * 而且在這個 app 裡樣式也不受控（跟 `confirm()` 同一個理由，見 `web/AGENTS.md`）。
 *
 * **選單用 portal ＋ `position: fixed` 畫在 `<body>` 上**：它的觸發按鈕住在一個
 * `overflow: auto` 的欄位裡，用 `absolute` 會被裁掉半截（`Tooltip` 踩過同一個坑）。
 *
 * 鍵盤：打字即篩選、↑↓ 移動、Enter 選取（停在群組上是展開／收起）、Esc 關閉。
 *
 * `grouped` 會照 `/` 分層收合（分支清單用的是同一套 `buildTree`）。
 * **一打字就攤平成搜尋結果** —— 搜尋中還要自己展開群組才看得到命中項很荒謬。
 */

export interface SearchOption {
  value: string;
  label: string;
  /** 右邊的補充資訊（分支的 ahead/behind 之類） */
  hint?: React.ReactNode;
  /** 搜尋時額外要比對的字（label 以外的別名） */
  keywords?: string;
}

const MAX_HEIGHT = 320;

type Row =
  | { kind: "group"; path: string; name: string; depth: number; count: number; expanded: boolean }
  | { kind: "option"; option: SearchOption; depth: number };

/** 一個節點底下有幾個選項 */
function countLeaves(n: TreeNode<SearchOption & { path: string }>): number {
  return n.file ? 1 : n.children.reduce((sum, c) => sum + countLeaves(c), 0);
}

export default function SearchSelect({
  value,
  options,
  onChange,
  placeholder = "搜尋…",
  ariaLabel,
  width = 260,
  grouped = false,
  pinned = [],
}: {
  value: string;
  options: SearchOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  /** 下拉選單的寬度（px），按鈕本身跟著內容寬 */
  width?: number;
  /** 照 `/` 分層收合 */
  grouped?: boolean;
  /** 永遠釘在最上面、不進樹的選項（例如「全部分支」） */
  pinned?: SearchOption[];
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const all = useMemo(() => [...pinned, ...options], [pinned, options]);
  const current = all.find((o) => o.value === value);
  /** 被手動切換過的群組（存「跟預設相反」，跟分支清單同一套） */
  const [toggled, setToggled] = useState<Set<string>>(new Set());

  const q = query.trim().toLowerCase();

  const matched = useMemo(
    () => (q ? all.filter((o) => `${o.label} ${o.keywords ?? ""}`.toLowerCase().includes(q)) : all),
    [all, q]
  );

  /** 目前選到的那個值，它的每一層祖先預設展開 */
  const openByDefault = useMemo(() => {
    const parts = value.split("/");
    return new Set(parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/")));
  }, [value]);

  /** 畫面上實際看得到的列（鍵盤上下就是走這個） */
  const rows = useMemo<Row[]>(() => {
    if (!grouped || q) return matched.map((o) => ({ kind: "option", option: o, depth: 0 }));

    const out: Row[] = pinned.map((o) => ({ kind: "option", option: o, depth: 0 }));
    const walk = (nodes: TreeNode<SearchOption & { path: string }>[], depth: number) => {
      for (const n of nodes) {
        if (n.file) {
          out.push({ kind: "option", option: n.file, depth });
          continue;
        }
        const byDefault = openByDefault.has(n.path);
        const expanded = toggled.has(n.path) ? !byDefault : byDefault;
        out.push({ kind: "group", path: n.path, name: n.name, depth, count: countLeaves(n), expanded });
        if (expanded) walk(n.children, depth + 1);
      }
    };
    walk(buildTree(options.map((o) => ({ ...o, path: o.value }))), 0);
    return out;
  }, [grouped, q, matched, options, pinned, openByDefault, toggled]);

  const place = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // 下面放不下就往上開
    const up = r.bottom + MAX_HEIGHT > window.innerHeight && r.top > MAX_HEIGHT;
    setPos({
      top: up ? r.top - 4 : r.bottom + 4,
      left: Math.min(r.left, window.innerWidth - width - 8),
      up,
    });
  }, [width]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActive(0);
  }, []);

  useEffect(() => {
    if (!open) return;
    /**
     * 外面捲動就關掉（選單是 fixed 的，跟著版面跑會錯位）——
     * 但**選單自己的清單在捲時不能關**：`scroll` 用 capture 監聽會連清單內部的捲動
     * 一起收到，於是「想往下看更多分支」變成選單消失（Jay 2026-09-17 回報）。
     */
    const onScroll = (e: Event) => {
      if (popRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) close();
    };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open, close]);

  const pick = (v: string) => {
    onChange(v);
    close();
  };

  const toggleGroup = (path: string) =>
    setToggled((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const activate = (row: Row) => {
    if (row.kind === "group") toggleGroup(row.path);
    else pick(row.option.value);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return Math.max(0, Math.min(rows.length - 1, next));
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const row = rows[active];
      if (row) activate(row);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  // 鍵盤移動時把選到的那一列捲進視野
  useEffect(() => {
    listRef.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => {
          if (open) close();
          else {
            place();
            setOpen(true);
          }
        }}
        aria-label={ariaLabel}
        className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-line-strong px-2 py-1 text-left font-mono text-[11px] text-fg hover:bg-surface-raised"
      >
        <span className="truncate">{current?.label ?? value}</span>
        <Icon name="chevronDown" size={11} className="shrink-0 text-fg-subtle" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            style={{
              top: pos.up ? undefined : pos.top,
              bottom: pos.up ? window.innerHeight - pos.top : undefined,
              left: pos.left,
              width,
            }}
            className="fixed z-[120] overflow-hidden rounded-xl border border-line bg-surface shadow-xl"
          >
            <div className="border-b border-line p-1.5">
              <div className="relative">
                <Icon
                  name="search"
                  size={13}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-fg-subtle"
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder={placeholder}
                  className="w-full rounded-lg border border-line py-1 pl-7 pr-2 text-xs outline-none focus:border-line-strong"
                />
              </div>
            </div>
            <ul ref={listRef} style={{ maxHeight: MAX_HEIGHT - 48 }} className="overflow-auto py-1">
              {rows.map((row, i) => (
                <li key={row.kind === "group" ? `g:${row.path}` : row.option.value}>
                  <button
                    onMouseEnter={() => setActive(i)}
                    onClick={() => activate(row)}
                    style={{ paddingLeft: 10 + row.depth * 12 }}
                    className={`flex w-full items-center gap-1.5 py-1 pr-2.5 text-left font-mono text-[11px] ${
                      i === active ? "bg-surface-selected" : ""
                    } ${
                      row.kind === "option" && row.option.value === value
                        ? "text-accent"
                        : "text-fg"
                    }`}
                  >
                    {row.kind === "group" ? (
                      <>
                        <Icon
                          name={row.expanded ? "chevronDown" : "chevronRight"}
                          size={11}
                          className="shrink-0 text-fg-subtle"
                        />
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                        <span className="shrink-0 text-fg-disabled">{row.count}</span>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate">
                          {/* 分層時只顯示最後一段，前面的層級在群組上 */}
                          {grouped && !q ? row.option.label.split("/").pop() : row.option.label}
                        </span>
                        {row.option.hint}
                      </>
                    )}
                  </button>
                </li>
              ))}
              {!rows.length && (
                <li className="px-2.5 py-2 text-center text-[11px] text-fg-subtle">沒有符合的</li>
              )}
            </ul>
          </div>,
          document.body
        )}
    </>
  );
}
