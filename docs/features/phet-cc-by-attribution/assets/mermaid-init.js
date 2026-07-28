// 共用 mermaid 初始化 — 由各 HTML 頁面於 mermaid CDN 之後載入
mermaid.initialize({
  startOnLoad: true,
  theme: 'base',
  themeVariables: {
    fontFamily: '-apple-system, "Segoe UI", "PingFang TC", "Microsoft JhengHei", sans-serif',
    fontSize: '13px',
    primaryColor: '#eff6ff',
    primaryTextColor: '#1e3a8a',
    primaryBorderColor: '#2563eb',
    lineColor: '#64748b'
  },
  flowchart: { curve: 'basis', padding: 12, useMaxWidth: true }
});
