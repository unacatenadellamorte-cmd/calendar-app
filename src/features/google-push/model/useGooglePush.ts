import { useCallback, useEffect, useRef, useState } from 'react';
import { getPushTarget, getWriteCalendars, listPushStatus, runGooglePush, setPushTarget, type PushTarget, type PushStatus } from '@/data/google-push';
import { listConnections, startGoogleConnect, type GoogleConnectionInfo } from '@/data/connections';

export function useGooglePush(calendarId?: string, eventId?: string) {
  const mounted = useRef(false);
  const generation = useRef(0);
  const [connections, setConnections] = useState<GoogleConnectionInfo[]>([]);
  const [target, setTarget] = useState<PushTarget | null>(null);
  const [statuses, setStatuses] = useState<PushStatus[]>([]);
  const [choices, setChoices] = useState<{ id: string; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const refresh = useCallback(async () => {
    if (!calendarId && !eventId) return;
    const ticket = ++generation.current;
    const valid = () => mounted.current && generation.current === ticket;
    const result = await listPushStatus(eventId, calendarId);
    if (!valid()) return;
    if (result.ok) setStatuses(result.value);
    else setFailed(true);
    if (calendarId && !eventId) {
      const [current, accounts] = await Promise.all([getPushTarget(calendarId), listConnections()]);
      if (!valid()) return;
      if (current.ok) setTarget(current.value);
      if (accounts.ok) setConnections(accounts.value);
      if (!current.ok || !accounts.ok) setFailed(true);
    }
    setLoaded(true);
  }, [calendarId, eventId]);
  useEffect(() => {
    mounted.current = true;
    setLoaded(false); setStatuses([]); setTarget(null); setChoices([]); setFailed(false); void refresh();
    return () => { mounted.current = false; };
  }, [refresh]);
  const act = async (work: () => Promise<boolean>) => {
    setBusy(true); setFailed(false);
    try { const done = await work(); if (mounted.current) setFailed(!done); return done; }
    catch { if (mounted.current) setFailed(true); return false; }
    finally { if (mounted.current) setBusy(false); }
  };
  return { connections, target, statuses, choices, busy, failed, loaded, refresh,
    authorize: (connectionId: string) => act(async () => {
      const result = await startGoogleConnect({ writeConnectionId: connectionId });
      if (result && !result.ok) return false;
      await refresh(); return true;
    }),
    loadChoices: (connectionId: string) => act(async () => {
      setChoices([]); const result = await getWriteCalendars(connectionId);
      if (!result.ok || !mounted.current) return false; setChoices(result.value.choices); return true;
    }),
    save: (connectionId: string | null, googleCalendarId: string | null) => act(async () => {
      if (!calendarId) return false;
      const result = await setPushTarget(calendarId, connectionId, googleCalendarId);
      if (!result.ok) return false; await refresh(); return true;
    }),
    retry: () => act(async () => { const result = await runGooglePush(eventId,calendarId); await refresh(); return result.ok && result.value.failed === 0; }),
  };
}
