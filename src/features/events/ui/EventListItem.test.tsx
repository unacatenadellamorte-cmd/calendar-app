import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { EventListItem } from './EventListItem';

it('一覧・日別・ホーム共通ラベルで自作だけを塗る', () => {
  const event = { id: 'e', title: '会議', source: 'local', allDay: true, eventDate: '2026-09-26', labelColor: '#FFCC00' } as EventItem;
  const calendar = { name: '仕事', color: '#0072B2' } as Calendar;
  const { container, rerender } = render(<EventListItem event={event} calendar={calendar} onEdit={vi.fn()} />);
  expect(screen.getByText('会議')).toHaveStyle({ backgroundColor: '#FFCC00', color: '#111827' });
  expect(container.querySelector('[aria-hidden]')).toBeNull();
  rerender(<EventListItem event={{ ...event, labelColor: null }} calendar={calendar} onEdit={vi.fn()} />);
  expect(screen.getByText('会議')).toHaveStyle({ backgroundColor: '#0072B2', color: '#FFFFFF' });
  for (const source of ['google', 'device'] as const) {
    rerender(<EventListItem event={{ ...event, source }} calendar={calendar} onEdit={vi.fn()} />);
    expect(screen.getByText('会議').style.backgroundColor).toBe('');
    expect(container.querySelector('[aria-hidden]')).toHaveStyle({ backgroundColor: '#0072B2' });
  }
});
