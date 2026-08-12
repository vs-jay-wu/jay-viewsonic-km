import Link from 'next/link'
import { Callout, PageHeader, Prose } from '@/components/Prose'
import { CompareGrid, Steps } from '@/components/diagrams'
import { REPOS } from '@/data/repos'

export default function Page() {
  const winRepos = REPOS.filter(
    (r) => r.group === 'virtual-display' || r.group === 'virtual-audio',
  )

  return (
    <>
      <PageHeader
        eyebrow="concept · capture · deep dive"
        title="虛擬裝置的跨平台現實"
        lede={
          <>
            「造一個假螢幕／假音效卡讓系統把內容送進來」這個手法在各平台的門檻差距極大。
            結論先講：<strong>只有 Windows 需要寫核心驅動</strong> ——
            而這解釋了為什麼 AirSync 這方面的 {winRepos.length} 個 repo 全是 C++、全是 Windows。
          </>
        }
      />

      <Prose>
        <h2>一、為什麼要「造裝置」而不是「抓畫面」</h2>
        <p>
          <Link href="/concepts/capture">擷取那頁</Link>講過三條來源路徑。
          虛擬裝置這條的核心優勢有三個：
        </p>
        <ul>
          <li>
            <strong>不需要擷取權限。</strong>你是螢幕，不是偷看螢幕的人 ——
            繞過所有作業系統的擷取授權對話框。
          </li>
          <li>
            <strong>解析度與更新率自己定。</strong>不受實體螢幕限制。
            投到 4K 大螢幕時可以直接開一個 4K 的假螢幕，即使筆電本身是 1080p。
          </li>
          <li>
            <strong>天然的「只投這個」。</strong>使用者把視窗拖進假螢幕就是投它，
            不必實作視窗選擇 UI，也不會誤投到通知或桌面。
          </li>
        </ul>
        <p>
          代價就是本頁的主題：<strong>要能造出裝置，你得有作業系統的許可</strong>，
          而各家給的許可差得非常遠。
        </p>
      </Prose>

      <Prose>
        <h2>二、五個平台的實際狀況</h2>
      </Prose>

      <CompareGrid
        columns={['虛擬顯示器', '虛擬音訊', '門檻']}
        rows={[
          {
            label: 'Windows',
            cells: [
              <>
                <strong>IddCx</strong>（Indirect Display Driver）—— 官方支援，
                但是 WDDM 驅動
              </>,
              <>
                WDM 音訊驅動 / APO。<code>edu-as-virtual-audio-cable</code> 是 VAC4 的 fork
              </>,
              <>
                <strong>最高。</strong>要 WDK、程式碼簽章、Driver Attestation
                （得先加入 Hardware Developer Program）
              </>,
            ],
          },
          {
            label: 'Android',
            cells: [
              <>
                <strong>
                  <code>DisplayManager.createVirtualDisplay()</code>
                </strong>{' '}
                —— 是公開 API，不是驅動
              </>,
              <>
                沒有虛擬音效卡概念。要抓系統音訊用{' '}
                <code>AudioPlaybackCapture</code>（API 29+）
              </>,
              <>
                <strong>最低。</strong>幾行 Java 就有一個虛擬顯示器
              </>,
            ],
          },
          {
            label: 'Linux',
            cells: [
              <>
                <code>vkms</code>（Virtual KMS）核心模組內建；X11 有{' '}
                <code>xf86-video-dummy</code> / Xvfb
              </>,
              <>
                PipeWire 虛擬節點 / PulseAudio <code>module-null-sink</code> —— 一行指令
              </>,
              <>
                <strong>低。</strong>核心與音訊系統本來就提供
              </>,
            ],
          },
          {
            label: 'macOS',
            cells: [
              <>
                <strong>沒有官方 API。</strong>只能用私有的{' '}
                <code>CGVirtualDisplay</code>（Sidecar 用的那個）
              </>,
              <>
                <strong>有官方路徑：</strong>Core Audio Server Plug-in
                （user space，不需要 kext）
              </>,
              <>
                <strong>顯示端高、音訊端低。</strong>顯示要賭私有 API，
                音訊反而乾淨
              </>,
            ],
          },
          {
            label: 'iOS',
            cells: [
              <>
                <strong>完全沒有。</strong>不存在虛擬顯示器的概念
              </>,
              <>
                <strong>完全沒有。</strong>
              </>,
              <>
                <strong>不可能。</strong>只有 ReplayKit 這條系統控制的擷取路徑
              </>,
            ],
          },
        ]}
        verdict={
          <>
            五個平台裡只有 Windows 需要進到核心／驅動層。
            Android 把同一件事做成了應用層 API，Linux 直接內建，
            macOS 音訊有官方 user-space 路徑，iOS 則整條路封閉。
          </>
        }
      />

      <Prose>
        <h2>三、Windows：唯一要寫驅動的平台</h2>
        <p>
          Windows 的 <strong>IddCx</strong>（Indirect Display Driver Class extension）
          其實已經是微軟「簡化過」的方案 —— 它是<em>使用者模式</em>驅動，
          不是完整的核心模式顯示驅動。但門檻還是遠高於其他平台：
        </p>
        <Steps
          items={[
            {
              label: '要 WDK 建置環境',
              detail: (
                <>
                  <code>edu-as-indirect-display</code> 的 README 要求 VS2022 +
                  Windows SDK 22621 + WDK，而且指定要{' '}
                  <code>MSVC v143 Spectre-mitigated</code> 版本的工具鏈。
                </>
              ),
            },
            {
              label: '要程式碼簽章',
              detail: (
                <>
                  驅動沒簽章載不進去。README 有 <code>scripts/sign_dll_cat.cmd</code>{' '}
                  處理這件事。
                </>
              ),
            },
            {
              label: '要走 Driver Attestation',
              detail: (
                <>
                  Windows 10 之後的驅動要送微軟做 attestation 簽章，
                  而前提是先註冊 Hardware Developer Program。
                  README 的 <code>scripts/make_cab.cmd</code> 就是打包送審用的。
                </>
              ),
            },
            {
              label: '安裝時要提權',
              detail: (
                <>
                  <code>pnputil /add-driver indirect_display_1_0.inf</code> 加驅動、
                  <code>sc create</code> 建一個常駐 Windows 服務管理生命週期。
                  所以 AirSync 在 Windows 上的安裝一定要管理員權限。
                </>
              ),
            },
          ]}
        />
        <p>
          這條鏈解釋了為什麼虛擬顯示器要拆成四個 repo：
          <code>edu-as-indirect-display</code>（驅動本體）、
          <code>edu-as-virtual-display-api</code>（API 層）、
          <code>edu-as-virtual-display-service</code>（常駐服務）、
          <code>edu-as-virtual-display</code>（Flutter plugin）。
          <strong>驅動、服務、應用程式三個執行層級各自獨立，中間要有 IPC。</strong>
        </p>
        <h3>虛擬音訊同理，而且 WDK 更舊</h3>
        <p>
          <code>edu-as-virtual-audio-cable</code>（VAC4 的 fork，產出{' '}
          <code>airsyncaudio</code> 驅動）的 README 要求{' '}
          <strong>WDK 7.1.0</strong> —— 那是 Windows 7 時代的工具。
          音訊驅動模型改動小，所以老專案可以一路沿用；
          代價是建置環境跟現代 Windows 開發完全脫節。
        </p>
      </Prose>

      <Callout kind="insight" title="Android 把同一件事做成了公開 API">
        <p>
          <code>DisplayManager.createVirtualDisplay()</code> 建立一個虛擬顯示器，
          內容渲染到你給的 <code>Surface</code>。<strong>沒有驅動、沒有簽章、沒有提權。</strong>
        </p>
        <p>
          代價在別的地方：Android 用<strong>權限</strong>而不是<strong>驅動門檻</strong>
          來管這件事。想要虛擬顯示器裡有<em>系統畫面</em>（而不只是你自己的 App），
          就要 <code>MediaProjection</code> 的授權 —— 也就是那個跳不掉的對話框，
          除非你是平台簽章的系統 App。
        </p>
        <p>
          <strong>兩個平台把同一個問題擋在不同的地方</strong>：Windows 擋在「你能不能造裝置」，
          Android 擋在「造出來能不能看到別人的內容」。這也是為什麼 receiver 的
          IFP flavor 需要 <code>sharedUserId=android.uid.system</code> ——
          見 <Link href="/systems/airsync">AirSync</Link>「兩個主應用是一對」。
        </p>
      </Callout>

      <Prose>
        <h2>四、macOS：顯示與音訊待遇完全相反</h2>
        <h3>顯示端沒有官方路徑</h3>
        <p>
          macOS 沒有給第三方做虛擬顯示器的公開 API。DriverKit（取代 kext 的新框架）
          根本沒有顯示驅動這個類別。實務上的做法是用私有的{' '}
          <code>CGVirtualDisplay</code> / <code>CGVirtualDisplayDescriptor</code> ——
          那是 Apple 自己給 Sidecar（iPad 當第二螢幕）用的。
        </p>
        <p>
          BetterDisplay、Duet 這類商用軟體都走這條路。
          <strong>風險是它隨時可能在某個 macOS 版本壞掉</strong>，
          而且不可能上 Mac App Store。
        </p>
        <p>
          好消息是 macOS<strong>不太需要它</strong> —— 官方的{' '}
          <code>ScreenCaptureKit</code>（macOS 12.3+）擷取效率很高，
          可以選視窗、選 App、排除特定視窗，而且能直接輸出到硬體編碼器。
          虛擬顯示器在 macOS 上的主要價值只剩「造一個實體螢幕不存在的解析度」。
        </p>
        <h3>音訊端反而最乾淨</h3>
        <p>
          Core Audio 的 <strong>AudioServerPlugIn</strong> 是官方支援的
          user-space 音訊裝置外掛 —— 不需要 kext、不需要停用 SIP。
          BlackHole、Loopback 都是這樣做的。
        </p>
        <p>
          而且 macOS 14.2 之後還有 <code>CATapDescription</code>，
          可以直接錄取指定行程的音訊輸出，<strong>連虛擬裝置都不用造</strong>。
        </p>
        <p>
          所以在 macOS 上「攔截系統音訊」比在 Windows 上簡單得多 ——
          這跟顯示端的狀況剛好相反。
        </p>
      </Prose>

      <Prose>
        <h2>五、Linux：本來就內建</h2>
        <ul>
          <li>
            <strong>顯示</strong> —— 核心有 <code>vkms</code>（Virtual KMS），
            <code>modprobe vkms</code> 就多一個顯示器。X11 時代則是{' '}
            <code>xf86-video-dummy</code> 或 Xvfb（CI 跑 GUI 測試常用的那個）。
          </li>
          <li>
            <strong>音訊</strong> —— PulseAudio 的{' '}
            <code>module-null-sink</code> 建一個「黑洞」輸出，再從它的 monitor
            source 讀回來。PipeWire 更直接，虛擬節點是一等公民。
          </li>
          <li>
            <strong>擷取</strong> —— PipeWire + <code>xdg-desktop-portal</code>{' '}
            的 ScreenCast 介面，Wayland 下的標準做法。
          </li>
        </ul>
        <p>
          Linux 的門檻低到「虛擬裝置」根本不算一個技術挑戰。
          代價是碎片化 —— X11 還是 Wayland、PulseAudio 還是 PipeWire、
          哪個發行版有裝 portal，都要處理。
        </p>
      </Prose>

      <Prose>
        <h2>六、iOS：這條路不存在</h2>
        <p>
          iOS 沒有虛擬顯示器，也沒有虛擬音訊裝置，而且不會有 ——
          它的沙箱模型從根本上不允許一個 App 提供系統級裝置。
        </p>
        <p>
          唯一的螢幕擷取路徑是 <strong>ReplayKit</strong>，
          而且是系統控制的：使用者要從控制中心啟動、有明顯的錄製指示、
          App 只能拿到系統餵給它的畫面。AirPlay 鏡射則完全由系統負責，
          App 碰不到。
        </p>
        <p>
          所以 <code>edu-as-airsync-sender</code> 在 iOS 上的能力必然遠低於
          Windows —— 這不是實作深度的差別，是平台的硬性天花板。
        </p>
      </Prose>

      <Callout kind="note" title="這頁的可信度">
        <p>
          平台能力的部分是通用技術知識（非公司特定），我有信心。
          但<strong>沒有查證 AirSync 在 macOS / Linux 上實際怎麼做</strong> ——
          <code>edu-as-airsync-sender</code> 的 CI 有{' '}
          <code>azure-pipelines-macos.yml</code>，所以 macOS 版存在，
          但它是走 ScreenCaptureKit 還是私有虛擬顯示器 API，我沒查。
        </p>
        <p>
          <code>edu-as-desktop-screenstate</code> 的 README 說支援 Linux / macOS / Windows，
          所以桌面三平台都有涉及。這條值得加進待釘清單。
        </p>
      </Callout>

      <Prose>
        <h2>七、一句話總結</h2>
        <p>
          <strong>
            平台給你「造裝置」的許可有多寬，決定了投影軟體在那個平台上的能力上限。
          </strong>
        </p>
        <p>
          Windows 給了許可但要求很高的代價（驅動、簽章、認證、提權），
          所以 AirSync 在 Windows 上功能最完整，也在那裡放了最多的工程資源 ——
          9 個 repo 全是 C++。Android 用公開 API 換成權限管制。
          Linux 幾乎不設限。macOS 分開對待顯示與音訊。iOS 直接關門。
        </p>
      </Prose>

      <nav className="mt-12 border-t border-slate-800 pt-6">
        <p className="text-[13px] text-slate-500">
          回到 <Link href="/concepts/capture" className="text-sky-400 hover:text-sky-300">
            畫面與音訊擷取
          </Link>
        </p>
      </nav>
    </>
  )
}
