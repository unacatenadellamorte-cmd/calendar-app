import { t } from '@/i18n';
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
  'profile/invalid-name': '名前を入力してください',
  'profile/photo-too-large': '写真のファイルサイズが大きすぎます(10MBまで)',
  'profile/photo-failed': '写真を処理できませんでした。別の写真でお試しください',
  'event/invalid-title': '予定のタイトルを入力してください',
  'event/invalid-time': '終了は開始より後にしてください',
  'event/invalid-date': '日付を選んでください',
  'event/not-editable': '取り込んだ予定はこのアプリでは編集できません',
  'event/invalid-reminder': 'リマインダーの分数が正しくありません',
  'secret/invalid-passcode': 'パスコードは半角英数字4〜8文字で入力してください',
  'secret/incorrect-passcode': 'パスコードが違います',
  'secret/save-failed': 'パスコードを保存できませんでした。もう一度お試しください',
  'event/offline': 'オフラインのため保存できません。接続後にもう一度お試しください',
  'data/offline': 'オフラインです。接続すると同期します',
  'sync/partial': '一部の変更を送信できませんでした',
  'sync/failed': '取り込みに失敗しました。時間をおいてもう一度お試しください',
  'export/failed': 'ファイルの書き出しに失敗しました',
  'shift-template/invalid-name': 'シフト名を入力してください',
  'shift-template/invalid-time': '開始と終了の時刻を確認してください',
  'shift-template/invalid-break': '休憩は0以上で、実働時間より短くしてください',
  'shift-template/invalid-wage': '時給は0以上で入力してください',
  'shift-template/invalid-workplace': '勤務先ラベルは100文字までです',
  'shift-template/invalid-color': '色はプリセットから選んでください',
  'connection/exchange-failed': 'Google との接続に失敗しました。もう一度お試しください',
  'connection/no-refresh-token':
    '接続をやり直してください。Google の許可画面で「許可」を選んでください',
  'connection/state-mismatch': '接続を確認できませんでした。もう一度お試しください',
  'connection/cancelled': '接続をキャンセルしました',
  'connection/not-authenticated': '接続にはログインが必要です',
  'connection/unavailable': 'この機能は Supabase の設定後に使えます',
  'connection/reauth-needed': 'Google を接続し直してください',
  'connection/not-connected': '先に Google を接続してください',
  'connection/calendars-failed':
    'カレンダー一覧を取得できませんでした。もう一度お試しください',
  'connection/disconnect-failed': '接続の解除に失敗しました。もう一度お試しください',
  'connection/permission-denied':
    '端末カレンダーへのアクセスが許可されませんでした。設定から許可してください',
  'connection/device-unavailable':
    '端末カレンダーに接続できませんでした。もう一度お試しください',
  'connection/calendar-not-found':
    'このカレンダーは一覧に見つかりませんでした。更新してもう一度お試しください',
  'notification/permission-denied':
    '通知が許可されていません。端末の設定から許可すると通知が届きます',
};

const ALL: Record<string, string> = { ...AUTH_MESSAGES, ...DATA_MESSAGES };
const FALLBACK = 'エラーが発生しました。もう一度お試しください';

export function resolveMessage(messageKey: string): string {
  return t(ALL[messageKey] ?? FALLBACK);
}
