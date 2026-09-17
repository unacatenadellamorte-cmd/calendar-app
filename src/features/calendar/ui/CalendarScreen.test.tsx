import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';

const navigateMock = vi.fn();
const backHandlers = vi.hoisted(() => new Set<() => void>());
vi.mock('@/platform/layerBack', () => ({
  registerLayerBack: (handler: () => void) => {
    backHandlers.add(handler);
    return () => {
      backHandlers.delete(handler);
    };
  },
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

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
  isSecret: false,
  createdAt: '',
  updatedAt: '',
};

let authState: { state: string } = { state: 'guest' };
let calState: Record<string, unknown>;
let evState: Record<string, unknown>;
let secretState: { unlocked: boolean } = { unlocked: false };

vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/features/calendars/model/useCalendars', () => ({ useCalendars: () => calState }));
vi.mock('@/features/events/model/useEvents', () => ({ useEvents: () => evState }));
vi.mock('@/features/shifts/model/useShiftTemplates', () => ({
  useShiftTemplates: () => ({ templates: [], loading: false, errorKey: null }),
}));
vi.mock('@/app/secret-mode-context', () => ({ useSecretMode: () => secretState }));

const { CalendarScreen } = await import('./CalendarScreen');

beforeEach(() => {
  navigateMock.mockClear();
  authState = { state: 'guest' };
  secretState = { unlocked: false };
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
});

describe('CalendarScreen', () => {
  it('週一覧でAndroidの戻るを押すと同じ日付の月表示へ戻り、画面遷移しない', () => {
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    expect(backHandlers.size).toBe(1);
    act(() => Array.from(backHandlers).at(-1)?.());
    expect(screen.getByRole('button', { name: '9月1日を開く' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9月8日を開く' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
    expect(backHandlers.size).toBe(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });
  it('週一覧から予定入力を開いたときは入力レイヤーだけが戻るを受け取る', () => {
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    fireEvent.click(screen.getByRole('button', { name: '＋ この日に予定を追加' }));
    expect(backHandlers.size).toBe(1);
    act(() => Array.from(backHandlers).at(-1)?.());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9月1日を開く' })).toBeInTheDocument();
    expect(backHandlers.size).toBe(0);
    expect(navigateMock).not.toHaveBeenCalled();
  });
  it('予定が詰まった日の予定名タップで週と一覧を開き、一覧から編集できる', async () => {
    const user = userEvent.setup();
    evState.events = Array.from({ length: 5 }, (_, i) => ({
      ...sampleEvent,
      id: `busy-${i}`,
      title: `予定${i}`,
    }));
    render(<CalendarScreen />);
    await user.click(screen.getByRole('button', { name: /予定0/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '月表示に戻る' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ この日に予定を追加' })).toBeInTheDocument();
    const panel = screen.getByRole('heading', { name: '9月8日(火)' }).closest('section')!;
    expect(within(panel).getAllByRole('listitem')).toHaveLength(5);
    await user.click(within(panel).getByRole('button', { name: /予定0/ }));
    expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
  });
  it('予定のある日でも予定チップを長押しすると、その日の新規追加レイヤーを直接開く', () => {
    vi.useFakeTimers();
    try {
      render(<CalendarScreen />);
      const chip = screen.getByRole('button', { name: /会議アルファ/ });
      fireEvent(
        chip,
        Object.assign(new Event('pointerdown', { bubbles: true }), {
          button: 0,
          isPrimary: true,
          clientX: 20,
          clientY: 20,
        }),
      );
      act(() => vi.advanceTimersByTime(500));
      fireEvent.pointerUp(chip);
      fireEvent.click(chip);
      expect(screen.getByRole('dialog', { name: '予定を追加' })).toBeInTheDocument();
      expect(screen.getByLabelText('タイトル')).toHaveValue('');
      expect(screen.getByLabelText('開始')).toHaveValue('2026-09-08T09:00');
      expect(screen.queryByRole('dialog', { name: '予定を編集' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
  it('タブは年・月・日・リストの順で、日付の通常タップは週と予定一覧を開く', async () => {
    render(<CalendarScreen />);
    expect(screen.getAllByRole('radio').map((button) => button.textContent)).toEqual([
      '年',
      '月',
      '日',
      'リスト',
    ]);
    await userEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    expect(screen.getByRole('button', { name: '9月8日を開く' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: '月表示に戻る' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ この日に予定を追加' })).toBeInTheDocument();
  });

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

  it('月見出しの金額は表示月に追従し、表示OFFでもシフトカレンダーを集計する', async () => {
    const user = userEvent.setup();
    calState.calendars = [{ ...calendar, id: 'shift', isShift: true, isVisible: false }];
    evState.events = [
      {
        ...sampleEvent,
        calendarId: 'shift',
        startsAt: '2026-09-08T00:00:00Z',
        endsAt: '2026-09-08T08:00:00Z',
        breakMinutes: 60,
        hourlyWage: 1100,
      },
    ];
    render(<CalendarScreen />);
    expect(screen.getByText('¥7,700')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByText('¥0')).toBeInTheDocument();
  });

  it('ロック中は秘密シフトの金額を除外し、解除・再ロックに即時追従する', () => {
    calState.calendars = [{ ...calendar, isShift: true }];
    evState.events = [
      {
        ...sampleEvent,
        isSecret: true,
        startsAt: '2026-09-08T00:00:00Z',
        endsAt: '2026-09-08T08:00:00Z',
        breakMinutes: 60,
        hourlyWage: 1100,
      },
    ];
    const { rerender } = render(<CalendarScreen />);
    expect(screen.getByText('¥0')).toBeInTheDocument();
    secretState = { unlocked: true };
    rerender(<CalendarScreen />);
    expect(screen.getByText('¥7,700')).toBeInTheDocument();
    secretState = { unlocked: false };
    rerender(<CalendarScreen />);
    expect(screen.getByText('¥0')).toBeInTheDocument();
    expect(screen.queryByText('¥7,700')).not.toBeInTheDocument();
  });

  it('予定またはカレンダーのロード中は未確定の¥0を表示しない', () => {
    evState.loading = true;
    render(<CalendarScreen />);
    expect(screen.queryByText('¥0')).not.toBeInTheDocument();
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

  describe('シークレット予定の除外(spec-secret-mode)', () => {
    it('ロック中(unlocked=false)はリストビューからシークレット予定を除外する', async () => {
      evState.events = [{ ...sampleEvent, isSecret: true }];
      const user = userEvent.setup();
      render(<CalendarScreen />);
      await user.click(screen.getByRole('radio', { name: 'リスト' }));
      expect(screen.queryByText('会議アルファ')).not.toBeInTheDocument();
    });

    it('解除中(unlocked=true)はリストビューにシークレット予定も表示する', async () => {
      secretState = { unlocked: true };
      evState.events = [{ ...sampleEvent, isSecret: true }];
      const user = userEvent.setup();
      render(<CalendarScreen />);
      await user.click(screen.getByRole('radio', { name: 'リスト' }));
      expect(screen.getByText('会議アルファ')).toBeInTheDocument();
    });

    it('ロック中(unlocked=false)は月ビュー(既定)からシークレット予定を除外する', () => {
      evState.events = [{ ...sampleEvent, isSecret: true }];
      render(<CalendarScreen />);
      expect(screen.queryByText('会議アルファ')).not.toBeInTheDocument();
    });

    it('解除中(unlocked=true)は月ビューにもシークレット予定を表示する', () => {
      secretState = { unlocked: true };
      evState.events = [{ ...sampleEvent, isSecret: true }];
      render(<CalendarScreen />);
      expect(screen.getByText('会議アルファ')).toBeInTheDocument();
    });

    it('ロック中(unlocked=false)は週(日)ビューからシークレット予定を除外する', async () => {
      evState.events = [{ ...sampleEvent, isSecret: true }];
      const user = userEvent.setup();
      render(<CalendarScreen initialDate="2026-09-08" />);
      await user.click(screen.getByRole('radio', { name: '日' }));
      expect(screen.queryByText('会議アルファ')).not.toBeInTheDocument();
    });

    it('解除中(unlocked=true)は週(日)ビューにもシークレット予定を表示する', async () => {
      secretState = { unlocked: true };
      evState.events = [{ ...sampleEvent, isSecret: true }];
      const user = userEvent.setup();
      render(<CalendarScreen initialDate="2026-09-08" />);
      await user.click(screen.getByRole('radio', { name: '日' }));
      expect(screen.getByText('会議アルファ')).toBeInTheDocument();
    });

    it('ロック中(unlocked=false)は年ビューの「予定あり」ドットからシークレット予定を除外する', async () => {
      evState.events = [{ ...sampleEvent, isSecret: true }];
      const user = userEvent.setup();
      render(<CalendarScreen />);
      await user.click(screen.getByRole('radio', { name: '年' }));
      expect(
        screen.queryByRole('button', { name: '2026年9月8日を開く(予定あり)' }),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '2026年9月8日を開く' })).toBeInTheDocument();
    });

    it('解除中(unlocked=true)は年ビューの「予定あり」ドットにもシークレット予定を反映する', async () => {
      secretState = { unlocked: true };
      evState.events = [{ ...sampleEvent, isSecret: true }];
      const user = userEvent.setup();
      render(<CalendarScreen />);
      await user.click(screen.getByRole('radio', { name: '年' }));
      expect(
        screen.getByRole('button', { name: '2026年9月8日を開く(予定あり)' }),
      ).toBeInTheDocument();
    });
  });

  it('「年」を選ぶと年ビュー(1〜12月のミニグリッド)に切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: '年' }));
    expect(screen.getByRole('radio', { name: '年', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('2026年');
    expect(screen.getByRole('button', { name: '2026年9月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026年9月15日を開く' })).toBeInTheDocument();
  });

  it('年ビューは表示OFFのカレンダーの予定をドットに出さない(visibleEvents 経由の配線)', async () => {
    const user = userEvent.setup();
    const hiddenCalendar = { ...calendar, id: 'c2', name: '非表示', isVisible: false };
    calState.calendars = [calendar, hiddenCalendar];
    evState.events = [
      sampleEvent,
      {
        ...sampleEvent,
        id: 'hidden-ev',
        calendarId: 'c2',
        startsAt: '2026-09-20T01:00:00Z',
        endsAt: '2026-09-20T02:00:00Z',
      },
    ];
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: '年' }));
    const cell = screen.getByRole('button', { name: '2026年9月20日を開く' });
    expect(cell.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument();
  });

  it('年ビューで日付セルをタップすると、その日を cursor にして月ビューへ切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: '年' }));
    await user.click(screen.getByRole('button', { name: '2026年12月25日を開く' }));
    expect(screen.getByRole('radio', { name: '月', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026年12月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '12月25日を開く' })).toBeInTheDocument();
  });

  it('年ビューで月見出しをタップすると、その月1日を cursor にして月ビューへ切り替わる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('radio', { name: '年' }));
    await user.click(screen.getByRole('button', { name: '2026年3月' }));
    expect(screen.getByRole('radio', { name: '月', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '2026年3月' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3月1日を開く' })).toBeInTheDocument();
  });

  it('月ビューで「他 N 件」をタップするとその日の週表示と予定一覧を開く', async () => {
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
    expect(screen.getByRole('radio', { name: '月', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '＋ この日に予定を追加' })).toBeInTheDocument();
    expect(screen.getByText('9月18日(金)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9月15日を開く' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '9月1日を開く' })).not.toBeInTheDocument();
  });

  it('月ビューで日セルを短くタップすると、その日を含む週に折りたたまれ、その日の予定一覧パネルが出る(クイックシフトシートは開かない)', async () => {
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));

    expect(screen.getByRole('button', { name: '月表示に戻る' })).toBeInTheDocument();
    // 折りたたみ中は同じ月グリッド内でも他の週の日付は消える(9/8を含む週の外)。
    expect(screen.queryByRole('button', { name: '9月1日を開く' })).not.toBeInTheDocument();

    const panel = screen.getByRole('heading', { name: '9月8日(火)' }).closest('section');
    expect(panel).not.toBeNull();
    expect(within(panel as HTMLElement).getByText('会議アルファ')).toBeInTheDocument();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('「月表示に戻る」を押すと全体の月グリッドに戻りパネルが閉じる', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    await user.click(screen.getByRole('button', { name: '月表示に戻る' }));

    expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9月1日を開く' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '9月8日(火)' })).not.toBeInTheDocument();
  });

  it('パネルの「＋ この日に予定を追加」を押すと、その日をシードした予定フォームが開く', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    await user.click(screen.getByRole('button', { name: '＋ この日に予定を追加' }));

    expect(screen.getByRole('dialog', { name: '予定を追加' })).toBeInTheDocument();
    expect(screen.getByLabelText('開始')).toHaveValue('2026-09-08T09:00');
  });

  it('折りたたみ中に月を送ると selectedDay が自動でクリアされる(パネルが宙に浮かない)', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    expect(screen.getByRole('button', { name: '月表示に戻る' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '9月8日(火)' })).not.toBeInTheDocument();
    // 10月のフル月グリッドに戻っている(パネルだけが古い日付のまま残っていない)。
    expect(screen.getByRole('button', { name: '10月1日を開く' })).toBeInTheDocument();
  });

  it('折りたたみ中に別ビューへ切り替えると selectedDay が自動でクリアされ、月ビューに戻ってもパネルは出ない', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    fireEvent.click(screen.getByRole('button', { name: '9月8日を開く' }));
    await user.click(screen.getByRole('radio', { name: 'リスト' }));
    await user.click(screen.getByRole('radio', { name: '月' }));

    expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '9月8日(火)' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9月1日を開く' })).toBeInTheDocument();
  });

  it('月ビューで日セルをダブルタップすると、その日を cursor にして「日」ビューへ切り替わる(折りたたみ解除)', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.dblClick(screen.getByRole('button', { name: '9月15日を開く' }));

    expect(screen.getByRole('radio', { name: '日', checked: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7時に予定を追加' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
  });

  it('ヘッダーの「シフトを追加」をタップすると /shifts/add へ遷移する', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen />);
    await user.click(screen.getByRole('button', { name: 'シフトを追加' }));
    expect(navigateMock).toHaveBeenCalledWith('/shifts/add');
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
      screen.getByText(
        'この予定は Google カレンダーから取り込んだものです。編集はできません。',
      ),
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

  it('月グリッドでのスワイプでカーソルが移動する(左スワイプで翌月)', () => {
    render(<CalendarScreen />);
    const gridContainer = screen.getByTestId('month-grid');
    expect(screen.getByRole('heading', { name: '2026年9月' })).toBeInTheDocument();

    // 左スワイプ: startX=100, endX=30 → deltaX = -70 (翌月へ)
    fireEvent.touchStart(gridContainer, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(gridContainer, {
      changedTouches: [{ clientX: 30, clientY: 105 }],
    });

    // 10月が表示される(見出しで判定。月初1日は前後の月のパディングセルとしても
    // 描画されうるため、日付ボタンの有無ではなく見出しテキストで判定する)
    expect(screen.getByRole('heading', { name: '2026年10月' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2026年9月' })).not.toBeInTheDocument();
  });

  it('月グリッドでのスワイプでカーソルが移動する(右スワイプで前月)', () => {
    render(<CalendarScreen />);
    const gridContainer = screen.getByTestId('month-grid');
    expect(screen.getByRole('heading', { name: '2026年9月' })).toBeInTheDocument();

    // 右スワイプ: startX=100, endX=180 → deltaX = +80 (前月へ)
    fireEvent.touchStart(gridContainer, {
      touches: [{ clientX: 100, clientY: 100 }],
    });
    fireEvent.touchEnd(gridContainer, {
      changedTouches: [{ clientX: 180, clientY: 105 }],
    });

    // 8月が表示される(見出しで判定。月初1日は前後の月のパディングセルとしても
    // 描画されうるため、日付ボタンの有無ではなく見出しテキストで判定する)
    expect(screen.getByRole('heading', { name: '2026年8月' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '2026年9月' })).not.toBeInTheDocument();
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

    it('ロック中(unlocked=false)はシークレット予定をディープリンク経由でも開けない(レビュー指摘)', () => {
      evState.events = [{ ...sampleEvent, isSecret: true }];
      render(<CalendarScreen initialEventId="e1" />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('解除中(unlocked=true)ならシークレット予定もディープリンクで開ける', () => {
      secretState = { unlocked: true };
      evState.events = [{ ...sampleEvent, isSecret: true }];
      render(<CalendarScreen initialEventId="e1" />);
      expect(screen.getByRole('dialog', { name: '予定を編集' })).toBeInTheDocument();
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
