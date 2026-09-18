import { describe, expect, it, vi } from 'vitest';
import { act, render, waitFor } from '@testing-library/react';
import type { EventItem } from '@/data/events';
import type { Calendar } from '@/data/calendars';
import { EventChip } from './EventChip';

const event: EventItem = {
  id: 'event-1',
  calendarId: 'calendar-1',
  title: 'とても長い予定の件名',
  allDay: true,
  startsAt: null,
  endsAt: null,
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
const calendar: Calendar = {
  id: 'calendar-1',
  name: '仕事',
  color: '#2563eb',
  source: 'local',
  isShift: false,
  isVisible: true,
  priority: 0,
  createdAt: '',
  updatedAt: '',
};

describe('EventChip（月表示の件名計測）', () => {
  it('件名が実幅を超えたときだけmarqueeになり、ResizeObserverを解除する', async () => {
    let observe: (() => void) | undefined;
    const disconnectSpy = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observe = callback;
        }
        observe() {}
        disconnect() {
          disconnectSpy();
        }
      },
    );
    const { container, unmount } = render(
      <EventChip event={event} calendar={calendar} onTap={vi.fn()} month showTime={false} />,
    );
    const viewport = container.querySelector('.month-event-title') as HTMLElement;
    const text = viewport.firstElementChild as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 40 });
    Object.defineProperty(text, 'scrollWidth', { configurable: true, value: 96 });
    act(() => observe?.());
    await waitFor(() => expect(viewport).toHaveClass('is-marquee'));
    expect(viewport.style.getPropertyValue('--month-marquee-distance')).toBe('56px');
    unmount();
    expect(disconnectSpy).toHaveBeenCalledOnce();
    vi.unstubAllGlobals();
  });

  it('件名が収まる幅ではmarqueeを付けない', async () => {
    let observe: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          observe = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    const { container } = render(
      <EventChip event={event} calendar={calendar} onTap={vi.fn()} month showTime={false} />,
    );
    const viewport = container.querySelector('.month-event-title') as HTMLElement;
    const text = viewport.firstElementChild as HTMLElement;
    Object.defineProperty(viewport, 'clientWidth', { configurable: true, value: 100 });
    Object.defineProperty(text, 'scrollWidth', { configurable: true, value: 96 });
    act(() => observe?.());
    await waitFor(() => expect(viewport).not.toHaveClass('is-marquee'));
    vi.unstubAllGlobals();
  });
});
