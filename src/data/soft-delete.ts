import { supabase } from './supabase';

/**
 * 論理削除(`deleted_at`)された行を除いた読み取りビルダを返す。
 *
 * data 層の**すべての読み取り**はこれを通し、`.is('deleted_at', null)` を
 * クエリに直書きしない ── 新しい読み取り経路で除外を書き忘れるのを防ぐ
 * (規約 / epics.md 1.4 AC3「全読み取りクエリは共通ヘルパで deleted_at IS NULL を強制」)。
 *
 * 呼び出し側は事前に `if (!supabase) return err(...)` で分岐している前提
 * (既存の data 関数はすべてそうしている)。返り値にそのまま `.eq()` / `.order()` /
 * `.maybeSingle()` などをチェーンできる。
 *
 *   const { data, error } = await selectActive('events', COLUMNS)
 *     .order('starts_at', { ascending: true });
 *
 *   // 件数だけ:
 *   const { count } = await selectActive('events', '*', { count: 'exact', head: true })
 *     .eq('connection_id', id);
 */
export function selectActive(
  table: string,
  columns = '*',
  options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
) {
  // 呼び出し側が事前に null チェック済み。テストは @/data/supabase をモックする。
  const from = supabase!.from(table);
  const query = options ? from.select(columns, options) : from.select(columns);
  return query.is('deleted_at', null);
}
