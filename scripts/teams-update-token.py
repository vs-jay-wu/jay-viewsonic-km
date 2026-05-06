#!/usr/bin/env python3
"""
teams-update-token.py
用 Playwright 開啟 Teams，自動擷取 Bearer token 並寫入 .env

使用方式:
    python3 scripts/teams-update-token.py
"""

import re
import sys
from pathlib import Path

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    print("❌ 需要安裝 playwright：")
    print("   pip3 install playwright && playwright install chromium")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent.parent
PROFILE_DIR  = PROJECT_ROOT / ".browser-profile"
ENV_FILE     = PROJECT_ROOT / ".env"
TEAMS_URL    = "https://teams.cloud.microsoft"


def update_env_token(token: str):
    content = ENV_FILE.read_text() if ENV_FILE.exists() else ""
    if re.search(r"^TEAMS_TOKEN=", content, re.MULTILINE):
        content = re.sub(r"^TEAMS_TOKEN=.*$", f"TEAMS_TOKEN={token}", content, flags=re.MULTILINE)
    else:
        content += f"\nTEAMS_TOKEN={token}\n"
    ENV_FILE.write_text(content)


def main():
    print("🚀 開啟 Teams 瀏覽器（使用 .browser-profile）...")
    print("   → 若尚未登入，請在瀏覽器中完成登入")
    print("   → 登入後點任一聊天室，偵測到 token 後視窗自動關閉")
    print(f"{'─'*55}")

    captured_token: list[str | None] = [None]

    def on_request(request):
        if captured_token[0]:
            return
        if "chatsvc" not in request.url:
            return
        auth = request.headers.get("authorization", "")
        if auth.startswith("Bearer "):
            captured_token[0] = auth[len("Bearer "):].strip()
            print(f"✅ 偵測到 token（前 20 字元）：{captured_token[0][:20]}...")

    with sync_playwright() as p:
        browser = p.chromium.launch_persistent_context(
            user_data_dir=str(PROFILE_DIR),
            headless=False,
        )
        page = browser.new_page()
        page.on("request", on_request)

        print(f"🌐 前往 {TEAMS_URL} ...")
        page.goto(TEAMS_URL, wait_until="domcontentloaded")

        print("⏳ 等待 chatsvc 請求（最多 3 分鐘）...")
        for _ in range(360):  # 180 秒
            if captured_token[0]:
                break
            page.wait_for_timeout(500)

        browser.close()

    if captured_token[0]:
        update_env_token(captured_token[0])
        print("✅ Token 已寫入 .env 的 TEAMS_TOKEN")
    else:
        print("❌ 逾時未偵測到 token，請確認已登入並點開任一聊天室")
        sys.exit(1)


if __name__ == "__main__":
    main()
