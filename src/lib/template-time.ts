/** 終日でも既存の時刻列の制約を満たす値を保持する。 */
export function normalizeTemplateTimes(allDay: boolean, startLocal: string, endLocal: string) {
  const hhmm = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
  if (allDay && (!hhmm.test(startLocal) || !hhmm.test(endLocal) || startLocal === endLocal)) {
    return { startLocal: '09:00', endLocal: '18:00' };
  }
  return { startLocal, endLocal };
}
