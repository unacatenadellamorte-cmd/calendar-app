import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ShiftTemplate } from '@/data/shift-templates';

let authState: { state: string };
let shState: Record<string, unknown>;

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('../model/useShiftTemplates', () => ({ useShiftTemplates: () => shState }));

const { ShiftTemplatesScreen } = await import('./ShiftTemplatesScreen');

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

beforeEach(() => {
  authState = { state: 'guest' };
  shState = {
    templates: [],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn(),
    undoDelete: vi.fn(),
    dismissError: vi.fn(),
  };
});

describe('ShiftTemplatesScreen', () => {
  it('0件なら静かな案内 + 作成ボタン', () => {
    render(<ShiftTemplatesScreen />);
    expect(screen.getByText('まだお気に入りシフトはありません。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ お気に入りシフトを作る' })).toBeInTheDocument();
  });

  it('テンプレをチップで並べる', () => {
    shState.templates = [tpl({ id: 'a', name: '平日' }), tpl({ id: 'b', name: '土曜' })];
    render(<ShiftTemplatesScreen />);
    expect(screen.getByRole('button', { name: /平日/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /土曜/ })).toBeInTheDocument();
  });

  it('チップをタップすると編集シートが開く', async () => {
    const user = userEvent.setup();
    shState.templates = [tpl({ id: 'a', name: '平日' })];
    render(<ShiftTemplatesScreen />);
    await user.click(screen.getByRole('button', { name: /平日/ }));
    expect(screen.getByRole('dialog', { name: 'お気に入りシフトを編集' })).toBeInTheDocument();
  });

  it('作成ボタンで新規シートが開く', async () => {
    const user = userEvent.setup();
    render(<ShiftTemplatesScreen />);
    await user.click(screen.getByRole('button', { name: '＋ お気に入りシフトを作る' }));
    expect(screen.getByRole('dialog', { name: 'お気に入りシフトを作成' })).toBeInTheDocument();
  });

  it('pendingDelete があると Undo を出す', () => {
    shState.pendingDelete = tpl({ name: '平日' });
    render(<ShiftTemplatesScreen />);
    expect(screen.getByText(/「平日」を削除しました/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取り消す' })).toBeInTheDocument();
  });

  it('unavailable なら設定を促す', () => {
    authState = { state: 'unavailable' };
    render(<ShiftTemplatesScreen />);
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
  });
});
