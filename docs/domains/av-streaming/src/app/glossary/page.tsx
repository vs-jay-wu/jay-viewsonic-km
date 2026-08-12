import { Callout, PageHeader, Prose } from '@/components/Prose'
import { GlossaryList } from '@/components/GlossaryList'
import { TERMS } from '@/data/glossary'

export default function GlossaryPage() {
  const clashes = TERMS.filter((t) => t.clash)

  return (
    <>
      <PageHeader
        eyebrow="glossary"
        title="縮寫對照"
        lede={
          <>
            {TERMS.length} 條。每條的解釋刻意寫成「它在這個 domain 裡幹什麼」，
            而不是字典定義 —— 因為知道 SDP 是 Session Description Protocol
            並不會讓你看懂一份 SDP。
          </>
        }
      />

      <Callout kind="warn" title={`${clashes.length} 個會咬人的撞名`}>
        <p>
          同一個縮寫在不同領域指完全不同的東西，而這個 domain 剛好橫跨那些領域。
          最容易出事的兩個：
        </p>
        <ul>
          <li>
            <strong>DRM</strong> —— Digital Rights Management（內容保護）vs Linux 的
            Direct Rendering Manager（顯示子系統，<code>vkms</code> 掛在它下面）。
            談 FairPlay 時是前者，談 Linux 虛擬顯示器時是後者。
          </li>
          <li>
            <strong>SIP</strong> —— VoIP 的 Session Initiation Protocol vs macOS 的
            System Integrity Protection。這個 domain 兩個都會遇到。
          </li>
        </ul>
        <p>清單裡有撞名的條目都標了出來。</p>
      </Callout>

      <GlossaryList />

      <Prose>
        <h2>沒收錄的</h2>
        <p>
          刻意不收「一看就懂」的（HTTP、TCP、UDP、API、SDK）與純粹的公司內部代號
          （repo 的動物代號、user story 編號）。前者浪費你的時間，後者查 Jira 比查這裡快。
        </p>
      </Prose>
    </>
  )
}
