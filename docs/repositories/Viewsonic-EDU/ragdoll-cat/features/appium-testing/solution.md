# ClassSwift Android Appium 測試解法

## 背景與問題

ClassSwift Android（ragdoll-cat）是以 `TYPE_APPLICATION_OVERLAY` 疊加在 mvbf 上的 overlay app。
所有 window 預設帶有 `FLAG_NOT_FOCUSABLE`，導致：

1. **Appium（UIAutomator2 driver）無法定位 CS 元素**
   UIAutomator2 底層走 Android Accessibility Service（`getRootInActiveWindow()`），
   Android 系統不會把 `FLAG_NOT_FOCUSABLE` 的 window 放進 Accessibility tree，
   因此 CS 的 view hierarchy 對 Appium 完全不可見。

2. **Espresso 實際上行不通**
   理論上 Espresso 透過 `am instrument` 注入目標 process，不受 window flag 影響。
   但實際測試中，Espresso 與 UIAutomator 共存時會產生衝突，導致 CS process 持續 crash，
   無法穩定運作。**不建議走這條路。**

---

## 解法核心概念

**動態切換 `FLAG_NOT_FOCUSABLE`，讓 Appium 在需要操作 CS 時才能看到它。**

CS 本身已有類似機制（EditText 取得 focus 時暫時移除該 flag），
因此這個方式在技術上完全可行，只需要加一個 test-only 的觸發入口。

---

## 實作方案

### Step 1：在 CS（debug build）加入 BroadcastReceiver

在 CS app 的 debug variant 加一個 `BroadcastReceiver`，接收外部指令來切換 flag。

```kotlin
// app/src/debug/java/com/viewsonic/classswift/testing/TestFocusableReceiver.kt

class TestFocusableReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        val shouldRemoveFocusable = intent.getBooleanExtra("remove_focusable", false)
        CSWindowManager.instance?.setFocusable(!shouldRemoveFocusable)
    }

    companion object {
        const val ACTION = "com.viewsonic.classswift.TEST_SET_FOCUSABLE"
    }
}
```

AndroidManifest（debug variant）：
```xml
<receiver
    android:name=".testing.TestFocusableReceiver"
    android:exported="true">
    <intent-filter>
        <action android:name="com.viewsonic.classswift.TEST_SET_FOCUSABLE" />
    </intent-filter>
</receiver>
```

### Step 2：在 CSWindowManager 加入 setFocusable()

`WindowContainer` 已有 `updateLayoutParam()`，`CSWindowManager` 對所有 active window 批次更新即可。

```kotlin
// CSWindowManager.kt 新增方法

fun setFocusable(focusable: Boolean) {
    activeWindows.forEach { container ->
        val params = container.getLayoutParam()
        if (focusable) {
            // 移除 FLAG_NOT_FOCUSABLE，同時補上 FLAG_NOT_TOUCH_MODAL
            // 避免整個畫面的 touch 都被 CS 攔截
            params.flags = (params.flags and WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE.inv()) or
                            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL
        } else {
            // 還原：加回 FLAG_NOT_FOCUSABLE，移除 FLAG_NOT_TOUCH_MODAL
            params.flags = (params.flags or WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE) and
                            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL.inv()
        }
        container.updateLayoutParam(params)
    }
}
```

**重要**：移除 `FLAG_NOT_FOCUSABLE` 時必須同時加上 `FLAG_NOT_TOUCH_MODAL`。
原因：`FLAG_NOT_FOCUSABLE` 隱含 `FLAG_NOT_TOUCH_MODAL`；拿掉前者後，
若不手動補後者，CS window 會變成 modal，攔截整個螢幕的 touch，mvbf 收不到任何點擊。

---

## 測試腳本流程

```python
# conftest.py 或 helper

ADB_ACTION = "com.viewsonic.classswift.TEST_SET_FOCUSABLE"

def set_cs_focusable(remove: bool):
    """
    remove=True  → 移除 FLAG_NOT_FOCUSABLE，讓 Appium 可見 CS
    remove=False → 還原 FLAG_NOT_FOCUSABLE，讓 mvbf 可正常操作
    """
    value = "true" if remove else "false"
    os.system(f"adb shell am broadcast -a {ADB_ACTION} --ez remove_focusable {value}")
    time.sleep(0.5)  # 等 Accessibility tree 更新


def test_cs_feature(driver):
    # 1. 讓 Appium 可以看到 CS
    set_cs_focusable(remove=True)

    # 2. 操作 CS 元素
    btn = driver.find_element(AppiumBy.ACCESSIBILITY_ID, "start_class_btn")
    btn.click()

    # 3. 需要操作 mvbf 時，還原 flag
    set_cs_focusable(remove=False)

    # 4. 操作 mvbf（此時 CS touch 已穿透）
    ...
```

---

## 注意事項

### FLAG_NOT_TOUCH_MODAL 是必須的
移除 `FLAG_NOT_FOCUSABLE` 時若沒補 `FLAG_NOT_TOUCH_MODAL`：
- CS window 變成 modal window
- 螢幕上所有 touch（包含 CS 邊界外）都被 CS 攔截
- mvbf 完全無法操作

### Accessibility tree 更新有延遲
`windowManager.updateViewLayout()` 是非同步的，Accessibility Service 不會立即重新掃描。
測試腳本在 ADB 指令後至少等 **500ms** 再讓 Appium 操作，或改用 explicit wait。

### 冪等設計
使用明確的 `remove_focusable=true/false` 而非 toggle，
確保測試中重複呼叫不會產生非預期狀態。

### 僅限 debug build
`TestFocusableReceiver` 只放在 `src/debug/`，release build 不包含，避免安全疑慮。

---

## 現有 code 的潛在 bug

`MyClassWindow.kt:385`、`UrlMetaPreviewDialog.kt:188`、`CSCreateQuizCollectionFolderWidget.kt:99` 等地方，
移除 `FLAG_NOT_FOCUSABLE` 時都**沒有補上 `FLAG_NOT_TOUCH_MODAL`**。
目前沒出事是因為這些切換都很短暫（彈鍵盤用），但如果有人長時間保持 focusable 狀態，
mvbf 將無法接收 touch。實作測試 hook 時應一併修正這些地方的寫法。

---

## 相關檔案（ragdoll-cat）

| 檔案 | 說明 |
|------|------|
| `windowframework/core/WindowContainer.kt` | FLAG 設定與 touch listener |
| `ui/window/MyClassWindow.kt` | 動態切換 FLAG_NOT_FOCUSABLE 範例 |
| `ui/widget/task/link/UrlMetaPreviewDialog.kt` | 動態切換 FLAG_NOT_FOCUSABLE 範例 |
