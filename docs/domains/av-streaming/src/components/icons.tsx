/**
 * Inline SVG 圖示。刻意不用 emoji ——
 * emoji 的字形、大小、顏色會隨作業系統與字型變，控制不了排版。
 * 這些圖示用 currentColor，所以顏色跟著文字走。
 */

type IconProps = { className?: string; title?: string }

const BASE = 'inline-block shrink-0'

function svgProps(className?: string) {
  return {
    viewBox: '0 0 16 16',
    width: 16,
    height: 16,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className: `${BASE} ${className ?? ''}`,
    'aria-hidden': true,
  }
}

/** 一般補充說明 */
export function IconNote({ className, title }: IconProps) {
  return (
    <svg {...svgProps(className)} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <circle cx="8" cy="8" r="6.25" />
      <path d="M8 7.25v4" />
      <path d="M8 4.9v.6" />
    </svg>
  )
}

/** 警告、坑、合規敏感 */
export function IconWarn({ className, title }: IconProps) {
  return (
    <svg {...svgProps(className)} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M8 2.1 14.4 13.2H1.6L8 2.1Z" />
      <path d="M8 6.4v3.1" />
      <path d="M8 11.3v.5" />
    </svg>
  )
}

/** 值得停下來想一下的洞察 */
export function IconInsight({ className, title }: IconProps) {
  return (
    <svg {...svgProps(className)} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M5.6 9.6a3.6 3.6 0 1 1 4.8 0c-.5.5-.7 1-.7 1.6H6.3c0-.6-.2-1.1-.7-1.6Z" />
      <path d="M6.4 13.1h3.2" />
      <path d="M7 14.6h2" />
    </svg>
  )
}

/** 重點條目 */
export function IconStar({ className, title }: IconProps) {
  return (
    <svg {...svgProps(className)} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M8 1.9l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.7l-3.8 2 .7-4.3-3.1-3 4.3-.6L8 1.9Z" />
    </svg>
  )
}

/** 已查證 / 已結案 */
export function IconCheck({ className, title }: IconProps) {
  return (
    <svg {...svgProps(className)} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M2.8 8.4l3.2 3.2 7.2-7.2" />
    </svg>
  )
}

/** 被推翻 / 修正 */
export function IconCorrection({ className, title }: IconProps) {
  return (
    <svg {...svgProps(className)} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d="M13.4 6.6A5.6 5.6 0 1 0 8 14" />
      <path d="M13.6 2.6v4h-4" />
    </svg>
  )
}
