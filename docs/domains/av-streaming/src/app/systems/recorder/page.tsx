import { Callout, PageHeader, Prose } from '@/components/Prose'
import { PipelineBar } from '@/components/PipelineBar'
import { RepoTable } from '@/components/RepoTable'
import { CompareGrid } from '@/components/diagrams'
import { Mermaid } from '@/components/Mermaid'
import { REPOS } from '@/data/repos'

const ONE_ENCODE_TWO_SINKS = `flowchart LR
  MP["MediaProjection<br/>+ VirtualDisplay"] --> MC["MediaCodec<br/>H.264 · 30fps · GOP 1s"]
  AR["AudioRecord<br/>MIC · 44.1k · mono"] --> MCA["MediaCodec<br/>AAC-LC 96 kbps"]
  MC --> D{"同一份<br/>編碼資料"}
  MCA --> D
  D -->|"duplicate()"| MX["MediaMuxer<br/>→ MP4 檔"]
  D --> FLV["SrsFlvMuxer<br/>→ RTMP 推流"]
  FLV --> YT["YouTube / Facebook<br/>Workplace / Twitch"]
`

export default function RecorderPage() {
  const repos = REPOS.filter((r) => r.system.includes('recorder'))

  return (
    <>
      <PageHeader
        eyebrow="system"
        title="Recorder / Live"
        lede={
          <>
            Android 螢幕錄影 —— 而且「live」就在這裡。同一份編碼同時寫成 MP4 檔<strong>並</strong>
            以 RTMP 推到 YouTube / Facebook / Workplace / Twitch。
          </>
        }
      />

      <Callout kind="insight" title="「live 是什麼」已經有答案了">
        <p>
          原本的學習清單寫 live/recorder 但掃不到 live 的 repo，我列了三個猜測。
          答案是第一個：<strong>live 不是獨立產品，是 recorder 的另一個輸出目標</strong>。
        </p>
        <p>
          證據直接寫在 repo 裡 —— <code>docs/recorder_live_app.md</code> 的標題就叫
          「Recorder、Live APP」，而 <code>app/src/main/java/.../rtmp/</code> 是個實際存在的 package。
        </p>
        <p>
          但有一點我沒猜到：<strong>直播目標是外部社群平台，不是內部串流</strong>。
          <code>FloatWindowStreamSettingsView.java</code> 裡列的是{' '}
          <code>rtmp://a.rtmp.youtube.com/live2</code>、Facebook / Workplace 的{' '}
          <code>rtmps://live-api-s.facebook.com:443/rtmp/</code>、
          <code>rtmp://live.twitch.tv/app/</code>。所以這是「老師直播上課」的功能。
        </p>
      </Callout>

      <Prose>
        <h2>一、它用到 pipeline 的哪幾段</h2>
        <p>
          原本我把 recorder 畫成完全不碰網路的那條線。加上 live 之後要修正：
          它<strong>也用到 transport</strong>，只是走 RTMP 而不是 WebRTC。
        </p>
      </Prose>

      <PipelineBar highlight={['capture', 'encode', 'mux', 'store', 'transport']} />

      <Prose>
        <h2>二、一份編碼，兩個出口</h2>
        <p>
          這是整個 repo 最值得學的一個設計決策。錄影與直播<strong>共用同一路編碼</strong>，
          不是各編一路：
        </p>
      </Prose>

      <Mermaid
        chart={ONE_ENCODE_TWO_SINKS}
        caption="MediaHelper.java 第 731 行：flvMuxer.sendVideo(recordingToMp4 ? encodedData.duplicate() : encodedData, info)。同時錄影時才需要 duplicate()，因為 MediaMuxer 會消耗 buffer 的 position。"
      />

      <Prose>
        <p>
          省一路編碼就是省一整份 CPU／GPU 與發熱，在 Android 上這個差別很實際。
          但代價是<strong>兩邊必須共用一組編碼參數</strong>，而這組參數是由要求較嚴的那一方
          決定的 —— 也就是直播。
        </p>
        <h3>所以 GOP 是 1 秒</h3>
        <p>
          <code>ScreenRecorder.java</code> 裡 <code>IFRAME_INTERVAL = 1</code>，
          也就是<strong>每秒一個 I-frame</strong>。單就錄影來說這密得沒必要
          （存檔常見是 2 秒以上），但 RTMP 直播的觀眾隨時會加入，
          而觀眾要等到下一個 I-frame 才能開始看 —— GOP 兩秒就代表最多等兩秒才出畫面。
        </p>
        <p>
          <strong>結論：錄影檔的 GOP 密度是被直播需求綁走的。</strong>
          這正是「一份編碼兩個出口」的隱性成本，而且從程式碼上看不出來，
          要把兩個功能放在一起看才會發現。
        </p>
      </Prose>

      <Callout kind="insight" title="KEY_REPEAT_PREVIOUS_FRAME_AFTER —— 螢幕錄影專屬的坑">
        <p>
          <code>format.setLong(MediaFormat.KEY_REPEAT_PREVIOUS_FRAME_AFTER, 1000000 / 30)</code>
        </p>
        <p>
          螢幕擷取跟攝影機有一個根本差別：<strong>畫面不動時，系統根本不產生新的 frame</strong>。
          老師講話講了三十秒沒動滑鼠，就三十秒沒有任何 frame 進到編碼器。
        </p>
        <p>
          後果是編碼器輸出停住 —— 錄影檔的時間軸會壞掉，而 RTMP 直播端會直接判定斷線。
          這個參數告訴編碼器「超過 1/30 秒沒有新 frame，就把上一張重複送一次」。
        </p>
        <p>
          <strong>這是那種只有真的做過螢幕錄影才會知道的參數。</strong>
          攝影機錄影完全不需要它。
        </p>
      </Callout>

      <Prose>
        <h2>三、確切的編碼參數</h2>
      </Prose>

      <CompareGrid
        columns={['設定值', '出處與備註']}
        rows={[
          {
            label: 'Video codec',
            cells: ['H.264（MIMETYPE_VIDEO_AVC）', 'COLOR_FormatSurface，MediaCodec 直接吃 Surface'],
          },
          {
            label: 'Frame rate',
            cells: ['30', 'MediaHelper.FRAME_RATE，同時設 KEY_FRAME_RATE 與 KEY_CAPTURE_RATE'],
          },
          { label: 'GOP', cells: ['1 秒', 'IFRAME_INTERVAL = 1 —— 被直播需求綁走'] },
          {
            label: 'Bitrate',
            cells: [
              '720p 4M / 1080p 6M / 2K 13M / 4K 34M',
              'setBitRateWithResolution() 的階梯；預設 ENCODING_BIT_RATE = 6 Mbps',
            ],
          },
          {
            label: '解析度選項',
            cells: ['HD 1280 / FHD 1920', 'FloatWindowResolutionView'],
          },
          {
            label: 'Audio codec',
            cells: ['AAC-LC 96 kbps', '44100 Hz、單聲道（CHANNEL_IN_MONO）'],
          },
          {
            label: 'Audio 來源',
            cells: [
              'MediaRecorder.AudioSource.MIC',
              <>
                <strong>是麥克風，不是裝置內部音訊</strong> —— 沒有用 AudioPlaybackCapture
              </>,
            ],
          },
        ]}
        verdict={
          <>
            單聲道 96 kbps 對「錄課」是合理的取捨（人聲不需要立體聲），
            但如果畫面裡在播音樂或影片，這個設定會明顯不夠。
            而<strong>音源是麥克風</strong>意味著播影片的聲音是透過空氣被錄進去的 ——
            這是產品定位（錄人講課）而不是技術限制。
          </>
        }
      />

      <Prose>
        <h2>四、暫停續錄怎麼做到的</h2>
        <p>
          <code>MediaMuxer</code> 沒有暫停功能。所以這個 App 的做法是：
          暫停就<strong>把當前檔案收掉</strong>，續錄時開一個新檔並把路徑推進{' '}
          <code>mFileList</code>；停止錄影時再把清單裡所有檔案合併成一個。
        </p>
        <p>
          合併用的是 <code>org.mp4parser</code> 的 <code>MovieCreator</code> +{' '}
          <code>AppendTrack</code>（<code>mergeMediaFiles()</code>），
          也就是在 box 層級把 track 接起來，<strong>不重新編碼</strong>。
        </p>
        <p>
          順帶一提，這也剛好緩解了「當機就整檔壞掉」的問題 ——
          雖然那不是它的設計目的。已經收掉的分段檔有完整的 <code>moov</code>，
          只有最後一段會壞。
        </p>
        <p>
          另外 <code>MediaMuxer</code> 要等第一個 <code>BUFFER_FLAG_KEY_FRAME</code> 才{' '}
          <code>start()</code>。不這樣做的話開頭幾幀是解不出來的 P-frame，
          有些播放器會直接放棄。
        </p>
      </Prose>

      <Prose>
        <h2>五、演進痕跡：MediaRecorder → MediaCodec</h2>
        <p>
          <code>docs/recorder_live_app.md</code> 把兩代寫法都留著。
          最早是 <code>MediaRecorder</code>：
        </p>
        <ul>
          <li>
            <code>setVideoSource(SURFACE)</code>、<code>setOutputFormat(MPEG_4)</code>、
            <code>setOutputFile()</code>、<code>setVideoEncoder(H264)</code> —— 十行就跑起來
          </li>
        </ul>
        <p>
          好處是極簡，代價是<strong>它只能寫檔</strong>。
          <code>MediaRecorder</code> 把編碼與封裝綁成一個黑盒，
          你拿不到中間的編碼資料 —— 所以無法同時推 RTMP。
        </p>
        <p>
          換成 <code>MediaCodec</code> + <code>MediaMuxer</code> 之後，
          編碼輸出變成自己手上的 <code>ByteBuffer</code>，
          才有可能一份餵兩個 sink。<strong>換架構的理由就是為了 live。</strong>
        </p>
      </Prose>

      <RepoTable repos={repos} />
    </>
  )
}
