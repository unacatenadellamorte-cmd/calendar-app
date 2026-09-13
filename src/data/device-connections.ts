import { supabase } from './supabase';
import { selectActive } from './soft-delete';
import { appError, err, ok, type Result } from './result';
import { isNetworkError } from './net';
import { requestDeviceCalendarAccess } from '@/platform/deviceCalendar';

/**
 * 端末カレンダー接続の data-access レイヤ(Story 5.2、ARCHITECTURE-SPINE Epic5
 * AD-13 / AD-17)。`src/data/connections.ts`(Google)と対の形。
 *
 * Google と違い OAuth の秘密を持たないため、書き込みはすべて認証済みクライアントの
 * `supabase-js` 直接呼び出しで既存 RLS の範囲内のみ行う(service_role RPC は使わない)。
 */

export interface DeviceConnection {
  id: string;
  provider: 'device';
  createdAt: string;
}

interface DeviceConnectionRow {
  id: string;
  provider: 'device';
  created_at: string;
}

const UNAVAILABLE = appError('connection/unavailable', 'connection/unavailable');
const COLUMNS = 'id,provider,created_at';

function toDeviceConnection(row: DeviceConnectionRow): DeviceConnection {
  return { id: row.id, provider: row.provider, createdAt: row.created_at };
}

/** 自分の有効な端末カレンダー接続を1件返す(無ければ null)。 */
export async function getDeviceConnection(): Promise<Result<DeviceConnection | null>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const { data, error } = await selectActive('connections', COLUMNS)
      .eq('provider', 'device')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle<DeviceConnectionRow>();
    if (error) return err(appError('data/query', 'data/query', error));
    return ok(data ? toDeviceConnection(data) : null);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('data/query', 'data/query', e));
  }
}

/**
 * OS の権限ダイアログを出し、許可されたら `connections(provider='device')` 行を作る。
 * 拒否された場合はアプリを落とさず `connection/permission-denied` を返す(NFR13)。
 * 既に有効な接続があれば権限要求・INSERT をせずそのまま成功扱いにする
 * (連打などの二重発火で一意制約違反の汎用エラーになるのを防ぐ)。
 */
export async function connectDevice(): Promise<Result<void>> {
  if (!supabase) return err(UNAVAILABLE);
  try {
    const existing = await getDeviceConnection();
    if (existing.ok && existing.value) return ok(undefined);

    const permission = await requestDeviceCalendarAccess();
    if (permission !== 'granted') {
      return err(appError('connection/permission-denied', 'connection/permission-denied'));
    }
    const { error } = await supabase.from('connections').insert({ provider: 'device' });
    if (error) return err(appError('data/query', 'data/query', error));
    return ok(undefined);
  } catch (e) {
    if (isNetworkError(e)) return err(appError('data/offline', 'data/offline', e));
    return err(appError('connection/device-unavailable', 'connection/device-unavailable', e));
  }
}
