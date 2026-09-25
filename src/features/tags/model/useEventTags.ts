import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createEventTag,
  deleteEventTag,
  listEventTags,
  updateEventTag,
  type EventTag,
  type EventTagPatch,
  type NewEventTagInput,
} from '@/data/event-tags';

function sortTags(tags: EventTag[]): EventTag[] {
  return [...tags].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function useEventTags(enabled: boolean) {
  const [tags, setTags] = useState<EventTag[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loaded, setLoaded] = useState(false);
  const [loadErrorKey, setLoadErrorKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const generation = useRef(0);

  const reload = useCallback(async () => {
    if (!enabled) return;
    const request = ++generation.current;
    setLoading(true);
    setLoaded(false);
    setLoadErrorKey(null);
    setErrorKey(null);
    const result = await listEventTags();
    if (request !== generation.current) return;
    if (result.ok) {
      setTags(sortTags(result.value));
      setLoaded(true);
    } else {
      setLoadErrorKey(result.error.messageKey);
    }
    setLoading(false);
  }, [enabled]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const dismissError = useCallback(() => setErrorKey(null), []);

  const create = useCallback(async (input: NewEventTagInput) => {
    const request = ++generation.current;
    setLoading(false);
    const result = await createEventTag(input);
    if (request !== generation.current) return false;
    if (!result.ok) {
      setErrorKey(result.error.messageKey);
      return false;
    }
    setTags((current) => sortTags([...current, result.value]));
    setErrorKey(null);
    return true;
  }, []);

  const update = useCallback(async (current: EventTag, patch: EventTagPatch) => {
    const request = ++generation.current;
    setLoading(false);
    const optimistic = { ...current, ...patch } as EventTag;
    setTags((items) => items.map((item) => (item.id === current.id ? optimistic : item)));
    const result = await updateEventTag(current, patch);
    if (request !== generation.current) return false;
    if (!result.ok) {
      setTags((items) => items.map((item) => (item.id === current.id ? current : item)));
      setErrorKey(result.error.messageKey);
      return false;
    }
    setTags((items) => items.map((item) => (item.id === current.id ? result.value : item)));
    setErrorKey(null);
    return true;
  }, []);

  const remove = useCallback(async (tag: EventTag) => {
    const request = ++generation.current;
    setLoading(false);
    const result = await deleteEventTag(tag.id);
    if (request !== generation.current) return false;
    if (!result.ok) {
      setErrorKey(result.error.messageKey);
      return false;
    }
    setTags((items) => items.filter((item) => item.id !== tag.id));
    setErrorKey(null);
    return true;
  }, []);

  return {
    tags,
    loading,
    loaded,
    loadErrorKey,
    errorKey,
    reload,
    create,
    update,
    remove,
    dismissError,
  };
}
