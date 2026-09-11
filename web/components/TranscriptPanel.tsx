"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Icon from "@/components/Icon";

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
  hasMore: boolean;
  messages: Message[];
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
        {block.truncated && <p className="text-xs text-gray-400">…（已截斷）</p>}
      </div>
    ) : (
      <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-800">
        {block.text}
        {block.truncated && <span className="text-xs text-gray-400">…（已截斷）</span>}
      </div>
    );
  }

  const meta: Record<Exclude<BlockKind, "text">, { label: string; cls: string }> = {
    thinking:    { label: "思考",   cls: "text-violet-600" },
    tool_use:    { label: block.name ?? "工具", cls: "text-sky-700" },
    tool_result: { label: "工具輸出", cls: "text-gray-500" },
    image:       { label: "圖片",   cls: "text-gray-500" },
  };
  const m = meta[block.kind as Exclude<BlockKind, "text">];

  return (
    <div className="rounded-md bg-gray-50 ring-1 ring-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-xs"
      >
        <Icon name={open ? "chevronDown" : "chevronRight"} size={12} className="text-gray-400" />
        <span className={`font-medium ${m.cls}`}>{m.label}</span>
        <span className="text-gray-400">{block.text.split("\n")[0].slice(0, 60)}</span>
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-gray-200 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-gray-700">
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
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMeta, setShowMeta] = useState(false);
  const [showSidechain, setShowSidechain] = useState(false);
  // 預設只看對話 —— 不濾的話整個面板會被 Bash／工具輸出淹掉，讀不到重點
  const [showTools, setShowTools] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** 往前補內容時，用來把捲動位置釘在原本看的那一行 */
  const restoreRef = useRef<{ height: number; top: number } | null>(null);
  /** 自動補到滿一屏的次數上限 —— 濾掉工具輸出後可能一整段都沒東西可顯示，
   *  沒有上限就會一路把 60MB 讀完 */
  const autoFillRef = useRef(0);

  const fetchPage = useCallback(
    async (before?: number) => {
      const qs = before === undefined ? "" : `?before=${before}`;
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
        setPage(p);
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
    if (!page?.hasMore || loadingMore) return;
    setLoadingMore(true);
    // 先記住現在的高度與位置，內容往前接上之後要補回去
    if (el) restoreRef.current = { height: el.scrollHeight, top: el.scrollTop };
    try {
      const p = await fetchPage(page.from);
      setPage({ ...p, messages: [] });
      setMessages((prev) => [...p.messages, ...prev]);
    } catch (e) {
      setError((e as Error).message);
      restoreRef.current = null;
    } finally {
      setLoadingMore(false);
    }
  }, [page, loadingMore, fetchPage]);

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
  }, [loadEarlier]);

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
    if (!el || loading || loadingMore || !page?.hasMore) return;
    if (el.scrollHeight > el.clientHeight + 40) return;
    if (autoFillRef.current >= 12) return;
    autoFillRef.current += 1;
    void loadEarlier();
  }, [visible.length, loading, loadingMore, page, loadEarlier]);

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex w-[40rem] max-w-[46vw] flex-col border-l border-gray-200 bg-white shadow-2xl"
    >
      <div className="flex items-start gap-3 border-b border-gray-200 px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 font-mono text-[11px] text-gray-400">
            {sessionId.slice(0, 8)}
            {page && ` · ${(page.sizeBytes / 1048576).toFixed(1)} MB`}
            {page?.hasMore && " · 顯示最近一段"}
          </p>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-700" title="關閉">
          <Icon name="x" size={18} />
        </button>
      </div>

      <div className="flex items-center gap-4 border-b border-gray-100 px-4 py-2 text-xs text-gray-600">
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
        {hiddenCount > 0 && <span className="text-gray-400">隱藏 {hiddenCount} 則</span>}
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
      >
        {loading ? (
          <p className="text-sm text-gray-400">載入中…</p>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <Icon name="alert" size={15} className="mt-0.5" /> {error}
          </div>
        ) : (
          <>
            {page?.hasMore ? (
              <div className="mb-3 flex items-center justify-center gap-1.5 py-1.5 text-xs text-gray-400">
                {loadingMore ? (
                  <>
                    <Icon name="spinner" size={13} className="animate-spin" /> 載入更早的內容…
                  </>
                ) : autoFillRef.current >= 12 ? (
                  <button onClick={loadEarlier} className="text-gray-500 underline">
                    這一段沒有對話，繼續往前載
                  </button>
                ) : (
                  <>往上捲會自動載入更早的內容</>
                )}
              </div>
            ) : (
              <div className="mb-3 text-center text-xs text-gray-300">—— 對話開頭 ——</div>
            )}
            <div className="space-y-4">
              {visible.map((m, i) => (
                <div key={i}>
                  <div className="mb-1 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${
                        m.role === "user"
                          ? "bg-gray-900 text-white"
                          : m.role === "assistant"
                            ? "bg-sky-100 text-sky-800"
                            : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {ROLE_LABEL[m.role]}
                    </span>
                    {m.isSidechain && (
                      <span className="text-[11px] text-violet-500">subagent</span>
                    )}
                    <span className="text-[11px] text-gray-400">{fmtTime(m.at)}</span>
                  </div>
                  <div className="space-y-1.5 pl-1">
                    {m.blocks.map((b, j) => (
                      <BlockView key={j} block={b} markdown={m.role === "assistant"} />
                    ))}
                  </div>
                </div>
              ))}
              {visible.length === 0 && (
                <p className="text-sm text-gray-400">
                  這一段沒有對話內容 —— 試著勾「工具呼叫」或「系統訊息」，或載入更早的內容。
                </p>
              )}
            </div>
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </aside>
  );
}
