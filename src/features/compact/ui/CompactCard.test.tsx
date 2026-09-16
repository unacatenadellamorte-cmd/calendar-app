import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { CompactCard } from './CompactCard';

const cal = (over: Partial<Calendar>): Calendar => ({
  id: 'c1',
  name: '仕事',
  color: '#C6413B',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
  ...over,
});

const ev = (over: Partial<EventItem>): EventItem => ({
  id: 'e1',
  calendarId: 'c1',
  title: '役員会議',
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

const calendarById = new Map<string, Calendar>([
  ['high', cal({ id: 'high', name: '仕事' })],
  ['low', cal({ id: 'low', name: '個人' })],
]);

describe('CompactCard', () => {
  it('0件なら「この後の予定はありません」を1行で静かに(感嘆符なし)', () => {
    render(<CompactCard featured={[]} calendarById={calendarById} onSelect={vi.fn()} />);
    const msg = screen.getByText('この後の予定はありません');
    expect(msg).toBeInTheDocument();
    expect(msg.textContent).not.toContain('!');
    expect(msg.textContent).not.toContain('！');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('渡された配列の順(= 優先度順)で行を並べる', () => {
    render(
      <CompactCard
        featured={[
          ev({ id: 'a', title: '高優先の予定', calendarId: 'high' }),
          ev({ id: 'b', title: '低優先の予定', calendarId: 'low' }),
        ]}
        calendarById={calendarById}
        onSelect={vi.fn()}
      />,
    );
    const rowTitles = screen.getAllByRole('button').map((b) => b.textContent);
    expect(rowTitles[0]).toContain('高優先の予定');
    expect(rowTitles[1]).toContain('低優先の予定');
  });

  it('各行にカレンダー名・開始時刻・タイトルがある', () => {
    render(
      <CompactCard
        featured={[ev({ id: 'a', title: '役員会議', calendarId: 'high' })]}
        calendarById={calendarById}
        onSelect={vi.fn()}
      />,
    );
    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('役員会議');
    expect(row).toHaveTextContent('仕事');
    expect(row).toHaveTextContent('10:00'); // 01:00Z = JST 10:00
  });

  it('行をタップすると onSelect(その予定) を呼ぶ', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const target = ev({ id: 'a', title: '役員会議', calendarId: 'high' });
    render(<CompactCard featured={[target]} calendarById={calendarById} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /役員会議/ }));
    expect(onSelect).toHaveBeenCalledWith(target);
  });
});
