import type { ConceptId, PipelineStage, RepoGroup, SystemId } from './types'

export const STAGE_META: Record<
  PipelineStage,
  { label: string; blurb: string; concept?: ConceptId }
> = {
  discover: {
    label: '裝置發現',
    blurb: '在同一個網段找到對面那台機器。mDNS/DNS-SD、多播。',
    concept: 'discovery',
  },
  auth: {
    label: '認證 / 配對',
    blurb: '證明「我可以連你」。AirPlay 的 FairPlay 握手、Google Cast keyset、OTP。',
    concept: 'drm-auth',
  },
  capture: {
    label: '擷取',
    blurb: '把螢幕像素與音訊取出來。虛擬顯示器驅動、MediaProjection、虛擬音效卡。',
    concept: 'capture',
  },
  encode: {
    label: '編碼',
    blurb: '原始像素壓成 H.264/VP8/AV1。硬編 vs 軟編、bitrate、GOP、simulcast。',
    concept: 'codecs',
  },
  mux: {
    label: '封裝',
    blurb: '壓好的幀塞進容器或封包。RTP packetization、fMP4、WebM。',
    concept: 'containers',
  },
  signal: {
    label: '信令',
    blurb: '交換「怎麼連」的資訊。SDP offer/answer、ICE candidate、房間管理。',
    concept: 'webrtc',
  },
  transport: {
    label: '傳輸',
    blurb: '封包實際飛過去。ICE/STUN/TURN、DTLS-SRTP、WebTransport/QUIC。',
    concept: 'transport',
  },
  relay: {
    label: '轉發',
    blurb: '一對多時由中間人複製流。SFU（不轉碼）vs MCU（轉碼）。',
    concept: 'webrtc',
  },
  demux: {
    label: '解封裝',
    blurb: '從封包/容器把幀取回來，處理亂序、丟包、jitter buffer。',
    concept: 'containers',
  },
  decode: {
    label: '解碼',
    blurb: '壓縮幀還原成像素。硬解限制、decoder 數量上限是真實的坑。',
    concept: 'codecs',
  },
  render: {
    label: '顯示',
    blurb: '畫到螢幕上。多視窗、浮動視窗、畫面配置。',
  },
  store: {
    label: '儲存',
    blurb: '不即時播放而是落地成檔。muxing 到 MP4、上傳、簽名 URL。',
    concept: 'storage',
  },
  control: {
    label: '反向控制',
    blurb: '資料倒著走：接收端把觸控/鍵鼠事件送回發送端。',
  },
}

export const GROUP_META: Record<RepoGroup, { label: string; blurb: string }> = {
  app: {
    label: '主應用',
    blurb: '使用者實際安裝的 App。整個 pipeline 在這裡被組裝起來。',
  },
  'webrtc-core': {
    label: 'WebRTC 核心與繫結',
    blurb: 'libwebrtc 的 C++ fork，以及往上包到 Dart/Flutter 的各層繫結。',
  },
  'go-transport': {
    label: 'Go 傳輸與 SFU',
    blurb: 'pion 生態 + ion-sfu。編成 .aar 塞進裝置，SFU 跑在裝置本機而非雲端。',
  },
  'vendor-protocol': {
    label: '第三方投放協議',
    blurb: 'AirPlay 與 Google Cast 的相容實作 —— 讓 iPhone/Chrome 不裝 App 也能投。',
  },
  discovery: {
    label: '裝置發現',
    blurb: 'mDNS/DNS-SD、多播、Open Screen Protocol。',
  },
  'virtual-display': {
    label: '虛擬顯示器（擷取來源）',
    blurb: 'Windows Indirect Display Driver — 造一個假螢幕，內容就是要送出去的畫面。',
  },
  'virtual-audio': {
    label: '虛擬音訊（擷取來源）',
    blurb: '虛擬音效卡驅動 —— 攔截系統音訊輸出當成串流來源。',
  },
  'remote-control': {
    label: '反向控制與視窗',
    blurb: '把接收端的操作送回發送端，以及顯示端的視窗管理。',
  },
  backend: {
    label: '雲端後端',
    blurb: '不碰媒體流，只管配對、授權、房間、OTP。',
  },
  tooling: {
    label: '工具與設定',
    blurb: '不在產品資料路徑上，但開發／逆向／部署會用到。',
  },
  vendored: {
    label: '上游第三方依賴',
    blurb: '原封不動或幾乎原封不動的外部專案。知道它存在與為何在這就夠，不必深讀。',
  },
}

export const CONCEPT_META: Record<
  ConceptId,
  { label: string; blurb: string; status: 'outline' | 'draft' | 'done' }
> = {
  capture: {
    label: '畫面與音訊擷取',
    blurb: '像素從哪裡來？三條完全不同的路：作業系統 API、虛擬驅動、硬體擷取。',
    status: 'done',
  },
  codecs: {
    label: '編解碼器',
    blurb:
      '視訊：H.264 / VP8 / VP9 / AV1、I-P-B frame 與 GOP、bitrate 控制、硬編軟編、simulcast。音訊：Opus / AAC、為何容錯更低但成本更便宜。',
    status: 'done',
  },
  containers: {
    label: '容器與封裝',
    blurb: 'MP4 / fMP4 / WebM、RTP packetization。「編碼格式」與「檔案格式」是兩件事。',
    status: 'done',
  },
  webrtc: {
    label: 'WebRTC',
    blurb: 'SDP offer/answer、ICE/STUN/TURN、DTLS-SRTP、DataChannel、SFU vs MCU。',
    status: 'done',
  },
  transport: {
    label: '傳輸層',
    blurb: 'UDP/RTP 為何是即時影音的預設、QUIC 與 WebTransport 憑證機制。',
    status: 'done',
  },
  discovery: {
    label: '裝置發現',
    blurb: 'mDNS / Bonjour / DNS-SD、多播的網路現實、企業網路為何常常擋掉它。',
    status: 'done',
  },
  'vendor-protocols': {
    label: '第三方投放協議',
    blurb: 'AirPlay、Google Cast、Miracast 各自的架構與相容實作的難處。',
    status: 'done',
  },
  'drm-auth': {
    label: '裝置認證與 DRM',
    blurb: 'FairPlay 握手、Google Cast 裝置憑證、為何相容實作必須處理這層。',
    status: 'done',
  },
  storage: {
    label: '錄影與儲存',
    blurb: '即時流與落地檔的差異、邊錄邊寫的 fMP4、上傳與簽名 URL。',
    status: 'done',
  },
}

export const SYSTEM_META: Record<
  SystemId,
  { label: string; blurb: string; href: string }
> = {
  airsync: {
    label: 'AirSync',
    blurb:
      '無線投影產品線。47 個 repo，從 Windows 顯示驅動一路到 Go SFU，技術密度最高。',
    href: '/systems/airsync',
  },
  'mvb-cast': {
    label: 'MVB Cast In/Out',
    blurb: 'myViewBoard 內的投放功能，瀏覽器端 WebRTC + Node 信令。',
    href: '/systems/mvb-cast',
  },
  recorder: {
    label: 'Recorder / Live',
    blurb:
      'Android 螢幕錄影，外加 RTMP 直播到 YouTube / Facebook / Twitch。一份編碼兩個出口。',
    href: '/systems/recorder',
  },
}
