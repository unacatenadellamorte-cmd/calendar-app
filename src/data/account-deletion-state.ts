/** 削除開始をネットワーク通信より先に永続化し、再起動しても通常処理を止める。 */
export const ACCOUNT_DELETION_KEY = 'calendar-app.account-deletion';
export type DeletionPhase = 'remote' | 'local' | 'done';
export interface DeletionRecord { userId: string; phase: DeletionPhase }
const listeners = new Set<() => void>();
let blockedInThisDocument = false;

export function deletionSnapshot(): string | null {
  try { return localStorage.getItem(ACCOUNT_DELETION_KEY); }
  catch { return 'storage-unavailable'; }
}

export function readDeletion(): DeletionRecord | null {
  const value = deletionSnapshot();
  if (value === null) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && 'userId' in parsed && 'phase' in parsed &&
        typeof parsed.userId === 'string' && parsed.userId.length > 0 &&
        (parsed.phase === 'remote' || parsed.phase === 'local' || parsed.phase === 'done')) {
      return parsed as DeletionRecord;
    }
  } catch { /* 破損時も通常画面へ戻さず、本人を断定しない。 */ }
  return { userId: '', phase: 'remote' };
}

export function isAccountDataBlocked(): boolean {
  try {
    blockedInThisDocument ||= deletionSnapshot() !== null;
    return blockedInThisDocument;
  } catch { return true; }
}

export function writeDeletion(record: DeletionRecord): void {
  localStorage.setItem(ACCOUNT_DELETION_KEY, JSON.stringify(record));
  blockedInThisDocument = true;
  listeners.forEach((listener) => listener());
}

export function subscribeDeletion(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === ACCOUNT_DELETION_KEY || event.key === null) {
      if (event.newValue === null && blockedInThisDocument) window.location.reload();
      else { isAccountDataBlocked(); listener(); }
    }
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
}

/** テスト用。通常の再開は必ずページを読み直す。 */
export function resetDeletionStateForTests(): void { blockedInThisDocument = false; }

/** 明示的な再開時は別ページとして起動し、旧処理の継続を持ち込まない。 */
export function startAfterDeletion(): void {
  if (readDeletion()?.phase !== 'done') return;
  localStorage.removeItem(ACCOUNT_DELETION_KEY);
  window.location.replace('/');
}
