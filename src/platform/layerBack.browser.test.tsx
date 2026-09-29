import { StrictMode, useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { registerLayerBack } from './layerBack';
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web' } }));
function Calendar() {
  const [week, setWeek] = useState(false);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    if (week && !sheet) return registerLayerBack(() => setWeek(false));
  }, [week, sheet]);
  useEffect(() => {
    if (sheet) return registerLayerBack(() => setSheet(false));
  }, [sheet]);
  return (
    <>
      <h1>{week ? '週一覧' : '月カレンダー'}</h1>
      <button onClick={() => setWeek(true)}>日付</button>
      <button onClick={() => setSheet(true)}>追加</button>
      {sheet && <div role="dialog">予定入力</div>}
    </>
  );
}
describe('ブラウザルーターとレイヤー履歴', () => {
  it('StrictModeでも予定入力→週→月→ホームの順で戻れる', async () => {
    history.replaceState({}, '', '/');
    const user = userEvent.setup();
    render(
      <StrictMode>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Link to="/calendar">ホームから開く</Link>} />
            <Route path="/calendar" element={<Calendar />} />
          </Routes>
        </BrowserRouter>
      </StrictMode>,
    );
    await user.click(screen.getByText('ホームから開く'));
    await user.click(screen.getByText('日付'));
    await user.click(screen.getByText('追加'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => history.back());
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading')).toHaveTextContent('週一覧');
    await waitFor(() => expect(history.state.__calendarLayer).toBeDefined());
    act(() => history.back());
    await waitFor(() => expect(screen.getByRole('heading')).toHaveTextContent('月カレンダー'));
    act(() => history.back());
    await waitFor(() => expect(screen.getByText('ホームから開く')).toBeInTheDocument());
  });
});
