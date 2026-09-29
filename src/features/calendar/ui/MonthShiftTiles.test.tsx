import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MonthShiftTiles } from './MonthShiftTiles';
import { appError, err, ok } from '@/data/result';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import type { ShiftTemplate } from '@/data/shift-templates';

const createShifts = vi.fn();
const template: ShiftTemplate = { id: 't1', name: '夜勤', startLocal: '22:00', endLocal: '06:00', breakMinutes: 60, hourlyWage: 1200, workplaceLabel: null, color: '#009E73', createdAt: '', updatedAt: '' };
const calendar: Calendar = { id: 'shift', name: 'シフト', color: '#009E73', source: 'local', isShift: true, isVisible: true, priority: 0, createdAt: '', updatedAt: '' };
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/data/shifts', () => ({ createShifts: (...args: unknown[]) => createShifts(...args) }));
const updateTemplate = vi.fn().mockResolvedValue(true);
const removeTemplate = vi.fn();
vi.mock('@/features/shifts/model/useShiftTemplates', () => ({ useShiftTemplates: () => ({ templates: [template], loading: false, errorKey: null, update: updateTemplate, remove: removeTemplate, dismissError: vi.fn() }) }));
beforeEach(() => {
  createShifts.mockReset();
  updateTemplate.mockReset().mockResolvedValue(true);
  removeTemplate.mockReset();
});

const event = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1', calendarId: 'shift', title: '夜勤', allDay: false,
  startsAt: '2026-09-08T22:00:00+09:00', endsAt: '2026-09-09T06:00:00+09:00',
  eventDate: null, note: null, source: 'local', breakMinutes: 60, hourlyWage: 1200,
  workplaceLabel: null, shiftTemplateId: 't1', reminderMinutes: null, isSecret: false,
  createdAt: '', updatedAt: '', ...over,
});

describe('月表示のシフトタイル', () => {
  it('短押しは追加し、500ms長押しは編集だけを開く', () => {
    vi.useFakeTimers();
    try {
      const onCreated = vi.fn();
      createShifts.mockResolvedValue(ok([]));
      render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled events={[]}
        onDateChange={vi.fn()} onRemove={vi.fn()} onCreated={onCreated} />);
      const button = screen.getByRole('button', { name: '夜勤を2026-09-08に追加' });
      fireEvent.click(button);
      expect(createShifts).toHaveBeenCalledTimes(1);
      createShifts.mockClear();
      fireEvent(button, Object.assign(new Event('pointerdown', { bubbles: true }), {
        button: 0, isPrimary: true, clientX: 20, clientY: 20,
      }));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.getByRole('dialog', { name: 'お気に入りシフトを編集' })).toBeInTheDocument();
      fireEvent.pointerUp(button);
      fireEvent.click(button);
      expect(createShifts).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('移動・右クリック・日付変更では長押し編集を起こさず、次の操作を通す', () => {
    vi.useFakeTimers();
    try {
      const onDateChange = vi.fn();
      render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled events={[]}
        onDateChange={onDateChange} onRemove={vi.fn()} onCreated={vi.fn()} />);
      const button = screen.getByRole('button', { name: '夜勤を2026-09-08に追加' });
      fireEvent(button, Object.assign(new Event('pointerdown', { bubbles: true }), {
        button: 0, isPrimary: true, clientX: 20, clientY: 20,
      }));
      fireEvent(button, Object.assign(new Event('pointermove', { bubbles: true }), {
        button: 0, isPrimary: true, clientX: 40, clientY: 20,
      }));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      fireEvent.pointerDown(button, { button: 2, isPrimary: false });
      fireEvent.pointerUp(button);
      fireEvent.click(screen.getByRole('button', { name: '翌日に移動' }));
      expect(onDateChange).toHaveBeenCalledWith('2026-09-09');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it('矢印は月境界をまたいで1日ずつ選択日を動かす', () => {
    const onDateChange = vi.fn();
    render(<MonthShiftTiles date="2026-09-01" calendars={[calendar]} enabled events={[]}
      onDateChange={onDateChange} onRemove={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '前日に移動' }));
    fireEvent.click(screen.getByRole('button', { name: '翌日に移動' }));
    expect(onDateChange.mock.calls).toEqual([['2026-08-31'], ['2026-09-02']]);
  });
  it('同日のシフトが1件なら直接その予定を削除する', async () => {
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const shift = event();
    render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled events={[shift]}
      onDateChange={vi.fn()} onRemove={onRemove} onCreated={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '選択日のシフトを削除' })));
    expect(onRemove).toHaveBeenCalledWith(shift);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('複数ある日は選択ウィンドウを出し、選んだ1件だけ削除する', async () => {
    const shifts = [event(), event({ id: 'e2', title: '早番' })];
    const onRemove = vi.fn().mockResolvedValue(undefined);
    render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled events={shifts}
      onDateChange={vi.fn()} onRemove={onRemove} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '選択日のシフトを削除' }));
    expect(screen.getByRole('dialog', { name: '削除するシフトを選択' })).toBeInTheDocument();
    expect(onRemove).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /早番/ })));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(shifts[1]);
  });
  it('別日・通常予定・外部予定は削除対象にしない', () => {
    render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled events={[
      event({ startsAt: '2026-09-07T22:00:00+09:00' }),
      event({ calendarId: 'ordinary', shiftTemplateId: null }),
      event({ source: 'google' }),
    ]} onDateChange={vi.fn()} onRemove={vi.fn()} onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: '選択日のシフトを削除' })).toBeDisabled();
  });
  it('選択ウィンドウを閉じるだけでは削除しない', () => {
    const onRemove = vi.fn();
    render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled events={[event(), event({ id: 'e2' })]}
      onDateChange={vi.fn()} onRemove={onRemove} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '選択日のシフトを削除' }));
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('選択日だけを登録し、成功した予定をカレンダーへ反映する', async () => {
    const onCreated = vi.fn();
    createShifts.mockResolvedValue(ok([]));
    const view = render(<MonthShiftTiles events={[]} onDateChange={vi.fn()} onRemove={vi.fn()} date="2026-09-08" calendars={[calendar]} enabled onCreated={onCreated} />);
    view.rerender(<MonthShiftTiles events={[]} onDateChange={vi.fn()} onRemove={vi.fn()} date="2026-09-21" calendars={[calendar]} enabled onCreated={onCreated} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '夜勤を2026-09-21に追加' })));
    expect(createShifts).toHaveBeenCalledWith('shift', template, ['2026-09-21']);
    expect(onCreated).toHaveBeenCalledWith([]);
    expect(screen.getByRole('status')).toHaveTextContent('2026-09-21に「夜勤」を追加しました');
  });
  it('保存中の連打を抑止し、失敗は表示して再試行できる', async () => {
    let resolve!: (value: unknown) => void;
    createShifts.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onCreated = vi.fn();
    render(<MonthShiftTiles events={[]} onDateChange={vi.fn()} onRemove={vi.fn()} date="2026-09-08" calendars={[calendar]} enabled onCreated={onCreated} />);
    const button = screen.getByRole('button', { name: '夜勤を2026-09-08に追加' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createShifts).toHaveBeenCalledTimes(1);
    await act(async () => resolve(err(appError('data/query', 'data/query'))));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
  });
  it('シフト用カレンダーがないと登録しない', () => {
    render(<MonthShiftTiles events={[]} onDateChange={vi.fn()} onRemove={vi.fn()} date="2026-09-08" calendars={[]} enabled onCreated={vi.fn()} />);
    expect(screen.getByRole('button', { name: '夜勤を2026-09-08に追加' })).toBeDisabled();
  });
});
