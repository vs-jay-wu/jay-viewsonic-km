---
name: olf-vnext
description: "Use before touching OLF file-format semantics in ANY repo — olfparser, Swallow, Sparrow, mac/android playground, or edu-droid-flutter (mvbf). The OLF schema contract lives in olfparser/docs/olf-vnext/ and binds all five consumer repos; this skill covers the five AI 消費守則, where the normative files are, and the STOP rule on contradictions. Examples: \"改 olf 欄位\", \"mvbf 讀 olf 的座標不對\", \"v-next 要怎麼轉\""
---

# OLF v-next 合約（跨 repo）

**這條規範不屬於任何單一 repo，但拘束五個消費端。** 只要你正在動的東西會影響
「OLF 檔案裡某個欄位代表什麼」，就適用。

正典位置：`olfparser/docs/olf-vnext/`（2026-08-20 自 `edu-swallow-app` 遷入，MT-2612）。
olfparser 的 checkout 在哪：見 `olfparser` skill 步驟 0。

---

## 五條 AI 消費守則（原文在 `docs/olf-vnext/README.md` 檔頭）

**去讀原文**，這裡只是提醒它存在與重點。截至 2026-08-26 的形狀：

1. **合約以 `contract.md` §3 為準**，欄位表 = `vnext-spec.md`；衝突時 contract 贏。
2. **修訂唯一路徑 = olfparser 的 PR ＋ `contract.md` §9 O-ledger append**。
   **append-only —— 絕不 in-place 改既有語意。**
3. **消費 repo 不得自行改寫或「順手修正」合約語意。發現矛盾 → 開 olfparser issue，STOP。**
4. **實作進度 ≠ 合約。** 落差看 `conformance-matrix.md`。
   「code 沒實作」不代表「合約沒規定」。
5. **引用欄位時記下你讀的 commit。憑記憶引用 = 違規。**

> 第 3 條對你最重要：在 mvbf 裡看到 OLF 讀取邏輯怪怪的，**不要在 mvbf 修語意**。
> 第 5 條最容易犯：這種 schema 細節正是最像「我記得」的東西。

## 五個消費端

| 軌 | repo |
|---|---|
| native（原生只讀寫 v-next） | Swallow `edu-swallow-app` / mac-port `edu-mvb-mac-playground` / android-port `edu-mvb-android-playground` |
| wrap（內部仍 legacy，I/O 邊界包一層） | Sparrow `edu-sparrow-app` / **droid-flutter `edu-droid-flutter`（= mvbf）** |

**mvbf 是 wrap 軌消費端**——這就是這條規範會落到你頭上的原因。
I/O 邊界的 normative 規則 = `contract.md` §3.4（O29）。

## 哪個檔回答哪種問題

| 問題 | 檔 |
|---|---|
| 這個欄位該怎麼放（placement/幾何） | `contract.md` §3 |
| 這個欄位叫什麼、型別、必填、預設 | `vnext-spec.md` |
| legacy ↔ v-next 怎麼換（逐欄位食譜 + 編號公式） | `conversion-rules-sparrow-flutter.md` |
| 為什麼當初這樣決定 | `contract.md` §9 O-ledger（O1…O30） |
| 某平台做到哪了 | `conformance-matrix.md` |
| 四方源碼證據（file:line） | `platform-audit.md` |
| polls | `polls-spec.md` |
| 轉換 lib 的實作交付規格 | `conversion-lib-spec.md` |

§ 編號跨檔連續且唯一：`§N` 不在當檔就去姊妹檔找（§8.x/§10 → platform-audit）。

## 核心心智模型（記這一句就好，細節回去查）

**「存未旋轉的攤平真相，旋轉永遠是一個獨立角度。」**

- **point 物件**（stroke/path/polygon/polyline/quadrant/pseudo3d/curve/connector）
  = 未旋轉 raw 絕對點（移動/縮放/翻轉**烤入**、旋轉**不烤**）＋ element 本體
  `rotation-angle`（繞 raw-AABB 中心轉）。無 matrix / x / y / w / h / flip。
- **非 point 物件** = `x`/`y`（未旋轉左上）＋ `w`/`h`（顯示尺寸）＋ 本體
  `rotation-angle` ＋ 本體 `flip`。無 matrix / scale。
- 用不到或可導出的欄位**不出現**（`*-opacity`、matrix 全型別、ellipse cx/cy/rx/ry、
  boundary、segment-point、page matrix 全移除）。

正典資料模型 = C++ `edu-vboard-libolf`；C# `edu-sparrow-libolf-v2` 僅供對照，
**欄位名 / element key 以 C++ 為準**。

## PR 紀律

**任何動到 `docs/olf-vnext/` 語意的 PR，描述中必須點名受影響的消費端**
（上列五個裡的哪些）。PR #135 的做法可以照抄：獨立一節列出五個消費端，
逐一附上實地讀碼的 `檔案:行號` 佐證，說明它們現行讀法與本 PR 是否一致。

## CI 會擋

`pytest.yml` 有 anchor check，三行 grep 釘住治理段落：

```
grep -q "AI 消費守則" docs/olf-vnext/contract.md
grep -q "消費端 I/O 邊界" docs/olf-vnext/contract.md
grep -q "AI 消費守則" docs/olf-vnext/README.md
```

刪掉這些段落 CI 就紅。**改寫檔頭時不要動到這三個字串。**

## 引用時怎麼做才不算違規（第 5 條）

```bash
git -C "$R" rev-parse --short origin/main    # 記下這個
git -C "$R" show origin/main:docs/olf-vnext/vnext-spec.md | grep -n "<欄位名>"
```

在 PR／註解／交付說明裡寫成「依 `contract.md` §3.4（commit `3c2097a`）」。
**不要**寫「我記得 v-next 的 x 是左上角」——那正是守則禁止的。
