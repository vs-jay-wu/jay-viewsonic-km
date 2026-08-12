import type { ConceptId } from './types'

export const GLOSSARY_GROUPS = [
  'webrtc',
  'codec',
  'container',
  'protocol',
  'discovery',
  'platform',
  'product',
] as const

export type GlossaryGroup = (typeof GLOSSARY_GROUPS)[number]

export const GLOSSARY_GROUP_LABEL: Record<GlossaryGroup, string> = {
  webrtc: 'WebRTC 與傳輸',
  codec: '編解碼與速率控制',
  container: '容器與封包',
  protocol: '串流與投放協議',
  discovery: '裝置發現與網路',
  platform: '平台與驅動',
  product: '產品與組織',
}

export type Term = {
  /** 縮寫本身。用 " / " 分隔多個寫法（例如 "PTS / DTS"），會自動拆成 aliases */
  abbr: string
  /** 全稱。沒有官方全稱的（例如 QUIC）留空 */
  full?: string
  /** 一句話解釋，講「它在這個 domain 裡幹什麼」而不是字典定義 */
  gloss: string
  group: GlossaryGroup
  /** 想深入就去這一頁 */
  concept?: ConceptId
  /** 同一個縮寫在別的領域指別的東西 —— 這是真的會咬人的 */
  clash?: string
  /**
   * 額外要在內文中被辨識出來的寫法。
   * `abbr` 用 " / " 分隔的部分會自動加入，這裡只放它推不出來的（例如 H.264 對應 AVC）。
   */
  aliases?: string[]
  /** 內文出現頻率太高、標註起來反而吵的，設 true 就不自動標註（仍會列在 glossary 頁） */
  noAnnotate?: true
}

/**
 * 內文自動標註用的查表：所有寫法 → Term。
 * 標註時刻意「區分大小寫」—— TURN、FIR、ICE、DASH 都是英文單字，
 * 只有全大寫的形式才是協議名，不然會誤標一堆東西。
 */
export function buildAliasIndex(): { aliases: string[]; byAlias: Map<string, Term> } {
  const byAlias = new Map<string, Term>()

  for (const term of TERMS) {
    if (term.noAnnotate) continue
    const forms = new Set<string>([
      ...term.abbr.split(' / ').map((s) => s.trim()),
      ...(term.aliases ?? []),
    ])
    for (const f of forms) {
      if (f.length < 2) continue
      // 先登記的優先，避免 alias 互搶
      if (!byAlias.has(f)) byAlias.set(f, term)
    }
  }

  // 長的排前面，這樣 AAC-LC 會先於 AAC 被匹配到
  const aliases = [...byAlias.keys()].sort((a, b) => b.length - a.length)
  return { aliases, byAlias }
}

export const TERMS: Term[] = [
  // ───────────── WebRTC 與傳輸 ─────────────
  {
    abbr: 'SDP',
    full: 'Session Description Protocol',
    gloss: '能力協商用的純文字文件：支援哪些 codec、解析度、加密指紋、傳送方向。offer/answer 交換的就是它。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'RTP',
    full: 'Real-time Transport Protocol',
    gloss: '即時媒體的封包標頭 —— 序號、時間戳、來源識別。不是容器，沒有「檔案」的概念。',
    group: 'webrtc',
    concept: 'containers',
  },
  {
    abbr: 'SRTP',
    full: 'Secure Real-time Transport Protocol',
    gloss: '加密版的 RTP。WebRTC 的媒體一律走這個，沒有關掉的選項。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'RTCP',
    full: 'RTP Control Protocol',
    gloss: 'RTP 的回饋通道：回報丟包率、RTT、抖動，也用來請求 keyframe。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'DTLS',
    full: 'Datagram Transport Layer Security',
    gloss: '搬到 UDP 上的 TLS。WebRTC 用它握手交換 SRTP 的金鑰；憑證是自簽的，靠 SDP 裡的指紋防中間人。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'ICE',
    full: 'Interactive Connectivity Establishment',
    gloss: '「把所有可能的位址都列出來然後全部試一遍」的連線建立框架。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'STUN',
    full: 'Session Traversal Utilities for NAT',
    gloss: '問一句「我從外面看起來是什麼 IP 跟埠」。成本幾乎為零。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'TURN',
    full: 'Traversal Using Relays around NAT',
    gloss: '打洞失敗時的中繼伺服器。幾乎一定成功，但所有媒體都經過它，頻寬成本直接乘上去。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'NAT',
    full: 'Network Address Translation',
    gloss: '讓多台機器共用一個公網 IP 的機制，也是 P2P 一切麻煩的來源。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'SCTP',
    full: 'Stream Control Transmission Protocol',
    gloss: 'DataChannel 的底層。可設定成可靠或不可靠、有序或無序。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'SSRC',
    full: 'Synchronization Source',
    gloss: 'RTP 標頭裡標識「這是哪一路流」的 ID。simulcast 時同一個來源會有多個 SSRC。',
    group: 'webrtc',
    concept: 'containers',
  },
  {
    abbr: 'SFU',
    full: 'Selective Forwarding Unit',
    gloss: '一對多的中間人，只複製轉發封包、不解碼不轉碼。AirSync 把它跑在裝置本機而不是雲端。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'MCU',
    full: 'Multipoint Control Unit',
    gloss: '會解碼、合成一張大畫面、再重新編碼的中間人。成本極高，只在接收端很弱時才值得。',
    group: 'webrtc',
    concept: 'webrtc',
  },
  {
    abbr: 'BWE',
    full: 'Bandwidth Estimation',
    gloss: '頻寬估測。它的輸出會變成編碼器的目標 bitrate —— 所以畫面變糊通常是它的決定。',
    group: 'webrtc',
    concept: 'transport',
  },
  {
    abbr: 'GCC',
    full: 'Google Congestion Control',
    gloss: 'WebRTC 主流的擁塞控制演算法。看封包間隔在接收端是否被拉大，比等丟包才反應更早。',
    group: 'webrtc',
    concept: 'transport',
    clash: '也是 GNU Compiler Collection',
  },
  {
    abbr: 'ALR',
    full: 'Application-Limited Region',
    gloss: '應用程式送不滿可用頻寬的狀態。螢幕分享因為畫面常常不動，天生大量處在這裡 —— libwebrtc 為它準備了一組專屬 BWE 參數。',
    group: 'webrtc',
    concept: 'transport',
  },
  {
    abbr: 'RTT',
    full: 'Round-Trip Time',
    gloss: '封包來回一趟的時間。fork 裡有一整條改動是在對付「RTT 抖動造成 FPS 崩掉」。',
    group: 'webrtc',
    concept: 'transport',
  },
  {
    abbr: 'PLI',
    full: 'Picture Loss Indication',
    gloss:
      '「我丟包了、解不出來，給我一個新的 I-frame」。RFC 4585，是丟包復原用的，即時場景用它取代重傳。',
    group: 'webrtc',
    concept: 'codecs',
  },
  {
    abbr: 'FIR',
    full: 'Full Intra Request',
    gloss:
      '「給我一個可以開始解的點」。RFC 5104，用在不是因為丟包的情況 —— 新接收端剛加入、或 SFU 切換來源。規格明講不該拿它做一般丟包復原（那是 PLI 的事）。',
    group: 'webrtc',
    concept: 'codecs',
  },
  {
    abbr: 'NACK',
    full: 'Negative Acknowledgement',
    gloss: '「這個序號的封包沒到，重傳」。只在 RTT 短到來得及時才用。',
    group: 'webrtc',
    concept: 'transport',
  },
  {
    abbr: 'QUIC',
    full: 'Quick UDP Internet Connections（原意，現已不視為縮寫）',
    gloss: '建在 UDP 上、內建 TLS 的傳輸協議（HTTP/3 的底層）。支援多個獨立 stream，避開 TCP 的 head-of-line blocking。RFC 9000 起 QUIC 就是它的名字本身，不再展開。',
    group: 'webrtc',
    concept: 'transport',
  },
  {
    abbr: 'MTU',
    full: 'Maximum Transmission Unit',
    gloss: '單一封包大小上限，通常 1500 bytes。這就是為什麼一個 I-frame 必須切成幾十個封包。',
    group: 'webrtc',
    concept: 'containers',
  },

  // ───────────── 編解碼與速率控制 ─────────────
  {
    abbr: 'GOP',
    full: 'Group of Pictures',
    gloss: '兩個 I-frame 之間的一段。GOP 越長越省頻寬，但丟包後恢復越慢、新加入者等越久。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'IDR',
    full: 'Instantaneous Decoder Refresh',
    gloss: '一種強力的 I-frame，同時宣告「後面的幀都不准參考我之前的內容」。fork 裡刻意把週期性 IDR 關掉。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'PIR',
    full: 'Progressive Intra Refresh',
    gloss: '把 I-frame 攤開：每幀只刷新畫面的一小條，幾十幀後整張刷完。效果等價但 bitrate 完全平順。',
    group: 'codec',
    concept: 'codecs',
    clash: '在硬體領域是 Passive Infrared（被動紅外線感應）',
  },
  {
    abbr: 'QP',
    full: 'Quantization Parameter',
    gloss: '量化強度，直接對應畫質。編碼器「降 bitrate」的手段就是加大 QP —— 所以畫面就糊了。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'CBR',
    full: 'Constant Bit Rate',
    gloss: '鎖定固定位元率，畫面複雜時犧牲品質。頻寬可預測，是即時串流的教科書答案。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'VBR',
    full: 'Variable Bit Rate',
    gloss: '允許位元率隨內容浮動。PeakConstrainedVBR 是有峰值上限的版本，fork 最後選了它。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'CRF',
    full: 'Constant Rate Factor',
    gloss: '鎖定「品質」，位元率完全由內容決定。適合離線轉檔，不能用在有頻寬上限的即時場景。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'AVC',
    full: 'Advanced Video Coding',
    gloss: '就是 H.264。實務上的預設選擇 —— 不是因為最好，是因為任何裝置都有硬體編解碼。',
    group: 'codec',
    concept: 'codecs',
    aliases: ['H.264'],
  },
  {
    abbr: 'HEVC',
    full: 'High Efficiency Video Coding',
    gloss: '就是 H.265。比 H.264 省約 40%，但授權最麻煩、硬編支援不如硬解普及。',
    group: 'codec',
    concept: 'codecs',
    aliases: ['H.265'],
  },
  {
    abbr: 'AAC / AAC-LC',
    full: 'Advanced Audio Coding / Low Complexity',
    gloss: '主流音訊編碼。LC 是最常見的 profile；recorder 用的是 96 kbps 單聲道 AAC-LC。',
    group: 'codec',
    concept: 'codecs',
  },
  {
    abbr: 'AEC',
    full: 'Acoustic Echo Cancellation',
    gloss: '回音消除。fork 的上游改動裡有一條是「Windows 內建 AEC 開啟時搶不到麥克風」。',
    group: 'codec',
    concept: 'capture',
  },

  // ───────────── 容器與封包 ─────────────
  {
    abbr: 'NAL',
    full: 'Network Abstraction Layer (unit)',
    gloss: 'H.264 的資料單位。封包化就是把 NAL 塞進 RTP —— 太大要切（FU-A），太小可合併（STAP-A）。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'FU-A',
    full: 'Fragmentation Unit type A',
    gloss: '把一個大 NAL 切成多個 RTP 封包的方式。丟任何一包，整個 NAL 就報廢。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'STAP-A',
    full: 'Single-Time Aggregation Packet type A',
    gloss: '把幾個很小的 NAL（例如 SPS + PPS）合併進一個封包，省標頭開銷。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'SPS / PPS',
    full: 'Sequence / Picture Parameter Set',
    gloss: 'H.264 的解碼參數（解析度、profile 等）。沒有它們解碼器什麼都解不出來。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'PTS / DTS',
    full: 'Presentation / Decode Time Stamp',
    gloss: '什麼時候該顯示 / 什麼時候該解碼。有 B-frame 時兩者不相等 —— 這是 DTS 存在的唯一理由。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'fMP4',
    full: 'fragmented MP4',
    gloss: '每個片段自帶索引（moof）的 MP4。寫到哪就有效到哪，也是 HLS/DASH 能邊下載邊播的基礎。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'ISO BMFF',
    full: 'ISO Base Media File Format',
    gloss: 'MP4 的正式名稱。由一堆嵌套的 box（atom）組成，關鍵是 ftyp / moov / mdat。',
    group: 'container',
    concept: 'containers',
  },
  {
    abbr: 'FLV',
    full: 'Flash Video',
    gloss: 'RTMP 用的容器格式。Flash 死了但 FLV 因為 RTMP 還活著 —— SrsFlvMuxer 的 Flv 就是它。',
    group: 'container',
    concept: 'storage',
  },

  // ───────────── 串流與投放協議 ─────────────
  {
    abbr: 'RTMP',
    full: 'Real-Time Messaging Protocol',
    gloss: '建在 TCP 上的直播推流協議。延遲以秒計，但是所有直播平台二十年來的通用入口 —— recorder 的 live 就走這個。',
    group: 'protocol',
    concept: 'storage',
  },
  {
    abbr: 'RTSP',
    full: 'Real Time Streaming Protocol',
    gloss: '控制串流的協議（播放/暫停/seek），媒體本身通常走 RTP。監視器領域的主流。',
    group: 'protocol',
  },
  {
    abbr: 'HLS',
    full: 'HTTP Live Streaming',
    gloss: 'Apple 的切片式串流：把影片切成小段用普通 HTTP 傳。延遲高但穿透一切防火牆。',
    group: 'protocol',
    concept: 'containers',
  },
  {
    abbr: 'DASH',
    full: 'Dynamic Adaptive Streaming over HTTP',
    gloss: 'HLS 的開放標準對應物。同樣是切片 + manifest。',
    group: 'protocol',
    concept: 'containers',
  },
  {
    abbr: 'RAOP',
    full: 'Remote Audio Output Protocol',
    gloss: 'AirPlay 的音訊部分，mDNS 服務名是 _raop._tcp。',
    group: 'protocol',
    concept: 'vendor-protocols',
  },
  {
    abbr: 'OSP',
    full: 'Open Screen Protocol',
    gloss: 'W3C 想推的開放投放標準，用來取代各家私有協議。採用率低，但 Chromium 的實作品質很好。',
    group: 'protocol',
    concept: 'vendor-protocols',
  },
  {
    abbr: 'DRM',
    full: 'Digital Rights Management',
    gloss: '內容保護（FairPlay Streaming、Widevine 這類）。注意：這個 domain 碰到的多半不是內容 DRM，而是「裝置認證」。',
    group: 'protocol',
    concept: 'drm-auth',
    clash: '在 Linux 是 Direct Rendering Manager（顯示子系統，vkms 掛在它下面）—— 完全不同的東西',
  },

  // ───────────── 裝置發現與網路 ─────────────
  {
    abbr: 'mDNS',
    full: 'multicast DNS',
    gloss: '沒有 DNS 伺服器，改成往 224.0.0.251:5353 廣播詢問，誰認得自己就自己回答。解析 .local 網域。',
    group: 'discovery',
    concept: 'discovery',
  },
  {
    abbr: 'DNS-SD',
    full: 'DNS Service Discovery',
    gloss: '規定「怎麼用 PTR / SRV / TXT 記錄描述一個服務」的慣例。通常跑在 mDNS 上。',
    group: 'discovery',
    concept: 'discovery',
  },
  {
    abbr: 'PTR / SRV / TXT',
    full: 'Pointer / Service / Text (DNS record)',
    gloss: '「有誰提供這服務」/「它在哪個埠」/「它的能力是什麼」。裝置清單就是一堆 PTR 回應。',
    group: 'discovery',
    concept: 'discovery',
  },
  {
    abbr: 'IGMP',
    full: 'Internet Group Management Protocol',
    gloss: '多播的加入／離開通知。網路設備沒正確做 IGMP snooping 時，多播會變成廣播打爆網段。',
    group: 'discovery',
    concept: 'transport',
  },
  {
    abbr: 'SSDP',
    full: 'Simple Service Discovery Protocol',
    gloss: 'UPnP 系的裝置發現，走 UDP 1900 多播。舊版 Google Cast 的發現路徑之一，開白名單時容易漏掉。',
    group: 'discovery',
    concept: 'discovery',
  },
  {
    abbr: 'PTP',
    full: 'Precision Time Protocol',
    gloss: 'IEEE 1588 的高精度時鐘同步，走 UDP 319/320。AirPlay 2 用它對時 —— 沒放行的表現是「連上了但畫面不動」，很難聯想到是時鐘問題。',
    group: 'discovery',
    concept: 'vendor-protocols',
  },
  {
    abbr: 'OTP',
    full: 'One-Time Password',
    gloss: '大螢幕顯示短碼、使用者輸入。它天然帶有「你人在這間教室」的驗證性質，而且繞過裝置發現。',
    group: 'discovery',
    concept: 'drm-auth',
  },

  // ───────────── 平台與驅動 ─────────────
  {
    abbr: 'MF',
    full: 'Media Foundation',
    gloss: 'Windows 的多媒體框架，硬體 H.264 編碼器就掛在它下面。fork 裡絕大多數改動的主戰場。',
    group: 'platform',
    concept: 'codecs',
  },
  {
    abbr: 'IDD / IddCx',
    full: 'Indirect Display Driver / Class extension',
    gloss: 'Windows 造虛擬顯示器的官方機制。是使用者模式驅動，但還是要 WDK、簽章與 Driver Attestation。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'WDDM',
    full: 'Windows Display Driver Model',
    gloss: 'Windows 的顯示驅動模型。IDD 是它的一種。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'WDK',
    full: 'Windows Driver Kit',
    gloss: '寫 Windows 驅動的工具組。虛擬音訊那個 repo 要的是 WDK 7.1.0 —— Windows 7 時代的版本。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'WDM',
    full: 'Windows Driver Model',
    gloss: '比 WDDM 更早的通用驅動模型，音訊驅動仍在用。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'APO',
    full: 'Audio Processing Object',
    gloss: 'Windows 音訊管線上可插入的處理模組。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'VAC',
    full: 'Virtual Audio Cable',
    gloss: 'Muzychenko 的商業虛擬音效卡。edu-as-virtual-audio-cable 是它的 fork，產出 airsyncaudio 驅動。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'QSV',
    full: 'Quick Sync Video',
    gloss: 'Intel 的硬體編解碼。fork 的註解特別提到「ICodecAPI 拿不到，這在 Intel QSV 上很常見」。',
    group: 'platform',
    concept: 'codecs',
  },
  {
    abbr: 'MMCSS',
    full: 'Multimedia Class Scheduler Service',
    gloss: 'Windows 給多媒體執行緒的優先權服務。fork 引入它來改善播放的計時精度。',
    group: 'platform',
  },
  {
    abbr: 'KMS / vkms',
    full: 'Kernel Mode Setting / Virtual KMS',
    gloss: 'Linux 的顯示模式設定；vkms 是核心內建的虛擬顯示器模組，modprobe 就多一個螢幕。',
    group: 'platform',
    concept: 'capture',
    clash: 'KMS 在雲端是 Key Management Service',
  },
  {
    abbr: 'SCK',
    full: 'ScreenCaptureKit',
    gloss: 'macOS 12.3+ 的官方擷取框架。效率很好，所以 macOS 不太需要虛擬顯示器。',
    group: 'platform',
    concept: 'capture',
  },
  {
    abbr: 'SIP',
    full: 'System Integrity Protection',
    gloss: 'macOS 的系統保護機制。討論 kext 時會出現 —— 但 AudioServerPlugIn 不需要停用它。',
    group: 'platform',
    concept: 'capture',
    clash: 'VoIP 領域是 Session Initiation Protocol —— 完全不同的東西',
  },
  {
    abbr: 'SoC',
    full: 'System on Chip',
    gloss: '整合式晶片。硬體編解碼器的行為差異幾乎都來自不同 SoC 的實作。',
    group: 'platform',
    concept: 'codecs',
  },

  // ───────────── 產品與組織 ─────────────
  {
    abbr: 'IFP',
    full: 'Interactive Flat Panel',
    gloss: '互動式大螢幕，也就是這批產品的主要目標裝置。同時是 Android flavor 的名稱之一。',
    group: 'product',
  },
  {
    abbr: 'EDLA',
    full: 'Enterprise Devices Licensing Agreement',
    gloss: 'Google 給非標準 Android 裝置的授權方案。receiver 有專屬 flavor —— 簽 platform key 但不設 sharedUserId。',
    group: 'product',
  },
  {
    abbr: 'MVB',
    full: 'myViewBoard',
    gloss: 'ViewSonic 的軟體平台品牌。repo 前綴 edu-mvb-* 大多屬於它。',
    group: 'product',
  },
  {
    abbr: 'ADO',
    full: 'Azure DevOps',
    gloss: '這批 repo 的前身。很多 README 只有一行 ADO 連結，CI 也還在從 ADO 搬到 GitHub。',
    group: 'product',
  },
]
