// 検証専用。通常の製品ビルドからは参照しない。認証・広告・アプリのサーバーを使わない。
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DayEventPanel } from '@/features/calendar/ui/DayEventPanel';
import { WeekView } from '@/features/calendar/ui/WeekView';
import { useDevicePhotosEnabled } from '@/features/settings/model/useDevicePhotosEnabled';
import { setQaPhotoEntitlement, useQaPhotoEntitlement } from './entitlements';
import '@/styles/global.css';

export function PhotoVerification() {
  const [date, setDate] = useState('2026-10-20');
  const [dayView, setDayView] = useState(false);
  const [visible, setVisible] = useState(true);
  const { devicePhotosEnabled, setDevicePhotosEnabled } = useDevicePhotosEnabled();
  const photoEntitled = useQaPhotoEntitlement();
  return <main className="mx-auto max-w-2xl bg-surface-base p-4 text-ink-primary">
    <h1>端末写真の検証専用画面</h1>
    <label><input id="photo-entitled" type="checkbox" checked={photoEntitled} onChange={event => setQaPhotoEntitlement(event.target.checked)} />検証用の写真契約(有効／無効)</label>
    <label><input id="enabled" type="checkbox" checked={devicePhotosEnabled} onChange={event => setDevicePhotosEnabled(event.target.checked)} />カレンダーに端末の写真を表示</label>
    <label>選択日<input id="day" type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
    <button id="view" onClick={() => setDayView(!dayView)}>月／日表示を切替</button>
    <button id="leave" onClick={() => setVisible(!visible)}>写真画面を退出／再表示</button>
    {visible && (dayView ? <WeekView cursor={date} today="2026-10-20" events={[]} calendarById={new Map()} onSlotTap={() => {}} onEventTap={() => {}} userId="検証専用" /> :
      <DayEventPanel date={date} byDay={new Map()} calendarById={new Map()} onEventTap={() => {}} onAddEvent={() => {}} userId="検証専用" />)}
  </main>;
}
createRoot(document.getElementById('root')!).render(<PhotoVerification />);
