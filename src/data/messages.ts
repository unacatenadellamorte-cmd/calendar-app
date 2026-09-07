import { AUTH_MESSAGES } from './auth.errors';

/**
 * `AppError.messageKey` → ユーザー向け日本語文言(EXPERIENCE.md Voice)。
 * コード・英語メッセージ・感嘆符は出さない。
 */

const DATA_MESSAGES: Record<string, string> = {
  'data/unavailable': 'ローカル開発ではこの機能は使えません。Supabase を設定してください',
  'data/query': '読み込みに失敗しました。もう一度お試しください',
  'calendar/invalid-name': 'カレンダー名を入力してください',
  'calendar/invalid-color': '色はプリセットから選んでください',
  'calendar/shift-undeletable': 'シフト用カレンダーは削除できません',
  'event/invalid-title': '予定のタイトルを入力してください',
  'event/invalid-time': '終了は開始より後にしてください',
  'event/invalid-date': '日付を選んでください',
  'event/not-editable': '取り込んだ予定はこのアプリでは編集できません',
  'event/offline': 'オフラインのため保存できません。接続後にもう一度お試しください',
  'data/offline': 'オフラインです。接続すると同期します',
  'sync/partial': '一部の変更を送信できませんでした',
  'export/failed': 'ファイルの書き出しに失敗しました',
};

const ALL: Record<string, string> = { ...AUTH_MESSAGES, ...DATA_MESSAGES };
const FALLBACK = 'エラーが発生しました。もう一度お試しください';

export function resolveMessage(messageKey: string): string {
  return ALL[messageKey] ?? FALLBACK;
}
