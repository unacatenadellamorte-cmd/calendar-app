/**
 * data-access レイヤの戻り値の共通形(ARCHITECTURE-SPINE 規約「エラー形」)。
 * リポジトリ関数は throw せず `Result` を返す。UI は `AppError.messageKey` を
 * EXPERIENCE.md Voice の文言に対応づける。
 */

export interface AppError {
  /** 機械可読の分類(ログ・分岐用)。例: 'auth/invalid-credentials'。 */
  kind: string;
  /** ユーザーに見せる文言のキー。表示層で日本語に解決する。 */
  messageKey: string;
  /** 元の例外(デバッグ用。UI では使わない)。 */
  cause?: unknown;
}

export type Result<T, E = AppError> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E = AppError>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function appError(kind: string, messageKey: string, cause?: unknown): AppError {
  return { kind, messageKey, cause };
}
