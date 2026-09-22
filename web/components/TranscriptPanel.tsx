"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Icon from "@/components/Icon";
import Tooltip from "@/components/Tooltip";

type BlockKind = "text" | "thinking" | "tool_use" | "tool_result" | "image";

interface Block {
  kind: BlockKind;
  text: string;
  name?: string;
  truncated?: boolean;
}
interface Message {
  role: "user" | "assistant" | "system";
  at: string | null;
  blocks: Block[];
  isSidechain: boolean;
  isMeta: boolean;
}
interface Page {
  id: string;
  sizeBytes: number;
  from: number;
  to: number;
  hasMore: boolean;
  hasNewer: boolean;
  messages: Message[];
}

/** 目前載進來的範圍。兩端各自記，因為兩個方向會分別往外長 */
interface Range {
  sizeBytes: number;
  from: number;
  to: number;
  hasMore: boolean;
  hasNewer: boolean;
}

const ROLE_LABEL: Record<Message["role"], string> = {
  user: "Jay",
  assistant: "Claude",
  system: "系統",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-TW", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function BlockView({ block, markdown }: { block: Block; markdown: boolean }) {
  const [open, setOpen] = useState(block.kind === "text");

  if (block.kind === "text") {
    // Claude 的輸出本來就是 markdown，照原字串印會看到一堆 ## 與 |---|
    return markdown ? (
      <div className="md-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.text}</ReactMarkdown>
        {block.truncated && <p className="text-xs text-fg-subtle">…（已截斷）</p>}
      </div>
    ) : (
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-fg">
        {block.text}
        {block.truncated && <span className="text-xs text-fg-subtle">…（已截斷）</span>}
      </div>
    );
  }

  const meta: Record<Exclude<BlockKind, "text">, { label: string; cls: string }> = {
    thinking:    { label: "思考",   cls: "text-info" },
    tool_use:    { label: block.name ?? "工具", cls: "text-accent" },
    tool_result: { label: "工具輸出", cls: "text-fg-muted" },
    image:       { label: "圖片",   cls: "text-fg-muted" },
  };
  const m = meta[block.kind as Exclude<BlockKind, "text">];

  return (
    <div className="rounded-md bg-surface-raised ring-1 ring-line">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs"
      >
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} className="text-fg-subtle" />
        <span className={`font-medium ${m.cls}`}>{m.label}</span>
        <span className="text-fg-subtle">{block.text.split("\n")[0].slice(0, 60)}</span>
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line px-2.5 py-2 font-mono text-[11px] leading-relaxed text-fg">
          {block.text}
          {block.truncated && "\n…（已截斷）"}
        </pre>
      )}
    </div>
  );
}

export default function TranscriptPanel({
  sessionId,
  title,
  onClose,
}: {
  sessionId: string;
  title: string;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [range, setRange] = useState<Range | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [showSidechain, setShowSidechain] = useState(false);
  // 預設只看對話 —— 不濾的話整個面板會被 Bash／工具輸出淹掉，讀不到重點
  const [showTools, setShowTools] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingNewer, setLoadingNewer] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 往前補內容時，用來把捲動位置釘在原本看的那一行 */
  const restoreRef = useRef<{ height: number; top: number } | null>(null);
  /** 自動補到滿一屏的次數上限 —— 濾掉工具輸出後可能一整段都沒東西可顯示，
   *  沒有上限就會一路把 60MB 讀完 */
  const autoFillRef = useRef(0);

  /**
   * Esc 關掉面板。
   *
   * 確認對話框開著的時候要讓給它 —— 兩個都掛在 document 上，而這個先註冊、
   * 會先跑，光看 `defaultPrevented` 是來不及的（對話框還沒擋下來）。所以直接
   * 問畫面上有沒有 alertdialog。
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (document.querySelector('[role="alertdialog"]')) return;
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fetchPage = useCallback(
    async (cursor?: { before: number } | { after: number }) => {
      // after=0 是「跳至首筆」，所以要判斷 key 在不在，不能看真假值
      const qs = !cursor
        ? ""
        : "before" in cursor
          ? `?before=${cursor.before}`
          : `?after=${cursor.after}`;
      const res = await fetch(`/api/sessions/${sessionId}/transcript${qs}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "讀取失敗");
      return json as Page;
    },
    [sessionId]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMessages([]);
    fetchPage()
      .then((p) => {
        if (cancelled) return;
        setRange(p);
        setMessages(p.messages);
        setLoading(false);
        autoFillRef.current = 0;
        requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, [fetchPage]);

  const loadEarlier = useCallback(async () => {
    const el = scrollRef.current;
    if (!range?.hasMore || loadingMore) return;
    setLoadingMore(true);
    // 先記住現在的高度與位置，內容往前接上之後要補回去
    if (el) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      const p = await fetchPage({ before: range.from });
      // 只動「前端」那一半 —— 往後載進來的範圍要留著
      setRange((r) => (r ? { ...r, from: p.from, hasMore: p.hasMore } : p));
      setMessages((prev) => [...p.messages, ...prev]);
    } catch (e) {
      setError((e as Error).message);
      restoreRef.current = null;
    } finally {
      setLoadingMore(false);
    }
  }, [range, loadingMore, fetchPage]);

  /** 往後載（只有在「跳至首筆」之後才用得到 —— 平常一開就在最尾端） */
  const loadNewer = useCallback(async () => {
    if (!range?.hasNewer || loadingNewer) return;
    setLoadingNewer(true);
    try {
      const p = await fetchPage({ after: range.to });
      setRange((r) => (r ? { ...r, to: p.to, hasNewer: p.hasNewer } : p));
      setMessages((prev) => [...prev, ...p.messages]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingNewer(false);
    }
  }, [range, loadingNewer, fetchPage]);

  /** 跳到對話開頭。整批換掉，不然中間會缺一大段卻看不出來 */
  const jumpToStart = useCallback(async () => {
    if (loading) return;
    setLoadingMore(true);
    try {
      const p = await fetchPage({ after: 0 });
      restoreRef.current = null;
      autoFillRef.current = 0;
      setRange(p);
      setMessages(p.messages);
      requestAnimationFrame(() => topRef.current?.scrollIntoView());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [loading, fetchPage]);

  /** 回到最新的一段（跳到開頭之後要回得來） */
  const jumpToEnd = useCallback(async () => {
    setLoadingMore(true);
    try {
      const p = await fetchPage();
      restoreRef.current = null;
      autoFillRef.current = 0;
      setRange(p);
      setMessages(p.messages);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }, [fetchPage]);

  // 內容往前接上後把捲動位置釘回去，不然畫面會整段跳走
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const r = restoreRef.current;
    if (!el || !r) return;
    el.scrollTop = r.top + (el.scrollHeight - r.height);
    restoreRef.current = null;
  }, [messages]);

  // 捲到接近頂端就自動往前載
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    autoFillRef.current = 0; // 使用者自己在捲，重新給自動補的額度
    if (el.scrollTop < 120) void loadEarlier();
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 120) void loadNewer();
  }, [loadEarlier, loadNewer]);

  const visible = messages
    .filter((m) => (showMeta || !m.isMeta) && (showSidechain || !m.isSidechain))
    .map((m) =>
      showTools
        ? m
        : { ...m, blocks: m.blocks.filter((b) => b.kind !== "tool_use" && b.kind !== "tool_result") }
    )
    .filter((m) => m.blocks.length > 0);
  const hiddenCount = messages.length - visible.length;

  /**
   * 內容不夠高就繼續往前載 —— 一頁 512KB 濾掉工具輸出後可能只剩幾行，
   * 甚至一行都沒有，那時沒有捲軸可捲，使用者會卡在空白畫面。
   */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || loading || loadingMore || loadingNewer) return;
    if (el.scrollHeight > el.clientHeight + 40) return;
    if (autoFillRef.current >= 12) return;
    if (!range?.hasMore && !range?.hasNewer) return;
    autoFillRef.current += 1;
    // 在開頭時要往**後**補，不然畫面空白卻沒有東西可載
    if (range?.hasMore) void loadEarlier();
    else void loadNewer();
  }, [visible.length, loading, loadingMore, loadingNewer, range, loadEarlier, loadNewer]);

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-line bg-surface shadow-2xl sm:w-[40rem] sm:max-w-[46vw]"
    >
      <div className="flex items-start gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-fg">{title}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-fg-subtle">
            {sessionId.slice(0, 8)}
            {range && ` · ${(range.sizeBytes / 1048576).toFixed(1)} MB`}
            {range?.hasMore && !range?.hasNewer && " · 顯示最近一段"}
            {range?.hasNewer && " · 顯示開頭"}
          </p>
        </div>
        {/* 這顆在面板的最上緣，泡泡往上會開到畫面外 —— 要往下開 */}
        <Tooltip
          side="bottom"
          label={range?.hasNewer ? "回到最新的一段" : "跳到這個 session 的第一則訊息"}
        >
          <button
            onClick={() => void (range?.hasNewer ? jumpToEnd() : jumpToStart())}
            disabled={loading || loadingMore}
            className="text-fg-subtle hover:text-fg disabled:opacity-40"
          >
            <Icon name={range?.hasNewer ? "toBottom" : "toTop"} size={18} />
          </button>
        </Tooltip>
        <button onClick={onClose} className="text-fg-subtle hover:text-fg" title="關閉">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="flex items-center gap-4 border-b border-line px-4 py-2 text-xs text-fg-muted">
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showMeta} onChange={(e) => setShowMeta(e.target.checked)} />
          系統訊息
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showSidechain} onChange={(e) => setShowSidechain(e.target.checked)} />
          subagent
        </label>
        <label className="inline-flex items-center gap-1.5">
          <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} />
          工具呼叫
        </label>
        {hiddenCount > 0 && <span className="text-fg-subtle">隱藏 {hiddenCount} 則</span>}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {loading ? (
          <p className="text-sm text-fg-subtle">載入中…</p>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-danger/40 bg-danger-bg px-3 py-2 text-sm text-danger">
            <Icon name="alert" size={15} className="mt-0.5" /> {error}
          </div>
        ) : (
          <>
            <div ref={topRef} />
            {range?.hasMore ? (
              <div className="mb-3 flex items-center justify-center gap-1.5 py-1.5 text-xs text-fg-subtle">
                {loadingMore ? (
                  <>
                    <Icon name="spinner" size={13} className="animate-spin" /> 載入更早的內容…
                  </>
                ) : autoFillRef.current >= 12 ? (
                  <button onClick={loadEarlier} className="text-fg-muted underline">
                    這一段沒有對話，繼續往前載
                  </button>
                ) : (
                  <>往上捲會自動載入更早的內容</>
                )}
              </div>
            ) : (
              <div className="mb-3 text-center text-xs text-fg-disabled">—— 對話開頭 ——</div>
            )}
            <div className="space-y-4">
              {visible.map((m, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        m.role === "user"
                          ? "bg-control text-on-solid"
                          : m.role === "assistant"
                            ? "bg-accent-bg text-accent"
                            : "bg-surface-sunken text-fg-muted"
                      }`}
                    >
                      {ROLE_LABEL[m.role]}
                    </span>
                    {m.isSidechain && (
                      <span className="text-[11px] text-info">subagent</span>
                    )}
                    <span className="text-[11px] text-fg-subtle">{fmtTime(m.at)}</span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {m.blocks.map((b, j) => (
                      <BlockView key={j} block={b} markdown={m.role === "assistant"} />
                    ))}
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <p className="text-sm text-fg-subtle">
                  這一段沒有對話內容 —— 試著勾「工具呼叫」或「系統訊息」，或載入更早的內容。
                </p>
              )}
            </div>
            {range?.hasNewer && (
              <div className="mt-3 flex items-center justify-center gap-1.5 py-1.5 text-xs text-fg-subtle">
                {loadingNewer ? (
                  <>
                    <Icon name="spinner" size={13} className="animate-spin" /> 載入後面的內容…
                  </>
                ) : (
                  <>往下捲會自動載入後面的內容</>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </aside>
  );
}
