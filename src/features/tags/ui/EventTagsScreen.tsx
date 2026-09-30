import { useState } from 'react';
import { t, useLanguage } from '@/i18n';
import { useAuth } from '@/app/auth-context';
import { Screen } from '@/ui/Screen';
import type { EventTag, NewEventTagInput } from '@/data/event-tags';
import { useEventTags } from '../model/useEventTags';
import { EventTagFormSheet } from './EventTagFormSheet';
import { labelTextColor } from '@/lib/event-label';

function errorText(key: string): string {
  const messages: Record<string, string> = {
    'event-tag/invalid-name': '予定名称を1〜200文字で入力してください',
    'event-tag/invalid-color': 'ラベル色は6桁のカラーコードで入力してください',
    'event-tag/invalid-time': '開始・終了時刻を入力し、異なる時刻にしてください',
    'data/unavailable': 'Supabase を設定すると、予定タグを登録できます。',
    'data/query': '読み込みに失敗しました。もう一度お試しください',
  };
  return t(messages[key] ?? 'エラーが発生しました。もう一度お試しください');
}

export function EventTagsScreen() {
  useLanguage();
  const { state, session } = useAuth();
  return <EventTagsScreenContent key={session?.user.id ?? state} state={state} />;
}

function EventTagsScreenContent({ state }: { state: ReturnType<typeof useAuth>['state'] }) {
  useLanguage();
  const enabled = state === 'guest' || state === 'authenticated';
  const tags = useEventTags(enabled);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<EventTag | null>(null);
  if (state === 'unavailable') {
    return (
      <Screen title={t('予定タグ')}>
        <p className="text-body text-ink-secondary">
          {t('Supabase を設定すると、予定タグを登録できます。')}
        </p>
      </Screen>
    );
  }
  const openCreate = () => {
    tags.dismissError();
    setEditing(null);
    setOpen(true);
  };
  const openEdit = (tag: EventTag) => {
    tags.dismissError();
    setEditing(tag);
    setOpen(true);
  };
  const submit = (value: NewEventTagInput) =>
    editing ? tags.update(editing, value) : tags.create(value);
  return (
    <Screen title={t('予定タグ')}>
      {tags.errorKey && !open && (
        <p
          role="alert"
          className="mb-3 flex items-center justify-between text-meta text-danger"
        >
          {errorText(tags.errorKey)}
          <button type="button" onClick={tags.dismissError} className="text-accent">
            {t('閉じる')}
          </button>
        </p>
      )}
      <p className="mb-3 text-meta text-ink-secondary">
        {t('予定に使う名前・色・時刻を登録できます。')}
      </p>
      {tags.loading ? (
        <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
      ) : tags.loadErrorKey ? (
        <div className="flex flex-col gap-2 text-meta text-danger">
          <p role="alert">{errorText(tags.loadErrorKey)}</p>
          <button
            type="button"
            onClick={() => void tags.reload()}
            className="self-start text-accent"
          >
            {t('再試行')}
          </button>
        </div>
      ) : tags.tags.length === 0 ? (
        <p className="text-meta text-ink-secondary">{t('まだ予定タグはありません。')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.tags.map((tag) => (
            <li key={tag.id}>
              <button
                type="button"
                onClick={() => openEdit(tag)}
                className="flex min-h-14 w-full min-w-0 items-center justify-between gap-3 rounded-md border border-border-hairline px-4 text-left"
                style={{ backgroundColor: tag.color, color: labelTextColor(tag.color) }}
              >
                <span className="min-w-0 flex-1 truncate">{tag.name}</span>
                <span className="shrink-0 text-meta">
                  {tag.allDay ? t('終日') : `${tag.startLocal}–${tag.endLocal}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        disabled={tags.loading || !tags.loaded || Boolean(tags.loadErrorKey) || !enabled}
        onClick={openCreate}
        className="mt-4 min-h-11 w-full rounded-sm border border-dashed border-accent px-4 text-body text-accent disabled:opacity-60"
      >
        {t('＋ 予定タグを作る')}
      </button>
      <EventTagFormSheet
        open={open}
        editing={editing}
        errorKey={tags.errorKey}
        onClose={() => setOpen(false)}
        onSubmit={submit}
        onDelete={(tag) => tags.remove(tag)}
      />
    </Screen>
  );
}
