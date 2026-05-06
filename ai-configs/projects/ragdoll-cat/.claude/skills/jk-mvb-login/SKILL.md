# MyViewBoard Login + ClassSwift Toggle

Automate MyViewBoard login on SM-X520 and enable the ClassSwift toggle.

## Test Credentials

| Field | Value |
|-------|-------|
| Email | `dillon.cy.chang@viewsonic.com` |
| Password | `Qa@123456` |

> ⚠️ 此 skill 檔位於 `.claude/`（已列於 `.gitignore`），不會 push 到 repo。
> 帳號僅供本機自動化測試使用。

## Steps

Use the MCP mobile tools with device `R52Y60E4GEW` (SM-X520).

**Important learnings:**
- Use `mobile_click_on_screen_at_coordinates` (MCP) to focus input fields — adb tap does NOT reliably focus WebView inputs
- Use `mobile_type_keys` (MCP) to type — more reliable than `adb input text` for WebView
- When keyboard is open, the dialog shifts UP ~223px (device coords) — use `mobile_list_elements_on_screen` to get real-time coordinates
- The login button coordinate changes depending on whether keyboard is visible

## Element Identifiers (reliable, keyboard-agnostic)

Use `mobile_list_elements_on_screen` after each interaction to get fresh coordinates. Key identifiers:

| Element | QA Identifier |
|---------|--------------|
| Account button (toolbar) | `[QA][sub toolbar: account button]` |
| Sign in button (account menu) | `[QA][account menu: sign in button]` |
| Email field | `[QA][sign in dialog: email text field]` |
| Password field | `[QA][sign in dialog: password text field]` |
| Login submit button | `[QA][sign in dialog: sign in]` |
| ClassSwift toggle | `[QA][main toolbar: ClassSwift toggle]` |

## Known Static Coordinates (keyboard hidden)

| Action | Device Coords |
|--------|--------------|
| Account button | (2233, 1374) |
| Sign in button in menu | (2054, 1258) |
| Email field center | (1487, 709) |
| Login button center (keyboard hidden) | (1640, 958) |
| ClassSwift toggle center | (1513, 1374) |

**When keyboard is open** — email and password fields shift up ~223px:
| Field | Coords with keyboard |
|-------|---------------------|
| Email | (1487, 487) |
| Password | (1487, 617) |
| Login button | (1640, 735) |

## Automated Flow

1. Verify MyViewBoard is open (launch `com.viewsonic.droid` if needed)
2. Tap account button → open account panel
3. Tap sign-in button → login dialog appears
4. `mobile_click` email field (1487, 709) → `mobile_type_keys` email
5. Use `mobile_list_elements_on_screen` → get real password field coords
6. `mobile_click` password field → `mobile_type_keys` password
7. Use `mobile_list_elements_on_screen` → get real login button coords
8. `mobile_click` login button → wait 3s for login
9. Verify title bar shows email address
10. `mobile_click` ClassSwift toggle (1513, 1374)
