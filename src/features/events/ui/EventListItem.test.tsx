import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { EventListItem } from './EventListItem';

it('一覧・日別・ホーム共通ラベルで自作だけを塗る', () => {
  const event = {
    id: 'e',
    title: '会議',
    source: 'local',
    allDay: true,
    eventDate: '2026-09-26',
    labelColor: '#FFCC00',
  } as EventItem;
  const calendar = { name: '仕事', color: '#0072B2' } as Calendar;
  const { container, rerender } = render(
    <EventListItem event={event} calendar={calendar} onEdit={vi.fn()} />,
  );
  expect(screen.getByText('会議')).toHaveStyle({
    backgroundColor: '#FFCC00',
    color: '#111827',
  });
  expect(container.querySelector('[aria-hidden]')).toBeNull();
  rerender(
    <EventListItem
      event={{ ...event, labelColor: null }}
      calendar={calendar}
      onEdit={vi.fn()}
    />,
  );
  expect(screen.getByText('会議')).toHaveStyle({
    backgroundColor: '#0072B2',
    color: '#FFFFFF',
  });
  for (const source of ['google', 'device'] as const) {
    rerender(
      <EventListItem event={{ ...event, source }} calendar={calendar} onEdit={vi.fn()} />,
    );
    expect(screen.getByText('会議').style.backgroundColor).toBe('');
    expect(container.querySelector('[aria-hidden]')).toHaveStyle({
      backgroundColor: '#0072B2',
    });
  }
});

it('有効なスタンプのみなら用途名を読み上げ、未知IDなら件名を表示する', () => {
  const event = {
    id: 'e',
    title: '内部件名',
    source: 'local',
    allDay: true,
    eventDate: '2026-09-26',
    stampId: 'work',
    stampOnly: true,
  } as EventItem;
  const { rerender } = render(
    <EventListItem event={event} calendar={undefined} onEdit={vi.fn()} />,
  );
  expect(screen.queryByText('内部件名')).not.toBeInTheDocument();
  expect(screen.getByRole('img', { name: '仕事' })).toBeInTheDocument();
  rerender(
    <EventListItem
      event={{ ...event, stampId: 'future-id' as never }}
      calendar={undefined}
      onEdit={vi.fn()}
    />,
  );
  expect(screen.getByText('内部件名')).toBeInTheDocument();
});
