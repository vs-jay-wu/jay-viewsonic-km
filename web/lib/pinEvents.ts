"use client";

/**
 * 「pin 變了」的跨元件通知。
 *
 * 側邊欄的「已 pin」跟 repo 清單是兩個互不相識的元件，中間也沒有共用的 store。
 * 以前側邊欄只在**換頁**時重抓，所以在工作台按 pin 之後它不會動（Jay 2026-09-23）。
 *
 * 用 window event 而不是拉一個全域狀態管理：這件事只有「有人改了 pin」一個訊號、
 * 兩三個聽眾，而且每個聽眾本來就有自己的抓取邏輯 —— 引一套 store 進來要付的
 * 維護成本遠大於它解決的問題。
 */

const EVENT = "km:pin-changed";

export function emitPinChanged(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

/** 回傳解除訂閱用的函式，給 `useEffect` 直接回傳 */
export function onPinChanged(fn: () => void): () => void {
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
