import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const deepLinkMocks = vi.hoisted(() => ({
  handler: undefined as ((url: string) => void) | undefined,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('@/platform/deepLink', () => ({
  onDeepLink: (handler: (url: string) => void) => {
    deepLinkMocks.handler = handler;
    deepLinkMocks.subscribe();
    return deepLinkMocks.unsubscribe;
  },
}));

const { DeepLinkListener } = await import('./DeepLinkListener');

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{`${location.pathname}${location.search}`}</output>;
}

beforeEach(() => {
  deepLinkMocks.handler = undefined;
  deepLinkMocks.subscribe.mockClear();
  deepLinkMocks.unsubscribe.mockClear();
});

describe('DeepLinkListener の購読固定', () => {
  it('MemoryRouter の遷移で navigate identity が変わっても起動URLを再購読しない', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="*"
            element={
              <>
                <DeepLinkListener />
                <LocationProbe />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(deepLinkMocks.subscribe).toHaveBeenCalledTimes(1);
    act(() => {
      deepLinkMocks.handler?.('calendar-app://event/abc-123');
    });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/calendar?event=abc-123');
    });
    expect(deepLinkMocks.subscribe).toHaveBeenCalledTimes(1);
    expect(deepLinkMocks.unsubscribe).not.toHaveBeenCalled();
  });
});
