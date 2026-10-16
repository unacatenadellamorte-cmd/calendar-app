/** 1つの画面実行では利用者を固定し、切替時は旧処理を止めて画面ごと読み直す。 */
let ownerId: string | null = null;
let transitioning = false;
let generation = 0;
let ownerRequired = false;

export function localAccountOwner(): string | null {
  return ownerId;
}
export function requireAccountOwner(): void {
  ownerRequired = true;
}
export function accountOwnerMissing(): boolean {
  return ownerRequired && ownerId === null;
}
export function accountScopeBlocked(): boolean {
  return transitioning;
}
export function accountScopeGeneration(): number {
  return generation;
}
export function adoptAccountOwner(userId: string): void {
  if (ownerId !== null && ownerId !== userId)
    throw new Error('利用者の切替には再起動が必要です');
  ownerId = userId;
}
export function beginAccountTransition(): void {
  transitioning = true;
  generation += 1;
}
export function reloadAccountPage(): void {
  window.location.reload();
}
/** テストだけで新しい画面実行を模擬する。保存済みDBは消さない。 */
export function resetAccountScopeForTests(): void {
  ownerId = null;
  transitioning = false;
  generation = 0;
  ownerRequired = false;
}
