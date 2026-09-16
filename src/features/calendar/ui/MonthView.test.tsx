import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { groupEventsByDay, makePriorityOf } from '@/lib/calendar-view';
import { MonthView } from './MonthView';

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
const calendarById = new Map([['c1', calendar]]);

const ev = (over: Partial<EventItem> = {}): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '会議',
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
  ...over,
});

function toByDay(events: EventItem[], byCalendar = calendarById) {
  return groupEventsByDay(events, makePriorityOf(byCalendar));
}

function setup(events: EventItem[] = [], overProps: Partial<Parameters<typeof MonthView>[0]> = {}) {
  const onDayTap = vi.fn();
  const onDayDoubleTap = vi.fn();
  const onEventTap = vi.fn();
  const onOverflowTap = vi.fn();
  const onBackToMonth = vi.fn();
  const onSwipeLeft = vi.fn();
  const onSwipeRight = vi.fn();
  const utils = render(
    <MonthView
      cursor="2026-09-08"
      byDay={toByDay(events)}
      calendarById={calendarById}
      today="2026-09-08"
      onDayTap={onDayTap}
      onDayDoubleTap={onDayDoubleTap}
      onEventTap={onEventTap}
      onOverflowTap={onOverflowTap}
      onBackToMonth={onBackToMonth}
      onSwipeLeft={onSwipeLeft}
      onSwipeRight={onSwipeRight}
      {...overProps}
    />,
  );
  return { onDayTap, onDayDoubleTap, onEventTap, onOverflowTap, onBackToMonth, onSwipeLeft, onSwipeRight, container: utils.container };
}

describe('MonthView', () => {
  it('曜日ヘッダと日セルを描画する', () => {
    setup();
    for (const w of ['日', '月', '火', '水', '木', '金', '土']) {
      expect(screen.getByText(w)).toBeInTheDocument();
    }
    expect(
      screen.getByRole('button', { name: '9月15日を開く' }),
    ).toBeInTheDocument();
  });

  it('日セルの日付番号をタップすると onDayTap(その日) を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onDayTap } = setup();
    await user.click(screen.getByRole('button', { name: '9月15日を開く' }));
    expect(onDayTap).toHaveBeenCalledWith('2026-09-15');
  });

  it('チップをタップすると onEventTap(その予定) を呼ぶ', async () => {
    const user = userEvent.setup();
    const target = ev({ id: 'x', title: '役員会議' });
    const { onEventTap, onDayTap } = setup([target]);
    await user.click(screen.getByRole('button', { name: /役員会議/ }));
    expect(onEventTap).toHaveBeenCalledWith(target);
    expect(onDayTap).not.toHaveBeenCalled();
  });

  it('表示中の月グリッド外の予定は描画しない', () => {
    setup([
      ev({
        id: 'next-month',
        title: '来月の予定',
        startsAt: '2026-10-15T01:00:00Z',
        endsAt: '2026-10-15T02:00:00Z',
      }),
    ]);
    expect(screen.queryByRole('button', { name: /来月の予定/ })).not.toBeInTheDocument();
  });

  it('同日4件は3件 +「他 1 件」、タップで onOverflowTap を呼ぶ', async () => {
    const user = userEvent.setup();
    const sameDay = [0, 1, 2, 3].map((i) =>
      ev({
        id: `s${i}`,
        title: `予定${i}`,
        startsAt: `2026-09-08T0${i}:00:00Z`,
        endsAt: `2026-09-08T0${i + 1}:00:00Z`,
      }),
    );
    const { onOverflowTap } = setup(sameDay);
    expect(screen.queryByRole('button', { name: /予定3/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '他 1 件' }));
    expect(onOverflowTap).toHaveBeenCalledWith('2026-09-08');
  });

  it('セルに入りきらない時は優先度の高いカレンダーの予定から見せる', () => {
    // 高優先度(priority 0)の遅い予定2件が、低優先度(priority 1)の早い予定より先に出る。
    const twoCals = new Map<string, Calendar>([
      ['c1', calendar],
      ['c2', { ...calendar, id: 'c2', name: '低優先', priority: 1 }],
    ]);
    const events = [
      ev({ id: 'lo0', title: '低0', calendarId: 'c2', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-08T01:00:00Z' }),
      ev({ id: 'lo1', title: '低1', calendarId: 'c2', startsAt: '2026-09-08T01:00:00Z', endsAt: '2026-09-08T02:00:00Z' }),
      ev({ id: 'hi0', title: '高0', calendarId: 'c1', startsAt: '2026-09-08T05:00:00Z', endsAt: '2026-09-08T06:00:00Z' }),
      ev({ id: 'hi1', title: '高1', calendarId: 'c1', startsAt: '2026-09-08T06:00:00Z', endsAt: '2026-09-08T07:00:00Z' }),
    ];
    render(
      <MonthView
        cursor="2026-09-08"
        byDay={toByDay(events, twoCals)}
        calendarById={twoCals}
        today="2026-09-08"
        onDayTap={vi.fn()}
        onDayDoubleTap={vi.fn()}
        onEventTap={vi.fn()}
        onOverflowTap={vi.fn()}
        onBackToMonth={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /高0/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /高1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /低0/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /低1/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '他 1 件' })).toBeInTheDocument();
  });

  it('日セルの日付番号をダブルタップすると onDayDoubleTap(その日) を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onDayDoubleTap } = setup();
    await user.dblClick(screen.getByRole('button', { name: '9月15日を開く' }));
    expect(onDayDoubleTap).toHaveBeenCalledWith('2026-09-15');
  });

  it('日付番号ボタンは touch-manipulation で、iOS等のダブルタップズームと衝突しない', () => {
    setup();
    expect(screen.getByRole('button', { name: '9月15日を開く' })).toHaveClass(
      'touch-manipulation',
    );
  });

  describe('collapsedToWeekOf(折りたたみ、Option C)', () => {
    it('指定が無ければフルの月グリッドを描画し、「月表示に戻る」は出さない', () => {
      setup();
      // 9月のフル月グリッドには 9/1 と 9/15 の両方が同時に存在する。
      expect(screen.getByRole('button', { name: '9月1日を開く' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '9月15日を開く' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
    });

    it('指定した日を含む週の1行(7セル)だけに折りたたむ', () => {
      setup([], { collapsedToWeekOf: '2026-09-15' });
      // 9/15(火)を含む週は 9/13(日)〜9/19(土)。同じ月グリッドにしか無い 9/1 は消える。
      expect(screen.getByRole('button', { name: '9月15日を開く' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '9月13日を開く' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '9月19日を開く' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '9月1日を開く' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '月表示に戻る' })).toBeInTheDocument();
    });

    it('「月表示に戻る」を押すと onBackToMonth を呼ぶ', async () => {
      const user = userEvent.setup();
      const { onBackToMonth } = setup([], { collapsedToWeekOf: '2026-09-15' });
      await user.click(screen.getByRole('button', { name: '月表示に戻る' }));
      expect(onBackToMonth).toHaveBeenCalled();
    });

    it('折りたたみ対象日が現在の月グリッドに無ければフル表示へフォールバックする', () => {
      // cursor は9月固定のテストなので、12月の日付は9月グリッドに存在しない。
      setup([], { collapsedToWeekOf: '2026-12-25' });
      expect(screen.getByRole('button', { name: '9月1日を開く' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '9月15日を開く' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '月表示に戻る' })).not.toBeInTheDocument();
    });
  });

  describe('スワイプ検出', () => {
    it('左スワイプ(横移動が50px以上、縦より大きい)で onSwipeLeft を呼ぶ', () => {
      const { onSwipeLeft, onSwipeRight } = setup();
      const gridContainer = screen.getByTestId('month-grid');

      // 左スワイプ: startX=100, endX=30 → deltaX = -70
      fireEvent.touchStart(gridContainer, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(gridContainer, {
        changedTouches: [{ clientX: 30, clientY: 105 }],
      });

      expect(onSwipeLeft).toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('右スワイプ(横移動が50px以上、縦より大きい)で onSwipeRight を呼ぶ', () => {
      const { onSwipeLeft, onSwipeRight } = setup();
      const gridContainer = screen.getByTestId('month-grid');

      // 右スワイプ: startX=100, endX=180 → deltaX = +80
      fireEvent.touchStart(gridContainer, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(gridContainer, {
        changedTouches: [{ clientX: 180, clientY: 105 }],
      });

      expect(onSwipeRight).toHaveBeenCalled();
      expect(onSwipeLeft).not.toHaveBeenCalled();
    });

    it('縦方向が大きい場合(スクロール操作)は月送りしない', () => {
      const { onSwipeLeft, onSwipeRight } = setup();
      const gridContainer = screen.getByTestId('month-grid');

      // 縦スクロール: deltaX = 30, deltaY = 100 → 縦が大きいため月送りなし
      fireEvent.touchStart(gridContainer, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(gridContainer, {
        changedTouches: [{ clientX: 130, clientY: 200 }],
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });

    it('横移動が50px未満の場合は月送りしない', () => {
      const { onSwipeLeft, onSwipeRight } = setup();
      const gridContainer = screen.getByTestId('month-grid');

      // 小さい移動: deltaX = 30 (50未満)
      fireEvent.touchStart(gridContainer, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      fireEvent.touchEnd(gridContainer, {
        changedTouches: [{ clientX: 130, clientY: 105 }],
      });

      expect(onSwipeLeft).not.toHaveBeenCalled();
      expect(onSwipeRight).not.toHaveBeenCalled();
    });
  });
});
