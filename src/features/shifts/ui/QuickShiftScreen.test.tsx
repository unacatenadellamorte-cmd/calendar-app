import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, appError } from '@/data/result';
import type { Calendar } from '@/data/calendars';
import type { ShiftTemplate } from '@/data/shift-templates';
import { todayLocalDate } from '@/lib/datetime';

const navigateMock = vi.fn();
const createShifts = vi.fn();
const refreshFeaturedWidget = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/data/shifts', () => ({ createShifts: (...a: unknown[]) => createShifts(...a) }));
vi.mock('@/platform/widget', () => ({
  refreshFeaturedWidget: (...a: unknown[]) => refreshFeaturedWidget(...a),
}));

const calendar: Calendar = {
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
};
const shiftCalendar: Calendar = { ...calendar, id: 'shift', name: 'シフト', isShift: true };

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

let authState: { state: string } = { state: 'guest' };
let calState: Record<string, unknown>;
let shState: Record<string, unknown>;

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/features/calendars/model/useCalendars', () => ({ useCalendars: () => calState }));
vi.mock('@/features/shifts/model/useShiftTemplates', () => ({ useShiftTemplates: () => shState }));

const { QuickShiftScreen } = await import('./QuickShiftScreen');

beforeEach(() => {
  navigateMock.mockClear();
  createShifts.mockReset();
  refreshFeaturedWidget.mockReset();
  refreshFeaturedWidget.mockResolvedValue(undefined);
  authState = { state: 'guest' };
  calState = { calendars: [calendar, shiftCalendar], loading: false, errorKey: null };
  shState = { templates: [], loading: false, errorKey: null };
});

describe('QuickShiftScreen', () => {
  it('起点日の既定値は今日', () => {
    render(<QuickShiftScreen />);
    expect(screen.getByLabelText('起点日')).toHaveValue(todayLocalDate());
  });

  it('起点日を変更すると入力値が変わる', () => {
    shState.templates = [tpl()];
    render(<QuickShiftScreen />);
    const input = screen.getByLabelText('起点日');
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    expect(input).toHaveValue('2026-12-25');
  });

  it('テンプレ未登録なら案内文 + 作成ボタン(タップでテンプレ管理へ)', async () => {
    const user = userEvent.setup();
    render(<QuickShiftScreen />);
    expect(screen.getByText(/よく使うシフトを登録すると/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '＋ お気に入りシフトを作る' }));
    expect(navigateMock).toHaveBeenCalledWith('/shift-templates');
  });

  it('テンプレをタップすると、変更後の起点日から dayCount 日ぶん createShifts を呼び /calendar へ戻る', async () => {
    const user = userEvent.setup();
    shState.templates = [tpl({ id: 't1', name: '平日' })];
    createShifts.mockResolvedValue(ok([]));
    render(<QuickShiftScreen />);

    const input = screen.getByLabelText('起点日');
    fireEvent.change(input, { target: { value: '2026-12-25' } });
    await user.click(screen.getByRole('button', { name: '日数を増やす' }));
    await user.click(screen.getByRole('button', { name: /平日/ }));

    expect(createShifts).toHaveBeenCalledWith(
      'shift',
      expect.objectContaining({ id: 't1' }),
      ['2026-12-25', '2026-12-26'],
    );
    expect(navigateMock).toHaveBeenCalledWith('/calendar');
  });

  it('シフト作成に成功したらホーム画面ウィジェットを最新化する(useEvents の create/addLocal と同じ契約)', async () => {
    const user = userEvent.setup();
    shState.templates = [tpl({ id: 't1', name: '平日' })];
    createShifts.mockResolvedValue(ok([]));
    render(<QuickShiftScreen />);

    await user.click(screen.getByRole('button', { name: /平日/ }));

    expect(refreshFeaturedWidget).toHaveBeenCalledTimes(1);
  });

  it('起点日が空だとテンプレボタンが無効化され、タップしても createShifts を呼ばない(1900年シフト作成の防止)', async () => {
    const user = userEvent.setup();
    shState.templates = [tpl({ id: 't1', name: '平日' })];
    render(<QuickShiftScreen />);

    fireEvent.change(screen.getByLabelText('起点日'), { target: { value: '' } });
    expect(screen.getByText('起点日を入力してください。')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /平日/ }));

    expect(createShifts).not.toHaveBeenCalled();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('作成に失敗したらページ内にエラー表示し、遷移しない', async () => {
    const user = userEvent.setup();
    shState.templates = [tpl()];
    createShifts.mockResolvedValue(err(appError('data/query', 'data/query')));
    render(<QuickShiftScreen />);

    await user.click(screen.getByRole('button', { name: /平日/ }));

    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('シフト用カレンダー未取得ならテンプレ選択を無効化する', () => {
    calState.calendars = [calendar]; // isShift なカレンダーが無い
    shState.templates = [tpl()];
    render(<QuickShiftScreen />);
    expect(
      screen.getByText('シフト用カレンダーを準備しています。少し待って再度お試しください。'),
    ).toBeInTheDocument();
  });

  it('読み込み中は空状態の文言を出さず、ローディング表示にする', () => {
    calState.loading = true;
    shState.templates = []; // 実際は登録済みでも、テンプレ取得がまだ反映されていない状態を想定
    render(<QuickShiftScreen />);
    expect(screen.getByText('読み込み中…')).toBeInTheDocument();
    expect(screen.queryByText(/よく使うシフトを登録すると/)).not.toBeInTheDocument();
  });

  it('unavailable では設定を促す文言のみ', () => {
    authState = { state: 'unavailable' };
    render(<QuickShiftScreen />);
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
    expect(screen.queryByLabelText('起点日')).not.toBeInTheDocument();
  });
});
