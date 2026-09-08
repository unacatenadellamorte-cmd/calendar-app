import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShiftTemplate } from '@/data/shift-templates';
import { QuickShiftSheet } from './QuickShiftSheet';

const tpl = (over: Partial<ShiftTemplate> = {}): ShiftTemplate => ({
  id: 't1',
  name: '平日',
  startLocal: '17:00',
  endLocal: '22:00',
  breakMinutes: 30,
  hourlyWage: 1100,
  workplaceLabel: null,
  color: '#009E73',
  createdAt: '',
  updatedAt: '',
  ...over,
});

const base = {
  open: true,
  date: '2026-09-08',
  shiftReady: true,
  errorKey: null,
  onClose: vi.fn(),
  onPick: vi.fn().mockResolvedValue(true),
  onAddEvent: vi.fn(),
  onCreateTemplate: vi.fn(),
};

describe('QuickShiftSheet', () => {
  it('見出しはその日、テンプレをチップで横に並べる', () => {
    render(<QuickShiftSheet {...base} templates={[tpl({ name: '平日' }), tpl({ id: 't2', name: '土曜' })]} />);
    expect(screen.getByRole('dialog', { name: '9月8日(火)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /平日/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /土曜/ })).toBeInTheDocument();
  });

  it('テンプレ未登録なら案内文 + 作成ボタン', async () => {
    const user = userEvent.setup();
    const onCreateTemplate = vi.fn();
    render(<QuickShiftSheet {...base} templates={[]} onCreateTemplate={onCreateTemplate} />);
    expect(screen.getByText(/よく使うシフトを登録すると/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '＋ お気に入りシフトを作る' }));
    expect(onCreateTemplate).toHaveBeenCalled();
  });

  it('チップをタップすると onPick(template, dayCount) → 閉じる', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn().mockResolvedValue(true);
    const onClose = vi.fn();
    render(<QuickShiftSheet {...base} templates={[tpl()]} onPick={onPick} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /平日/ }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }), 1);
    expect(onClose).toHaveBeenCalled();
  });

  it('日数ステッパで dayCount が変わる', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn().mockResolvedValue(true);
    render(<QuickShiftSheet {...base} templates={[tpl()]} onPick={onPick} />);
    await user.click(screen.getByRole('button', { name: '日数を増やす' }));
    await user.click(screen.getByRole('button', { name: '日数を増やす' }));
    await user.click(screen.getByRole('button', { name: /平日/ }));
    expect(onPick).toHaveBeenCalledWith(expect.anything(), 3);
  });

  it('errorKey をシート内に出す', () => {
    render(<QuickShiftSheet {...base} templates={[tpl()]} errorKey="data/query" />);
    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗');
  });

  it('「シフト以外の予定を追加」で onAddEvent', async () => {
    const user = userEvent.setup();
    const onAddEvent = vi.fn();
    render(<QuickShiftSheet {...base} templates={[]} onAddEvent={onAddEvent} />);
    await user.click(screen.getByRole('button', { name: 'シフト以外の予定を追加' }));
    expect(onAddEvent).toHaveBeenCalled();
  });
});
