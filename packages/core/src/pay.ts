/**
 * 給料計算(ARCHITECTURE-SPINE AD-7 / AD-8 / FR-13)。
 * このモジュールは何も import しない。フロントと将来の Edge Function が共有する。
 * 計算はすべて UTC 上の差分で行う(タイムゾーン変換・暦月判定は呼び出し側)。
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * シフトの実働分 = 終了 − 開始 − 休憩。
 * `startsAt` / `endsAt` は UTC ISO の時点。終了が開始以前(壁時計で日をまたぐ表現)なら
 * 終了を翌日として +24h し、1勤務として通算する(分割しない)。
 * クランプはしない(休憩過大なら負を返す。判断は呼び出し側)。
 */
export function workedMinutes(
  startsAt: string,
  endsAt: string,
  breakMinutes: number,
): number {
  const start = Date.parse(startsAt);
  let end = Date.parse(endsAt);
  if (end <= start) end += DAY_MS;
  return Math.round((end - start) / 60000) - breakMinutes;
}

/** 給料集計に必要な最小のシフト表現(camelCase・UTC ISO)。 */
export interface PayableShift {
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  hourlyWage: number;
}

/**
 * 対象月に絞り込み済みのシフト配列を「実働時間 × 時給」で合算する(FR-14 / FR-15)。
 * 暦月の判定・TZ 変換は呼び出し側の責務(ここは合算のみ)。
 * 各シフトの実働は 0 未満にクランプ(休憩過大でもマイナス給与にしない)。
 * `amount` は各シフト実額を合算後に丸める(per-shift 丸めの誤差を避ける)。
 */
export function monthlyPayEstimate(shifts: readonly PayableShift[]): {
  amount: number;
  shiftCount: number;
  workedMinutes: number;
} {
  let minutes = 0;
  let raw = 0;
  for (const s of shifts) {
    const worked = Math.max(0, workedMinutes(s.startsAt, s.endsAt, s.breakMinutes));
    minutes += worked;
    raw += (worked / 60) * s.hourlyWage;
  }
  return { amount: Math.round(raw), shiftCount: shifts.length, workedMinutes: minutes };
}
