/**
 * 初回接続時のプラン案内(PlanSheet)を一度閉じたかどうか(CAP-5)。
 * 端末ごとの表示上の都合なので localStorage に置く。使えない環境(プライベート
 * ブラウズ・保存の無効化など)でも例外を外へ出さず、画面はそのまま動かす。
 */
const STORAGE_KEY = 'calendar-app.plan-sheet-seen';

export function hasSeenPlanSheet(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function markPlanSheetSeen(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // 保存できなくても次回もう一度出るだけ。
  }
}
