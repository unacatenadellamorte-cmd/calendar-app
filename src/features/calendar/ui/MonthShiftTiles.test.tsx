import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MonthShiftTiles } from './MonthShiftTiles';
import { appError, err, ok } from '@/data/result';
import type { Calendar } from '@/data/calendars';
import type { ShiftTemplate } from '@/data/shift-templates';

const createShifts = vi.fn();
const template: ShiftTemplate = { id: 't1', name: '夜勤', startLocal: '22:00', endLocal: '06:00', breakMinutes: 60, hourlyWage: 1200, workplaceLabel: null, color: '#009E73', createdAt: '', updatedAt: '' };
const calendar: Calendar = { id: 'shift', name: 'シフト', color: '#009E73', source: 'local', isShift: true, isVisible: true, priority: 0, createdAt: '', updatedAt: '' };
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/data/shifts', () => ({ createShifts: (...args: unknown[]) => createShifts(...args) }));
vi.mock('@/features/shifts/model/useShiftTemplates', () => ({ useShiftTemplates: () => ({ templates: [template], loading: false, errorKey: null }) }));
beforeEach(() => createShifts.mockReset());

describe('月表示のシフトタイル', () => {
  it('選択日だけを登録し、成功した予定をカレンダーへ反映する', async () => {
    const onCreated = vi.fn();
    createShifts.mockResolvedValue(ok([]));
    const view = render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled onCreated={onCreated} />);
    view.rerender(<MonthShiftTiles date="2026-09-21" calendars={[calendar]} enabled onCreated={onCreated} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: '夜勤を2026-09-21に追加' })));
    expect(createShifts).toHaveBeenCalledWith('shift', template, ['2026-09-21']);
    expect(onCreated).toHaveBeenCalledWith([]);
    expect(screen.getByRole('status')).toHaveTextContent('2026-09-21に「夜勤」を追加しました');
  });
  it('保存中の連打を抑止し、失敗は表示して再試行できる', async () => {
    let resolve!: (value: unknown) => void;
    createShifts.mockReturnValue(new Promise((done) => { resolve = done; }));
    const onCreated = vi.fn();
    render(<MonthShiftTiles date="2026-09-08" calendars={[calendar]} enabled onCreated={onCreated} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    fireEvent.click(button);
    expect(createShifts).toHaveBeenCalledTimes(1);
    await act(async () => resolve(err(appError('data/query', 'data/query'))));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(button).toBeEnabled();
    expect(onCreated).not.toHaveBeenCalled();
  });
  it('シフト用カレンダーがないと登録しない', () => {
    render(<MonthShiftTiles date="2026-09-08" calendars={[]} enabled onCreated={vi.fn()} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
