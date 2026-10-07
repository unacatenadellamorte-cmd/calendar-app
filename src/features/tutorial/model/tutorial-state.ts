/** 初回案内は端末単位で完了を記録し、アカウント切替で繰り返さない。 */
export const TUTORIAL_COMPLETED_KEY = 'calendar-app.tutorial-completed';

export function hasCompletedTutorial(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
}

/** 保存できなくても呼び出し側の画面内状態で案内を閉じ、利用を妨げない。 */
export function completeTutorial(): boolean {
  try {
    localStorage.setItem(TUTORIAL_COMPLETED_KEY, '1');
    return true;
  } catch {
    return false;
  }
}
