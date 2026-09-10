"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

function BlockView({ block }: { block: Block }) {
  const [open, setOpen] = useState(block.kind === "text");

  if (block.kind === "text") {
    return (
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
  const bottomRef = useRef<HTMLDivElement>(null);

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

  const loadEarlier = async () => {
    if (!page?.hasMore) return;
    try {
      const p = await fetchPage(page.from);
      setPage({ ...p, messages: [] });
      setMessages((prev) => [...p.messages, ...prev]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const visible = messages
    .filter((m) => (showMeta || !m.isMeta) && (showSidechain || !m.isSidechain))
    .map((m) =>
      showTools
        ? m
        : { ...m, blocks: m.blocks.filter((b) => b.kind !== "tool_use" && b.kind !== "tool_result") }
    )
    .filter((m) => m.blocks.length > 0);
  const hiddenCount = messages.length - visible.length;

  return (
    <aside className="flex h-full w-[34rem] max-w-[46vw] shrink-0 flex-col border-l border-gray-200 bg-white">
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {loading ? (
          <p className="text-sm text-gray-400">載入中…</p>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <Icon name="alert" size={15} className="mt-0.5" /> {error}
          </div>
        ) : (
          <>
            {page?.hasMore && (
              <button
                onClick={loadEarlier}
                className="mb-3 w-full rounded-lg border border-gray-200 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                載入更早的內容
              </button>
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
                      <BlockView key={j} block={b} />
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
