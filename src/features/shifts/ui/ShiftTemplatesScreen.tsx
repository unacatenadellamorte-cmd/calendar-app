import { t, useLanguage } from '@/i18n';
import { useState } from 'react';
import { Screen } from '@/ui/Screen';
import { useAuth } from '@/app/auth-context';
import { resolveMessage } from '@/data/messages';
import type { NewShiftTemplateInput, ShiftTemplate } from '@/data/shift-templates';
import { useShiftTemplates } from '../model/useShiftTemplates';
import { ShiftTemplateChip } from './ShiftTemplateChip';
import { ShiftTemplateFormSheet } from './ShiftTemplateFormSheet';
/**
 * お気に入りシフトの管理(FR-11)。設定から開く。テンプレの登録・編集・削除。
 * シフトの「実体」を入れるのは Story 4.2(quick-shift-sheet)。
 */
export function ShiftTemplatesScreen() {
  useLanguage();
  const { state } = useAuth();
  const enabled = state === 'guest' || state === 'authenticated';
  const sh = useShiftTemplates(enabled);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<ShiftTemplate | null>(null);
  if (state === 'unavailable') {
    return (
      <Screen title={t('お気に入りシフト')}>
        <p className="text-body text-ink-secondary">
          {t('Supabase を設定すると、お気に入りシフトを登録できます。')}
        </p>
      </Screen>
    );
  }
  const openCreate = () => {
    sh.dismissError();
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (template: ShiftTemplate) => {
    sh.dismissError();
    setEditing(template);
    setSheetOpen(true);
  };
  const submit = (values: NewShiftTemplateInput) =>
    editing ? sh.update(editing, values) : sh.create(values);
  return (
    <Screen title={t('お気に入りシフト')}>
      {sh.errorKey && !sheetOpen && (
        <p
          role="alert"
          className="mb-3 flex items-center justify-between text-meta text-danger"
        >
          {resolveMessage(sh.errorKey)}
          <button type="button" onClick={sh.dismissError} className="text-accent">
            {t('閉じる')}
          </button>
        </p>
      )}

      {sh.pendingDelete && (
        <p className="mb-3 flex items-center justify-between rounded-sm bg-surface-raised px-3 py-2 text-meta text-ink-secondary">
          {t('「{0}」を削除しました', [sh.pendingDelete.name])}
          <button type="button" onClick={() => void sh.undoDelete()} className="text-accent">
            {t('取り消す')}
          </button>
        </p>
      )}

      <p className="mb-3 text-meta text-ink-secondary">
        {t('登録しておくと、日付をタップして1タップでシフトを入れられます。')}
      </p>

      {sh.loading ? (
        <p className="text-meta text-ink-secondary">{t('読み込み中…')}</p>
      ) : sh.templates.length === 0 ? (
        <p className="text-meta text-ink-secondary">
          {t('まだお気に入りシフトはありません。')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {sh.templates.map((t) => (
            <li key={t.id}>
              <ShiftTemplateChip template={t} onTap={openEdit} />
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={openCreate}
        className="mt-4 min-h-11 w-full rounded-sm border border-dashed border-accent px-4 text-body text-accent"
      >
        {t('＋ お気に入りシフトを作る')}
      </button>

      <ShiftTemplateFormSheet
        open={sheetOpen}
        editing={editing}
        usedColors={sh.templates.map((t) => t.color)}
        errorKey={sh.errorKey}
        onClose={() => setSheetOpen(false)}
        onSubmit={submit}
        onDelete={(template) => {
          setSheetOpen(false);
          void sh.remove(template);
        }}
      />
    </Screen>
  );
}
