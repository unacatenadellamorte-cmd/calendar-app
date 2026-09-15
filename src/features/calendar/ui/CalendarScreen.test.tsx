import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok } from '@/data/result';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import type { ShiftTemplate } from '@/data/shift-templates';

const navigateMock = vi.fn();
const createShifts = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));
vi.mock('@/data/shifts', () => ({ createShifts: (...a: unknown[]) => createShifts(...a) }));

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

const sampleEvent: EventItem = {
  id: 'e1',
  calendarId: 'c1',
  title: '会議アルファ',
  allDay: false,
  startsAt: '2026-09-08T01:00:00Z',
  endsAt: '2026-09-08T02:00:00Z',
  eventDate: null,
  note: null,
  source: 'local',
  breakMinutes: null,
  hourlyWage: null,
  workplaceLabel: null,
  shiftTemplateId: null,
  reminderMinutes: null,
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
let evState: Record<string, unknown>;
let shState: Record<string, unknown>;

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/features/calendars/model/useCalendars', () => ({ useCalendars: () => calState }));
vi.mock('@/features/events/model/useEvents', () => ({ useEvents: () => evState }));
vi.mock('@/features/shifts/model/useShiftTemplates', () => ({ useShiftTemplates: () => shState }));

const { CalendarScreen } = await import('./CalendarScreen');

beforeEach(() => {
  navigateMock.mockClear();
  createShifts.mockReset();
  authState = { state: 'guest' };
  calState = {
    calendars: [calendar],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    dismissError: vi.fn(),
  };
  evState = {
    events: [sampleEvent],
    loading: false,
    errorKey: null,
    pendingDelete: null,
    create: vi.fn().mockResolvedValue(true),
    addLocal: vi.fn(),
    update: vi.fn().mockResolvedValue(true),
    remove: vi.fn(),
    setReminder: vi.fn().mockResolvedValue(true),
    undoDelete: vi.fn(),
    dismissError: vi.fn(),
  };
  shState = { templates: [], loading: false, errorKey: null };
});

describe('CalendarScreen', () => {
  it('既定は月ビュー(日セルの追加ボタンを描画)', () => {
    render(<CalendarScreen />);
    expect(screen.getByRole('radio', { name: '月', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9月15日を開く' })).toBeInTheDocument();
  });

  it('initialDate を渡すとその月・その日で開く', () => {
    render(<CalendarScreen initialDate="2026-12-25" />);
    expect(screen.getByRole('button', { name: '2026年12月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12月25日を開く' })).toBeInTheDocument();
  });

  it('「日」を選ぶと日ビュー(1日タイムライン)に切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: '日' }));
    expect(screen.getByRole('radio', { name: '日', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7時に予定を追加' })).toBeInTheDocument();
  });

  it('「リスト」を選ぶとリストビューに切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: 'リスト' }));
    expect(screen.getByText('会議アルファ')).toBeInTheDocument();
    expect(screen.getByText('9月8日(火)')).toBeInTheDocument();
  });

  it('月ビューで「他 N 件」をタップするとその日へ移動してリストビューに切り替わる', async () => {
    const user = userEvent.setup();
    evState.events = [0, 1, 2, 3].map((i) => ({
      ...sampleEvent,
      id: `s${i}`,
      title: `予定${i}`,
      startsAt: `2026-09-18T0${i}:00:00Z`,
      endsAt: `2026-09-18T0${i + 1}:00:00Z`,
    }));
    render(<CalendarScreen />);
    await user.click(screen.getByRole('button', { name: '他 1 件' }));
    expect(screen.getByRole('radio', { name: 'リスト', checked: true })).toBeInTheDocument();
    expect(screen.getByText('9月18日(金)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9月15日を開く' })).not.toBeInTheDocument();
  });

  it('月ビューで日セルをタップすると quick-shift シートが開く(テンプレ未登録なら案内)', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('button', { name: '9月15日を開く' }));
    expect(screen.getByRole('dialog', { name: '9月15日(火)' })).toBeInTheDocument();
    expect(screen.getByText(/よく使うシフトを登録すると/)).toBeInTheDocument();
  });

  it('quick-shift でテンプレを選ぶと createShifts を呼び、結果を addLocal する', async () => {
    const user = userEvent.setup();
    calState.calendars = [calendar, shiftCalendar];
    shState.templates = [tpl({ id: 't1', name: '平日' })];
    const created = [{ ...sampleEvent, id: 'shift-1', calendarId: 'shift' }];
    createShifts.mockResolvedValue(ok(created));
    render(<CalendarScreen />);

    await user.click(screen.getByRole('button', { name: '9月15日を開く' }));
    await user.click(screen.getByRole('button', { name: /平日/ }));

    expect(createShifts).toHaveBeenCalledWith(
      'shift',
      expect.objectContaining({ id: 't1' }),
      ['2026-09-15'],
    );
    expect(evState.addLocal).toHaveBeenCalledWith(created);
    expect(screen.queryByRole('dialog', { name: '9月15日(火)' })).not.toBeInTheDocument();
  });

  it('quick-shift の「シフト以外の予定を追加」で予定フォームに切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('button', { name: '9月15日を開く' }));
    await user.click(screen.getByRole('button', { name: 'シフト以外の予定を追加' }));
    expect(screen.getByRole('dialog', { name: '予定を追加' })).toBeInTheDocument();
  });

  it('取り込んだ予定(source=google)をタップすると読み取り専用の詳細シートを開く', async () => {
    const user = userEvent.setup();
    calState.calendars = [{ ...calendar, id: 'g1', name: 'ゴミ収集日', source: 'google' }];
    evState.events = [
      { ...sampleEvent, id: 'gx', calendarId: 'g1', title: 'ゴミ収集', source: 'google' },
    ];
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: 'リスト' }));
    await user.click(screen.getByRole('button', { name: /ゴミ収集/ }));
    expect(screen.getByRole('dialog', { name: '予定の詳細' })).toBeInTheDocument();
    expect(
      screen.getByText('この予定は Google カレンダーから取り込んだものです。編集はできません。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '削除' })).not.toBeInTheDocument();
  });

  it('ev.errorKey があるとアラートを表示する', () => {
    evState.errorKey = 'event/offline';
    render(<CalendarScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('オフライン');
  });

  it('cal.errorKey があるとアラートを表示する', () => {
    calState.errorKey = 'data/query';
    render(<CalendarScreen />);
    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗');
  });

  it('unavailable では設定を促す文言のみ', () => {
    authState = { state: 'unavailable' };
    render(<CalendarScreen />);
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: '月' })).not.toBeInTheDocument();
  });

  describe('initialEventId(ディープリンク calendar-app://event/{id} 由来)', () => {
    it('該当するローカル予定があれば編集シートを1回だけ開く', () => {
      render(<CalendarScreen initialEventId="e1" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
    });

    it('該当する取り込み予定(source=google)があれば読み取り専用の詳細シートを開く', () => {
      evState.events = [{ ...sampleEvent, id: 'gx', source: 'google' }];
      render(<CalendarScreen initialEventId="gx" />);
      expect(screen.getByRole('dialog', { name: '予定の詳細' })).toBeInTheDocument();
    });

    it('存在しない ID なら何も開かず静かにフォールバックする(エラー表示なし)', () => {
      render(<CalendarScreen initialEventId="not-found" />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      // 通常の月ビューが変わらず表示される。
      expect(screen.getByRole('radio', { name: '月', checked: true })).toBeInTheDocument();
    });

    it('ev がロード中の間は開かず、ロード完了後に開く', () => {
      evState.loading = true;
      const { rerender } = render(<CalendarScreen initialEventId="e1" />);
      expect(screen.queryByRole('dialog', { name: '予定を編集' })).not.toBeInTheDocument();

      evState = { ...evState, loading: false };
      rerender(<CalendarScreen initialEventId="e1" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
    });

    it('cal がロード中の間は開かず、ロード完了後に開く(「不明なカレンダー」表示の防止)', () => {
      calState.loading = true;
      const { rerender } = render(<CalendarScreen initialEventId="e1" />);
      expect(screen.queryByRole('dialog', { name: '予定を編集' })).not.toBeInTheDocument();

      calState = { ...calState, loading: false };
      rerender(<CalendarScreen initialEventId="e1" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
    });

    it('auth 解決前(cold launch, enabled=false)は開かず、解決後に開く', () => {
      authState = { state: 'loading' };
      const { rerender } = render(<CalendarScreen initialEventId="e1" />);
      expect(screen.queryByRole('dialog', { name: '予定を編集' })).not.toBeInTheDocument();

      authState = { state: 'guest' };
      rerender(<CalendarScreen initialEventId="e1" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
    });

    it('initialEventId が別の値に変わったら、同じマウント内でも再度処理して切り替わる(ラッチの誤固定防止)', async () => {
      const user = userEvent.setup();
      const secondEvent = { ...sampleEvent, id: 'e2', title: '別の予定' };
      evState.events = [sampleEvent, secondEvent];
      const { rerender } = render(<CalendarScreen initialEventId="e1" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
      expect(screen.getByLabelText('タイトル')).toHaveValue('会議アルファ');

      // 一旦閉じてから、別の予定への2件目のディープリンクを想定。
      await user.click(screen.getByRole('button', { name: '閉じる' }));
      rerender(<CalendarScreen initialEventId="e2" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
      expect(screen.getByLabelText('タイトル')).toHaveValue('別の予定');
    });
  });
});
