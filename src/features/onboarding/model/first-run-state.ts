export type FirstRunStage = 'google' | 'profile' | 'tutorial' | 'done';

/** 認証情報は保存せず、利用者ごとの初回進捗だけを端末へ記録する。 */
export function firstRunKey(userId: string): string {
  return `calendar-app.first-run.v1.${encodeURIComponent(userId)}`;
}

export function readFirstRunStage(userId: string | null): FirstRunStage | null {
  if (!userId) return null;
  try {
    const value = localStorage.getItem(firstRunKey(userId));
    return value === 'google' ||
      value === 'profile' ||
      value === 'tutorial' ||
      value === 'done'
      ? value
      : null;
  } catch {
    return null;
  }
}

export function saveFirstRunStage(userId: string | null, stage: FirstRunStage): void {
  if (!userId) return;
  try {
    localStorage.setItem(firstRunKey(userId), stage);
  } catch {
    // 保存できなくても、画面側のメモリ状態で現在の設定を続ける。
  }
}
