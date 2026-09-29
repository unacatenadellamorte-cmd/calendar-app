import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { ListView } from './ListView';

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

function setup(events: EventItem[]) {
  const onEventTap = vi.fn();
  render(
    <ListView
      events={events}
      calendarById={calendarById}
      today="2026-09-08"
      scrollTo="2026-09-08"
      onEventTap={onEventTap}
    />,
  );
  return { onEventTap };
}

describe('ListView', () => {
  it('未来の予定がない場合も最古ではなく最も新しい日へスクロールする', () => {
    const original = HTMLElement.prototype.scrollTo;
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    const scrolled: { target: HTMLElement; top: number }[] = [];
    HTMLElement.prototype.scrollTo = function (options) {
      scrolled.push({ target: this, top: typeof options === 'number' ? options : options?.top ?? 0 });
    };
    HTMLElement.prototype.getBoundingClientRect = function () {
      return {
        top:
          this.getAttribute('data-testid') === 'list-scroll-region'
            ? 100
            : this.textContent?.includes('9月7日')
              ? 250
              : 500,
        bottom: 0, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0,
        toJSON: () => ({}),
      };
    };
    try {
      setup([
        ev({ id: 'old', allDay: true, eventDate: '2026-07-15', startsAt: null, endsAt: null }),
        ev({
          id: 'recent',
          allDay: true,
          eventDate: '2026-09-07',
          startsAt: null,
          endsAt: null,
        }),
      ]);
      const region = screen.getByTestId('list-scroll-region');
      expect(scrolled).toHaveLength(1);
      expect(scrolled[0]?.target).toBe(region);
      expect(scrolled[0]?.top).toBe(150);
    } finally {
      HTMLElement.prototype.scrollTo = original;
      HTMLElement.prototype.getBoundingClientRect = originalRect;
    }
  });

  it('予定を日ごとの見出しでグルーピングする', () => {
    setup([
      ev({ id: 'a', title: '会議アルファ' }),
      ev({
        id: 'b',
        title: '会議ベータ',
        startsAt: '2026-09-09T01:00:00Z',
        endsAt: '2026-09-09T02:00:00Z',
      }),
    ]);
    expect(screen.getByText('9月8日(火)')).toBeInTheDocument();
    expect(screen.getByText('9月9日(水)')).toBeInTheDocument();
    expect(screen.getByText('会議アルファ')).toBeInTheDocument();
    expect(screen.getByText('会議ベータ')).toBeInTheDocument();
  });

  it('0件なら「予定はありません」', () => {
    setup([]);
    expect(screen.getByText('予定はありません')).toBeInTheDocument();
  });

  it('行をタップすると onEventTap(その予定) を呼ぶ', async () => {
    const user = userEvent.setup();
    const target = ev({ id: 'a', title: '会議アルファ' });
    const { onEventTap } = setup([target]);
    await user.click(screen.getByRole('button', { name: /会議アルファ/ }));
    expect(onEventTap).toHaveBeenCalledWith(target);
  });

  it('同じ日の中で所属カレンダーの優先度順に並ぶ(同順は開始時刻順)', () => {
    render(
      <ListView
        events={[
          ev({
            id: 'low-late',
            title: '低優先の夕方',
            calendarId: 'low',
            startsAt: '2026-09-08T09:00:00Z',
            endsAt: '2026-09-08T10:00:00Z',
          }),
          ev({
            id: 'high-morning',
            title: '高優先の朝',
            calendarId: 'high',
            startsAt: '2026-09-08T00:00:00Z',
            endsAt: '2026-09-08T01:00:00Z',
          }),
        ]}
        calendarById={
          new Map<string, Calendar>([
            ['high', { ...calendar, id: 'high', name: '高', priority: 0 }],
            ['low', { ...calendar, id: 'low', name: '低', priority: 1 }],
          ])
        }
        today="2026-09-08"
        scrollTo="2026-09-08"
        onEventTap={vi.fn()}
      />,
    );
    const titles = screen.getAllByText(/優先の/).map((el) => el.textContent);
    expect(titles).toEqual(['高優先の朝', '低優先の夕方']);
  });
});
