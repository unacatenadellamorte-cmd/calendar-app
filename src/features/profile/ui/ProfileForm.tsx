import { LanguagePicker } from '@/i18n/LanguagePicker';
import { t, useLanguage } from '@/i18n';
import { useState, type ChangeEvent } from 'react';
import { resolveMessage } from '@/data/messages';
import { resizeImageToDataUrl } from '@/lib/image';
import { AvatarIcon } from './AvatarIcon';
/** アバター画像の長辺(px)。Design Notes: 128x128 程度にリサイズしてから保存する。 */
const AVATAR_MAX_SIZE = 128;
/** リサイズ前チェック用のファイルサイズ上限。`<input accept>` は UI ヒントに過ぎず
 *  任意サイズを受け付けてしまうため、リサイズ呼び出し前に弾く。 */
const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10MB
export interface ProfileFormValues {
  displayName: string;
  avatarDataUrl: string | null;
}
interface ProfileFormProps {
  initialDisplayName?: string;
  initialAvatarDataUrl?: string | null;
  submitLabel: string;
  onSubmit: (values: ProfileFormValues) => Promise<boolean>;
}
/**
 * 名前入力 + 写真選択 + アバタープレビューの共有フォーム部品。
 * Onboarding/Profile 両画面から使う。名前は必須(空の間は送信できない)、写真は任意。
 */
export function ProfileForm({
  initialDisplayName = '',
  initialAvatarDataUrl = null,
  submitLabel,
  onSubmit,
}: ProfileFormProps) {
  useLanguage();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(initialAvatarDataUrl);
  const [processingPhoto, setProcessingPhoto] = useState(false);
  const [photoErrorKey, setPhotoErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const trimmedName = displayName.trim();
  const canSubmit = trimmedName.length > 0 && !submitting && !processingPhoto;
  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 同じファイルを選び直しても change が発火するようにリセットする。
    e.target.value = '';
    if (!file) return;
    setPhotoErrorKey(null);
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoErrorKey('profile/photo-too-large');
      return;
    }
    setProcessingPhoto(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file, AVATAR_MAX_SIZE);
      setAvatarDataUrl(dataUrl);
    } catch (e2) {
      // 写真は任意なので、失敗しても送信はブロックしない。ただし気づけるように表示する。
      console.warn('[calendar-app] 写真の処理に失敗しました', e2);
      setPhotoErrorKey('profile/photo-failed');
    } finally {
      setProcessingPhoto(false);
    }
  };
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        void (async () => {
          setSubmitting(true);
          await onSubmit({ displayName: trimmedName, avatarDataUrl });
          setSubmitting(false);
        })();
      }}
    >
      <LanguagePicker />
      <div className="flex flex-col items-center gap-3">
        <AvatarIcon displayName={trimmedName} avatarDataUrl={avatarDataUrl} size={96} />
        <label className="min-h-11 text-meta text-accent">
          {avatarDataUrl ? t('写真を変更する') : t('写真を選ぶ(任意)')}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => void handleFileChange(e)}
          />
        </label>
        {processingPhoto && (
          <p className="text-meta text-ink-secondary">{t('画像を処理中…')}</p>
        )}
        {photoErrorKey && (
          <p role="alert" className="text-meta text-danger">
            {resolveMessage(photoErrorKey)}
          </p>
        )}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-meta text-ink-secondary">{t('名前')}</span>
        <input
          type="text"
          required
          maxLength={50}
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
        />
      </label>

      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
      >
        {submitting ? t('処理中…') : submitLabel}
      </button>
    </form>
  );
}
