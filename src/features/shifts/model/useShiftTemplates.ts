import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createShiftTemplate,
  deleteShiftTemplate,
  listShiftTemplates,
  restoreShiftTemplate,
  updateShiftTemplate,
  type NewShiftTemplateInput,
  type ShiftTemplate,
  type ShiftTemplatePatch,
} from '@/data/shift-templates';

/**
 * お気に入りシフトのテンプレの view-model(`useCalendars` と同型)。
 * 楽観更新 + 失敗ロールバック、削除は6秒 Undo。
 */

const UNDO_MS = 6000;

function sortTemplates(list: ShiftTemplate[]): ShiftTemplate[] {
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useShiftTemplates(enabled: boolean) {
  const [templates, setTemplates] = useState<ShiftTemplate[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShiftTemplate | null>(null);
  const pendingRef = useRef<{ template: ShiftTemplate; timer: ReturnType<typeof setTimeout> } | null>(
    null,
  );

  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setErrorKey(null);
    const list = await listShiftTemplates();
    if (list.ok) setTemplates(sortTemplates(list.value));
    else setErrorKey(list.error.messageKey);
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(
    () => () => {
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    },
    [],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  const create = useCallback(async (input: NewShiftTemplateInput) => {
    const result = await createShiftTemplate(input);
    if (result.ok) {
      setTemplates((ts) => sortTemplates([...ts, result.value]));
      setErrorKey(null); // 直前の失敗のエラーバナーを引きずらない
      return true;
    }
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const update = useCallback(async (current: ShiftTemplate, patch: ShiftTemplatePatch) => {
    const optimistic = { ...current, ...patch } as ShiftTemplate;
    setTemplates((ts) => ts.map((t) => (t.id === current.id ? optimistic : t)));
    const result = await updateShiftTemplate(current, patch);
    if (result.ok) {
      setTemplates((ts) => ts.map((t) => (t.id === current.id ? result.value : t)));
      setErrorKey(null);
      return true;
    }
    setTemplates((ts) => ts.map((t) => (t.id === current.id ? current : t)));
    setErrorKey(result.error.messageKey);
    return false;
  }, []);

  const finalize = useCallback(() => {
    pendingRef.current = null;
    setPendingDelete(null);
  }, []);

  const remove = useCallback(
    async (template: ShiftTemplate) => {
      const result = await deleteShiftTemplate(template.id);
      if (!result.ok) {
        setErrorKey(result.error.messageKey);
        return;
      }
      setTemplates((ts) => ts.filter((t) => t.id !== template.id));
      // 直前の保留分があればそのタイマを止めてから差し替える(孤児タイマ防止)。
      if (pendingRef.current) clearTimeout(pendingRef.current.timer);
      const timer = setTimeout(finalize, UNDO_MS);
      pendingRef.current = { template, timer };
      setPendingDelete(template);
    },
    [finalize],
  );

  const undoDelete = useCallback(async () => {
    const pending = pendingRef.current;
    if (!pending) return;
    clearTimeout(pending.timer);
    pendingRef.current = null;
    setPendingDelete(null);
    const result = await restoreShiftTemplate(pending.template.id);
    if (result.ok) setTemplates((ts) => sortTemplates([...ts, pending.template]));
    else setErrorKey(result.error.messageKey);
  }, []);

  return {
    templates,
    loading,
    errorKey,
    pendingDelete,
    reload,
    create,
    update,
    remove,
    undoDelete,
    dismissError,
  };
}
