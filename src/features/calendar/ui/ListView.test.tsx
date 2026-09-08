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
          ev({ id: 'low-late', title: '低優先の夕方', calendarId: 'low', startsAt: '2026-09-08T09:00:00Z', endsAt: '2026-09-08T10:00:00Z' }),
          ev({ id: 'high-morning', title: '高優先の朝', calendarId: 'high', startsAt: '2026-09-08T00:00:00Z', endsAt: '2026-09-08T01:00:00Z' }),
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
