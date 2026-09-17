import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * I/O & Edge-Case Matrix(spec-5-1)の4パターンを検証する:
 * event/{有効なID}, event/{未知のID}(→ ここでは形式変換のみの責務なので対象外),
 * day/{date}, 未知のスキーム/形式。
 */
const navigateMock = vi.fn();
vi.mock('react-router-dom', () => ({ useNavigate: () => navigateMock }));

let capturedHandler: ((url: string) => void) | undefined;
const unsubscribeMock = vi.fn();
vi.mock('@/platform/deepLink', () => ({
  onDeepLink: (handler: (url: string) => void) => {
    capturedHandler = handler;
    return unsubscribeMock;
  },
}));

const { DeepLinkListener } = await import('./DeepLinkListener');

beforeEach(() => {
  navigateMock.mockClear();
  unsubscribeMock.mockClear();
  capturedHandler = undefined;
});

afterEach(() => {
  // event ケースが setTimeout を使うため、後始末を忘れると次のテストへ実タイマーが漏れる。
  vi.useRealTimers();
});

describe('DeepLinkListener', () => {
  it('create リンクは実在する日付だけを /calendar?create= へ変換する', () => {
    render(<DeepLinkListener />);
    capturedHandler?.('calendar-app://create/2026-02-28');
    expect(navigateMock).toHaveBeenCalledWith('/calendar?create=2026-02-28');
    navigateMock.mockClear();
    capturedHandler?.('calendar-app://create/2026-02-29');
    capturedHandler?.('calendar-app://create/2026-13-01');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('calendar-app://event/{id} を /calendar?event={id} へ変換して navigate し、直後に ?event= をクエリから取り除く', () => {
    vi.useFakeTimers();
    render(<DeepLinkListener />);
    capturedHandler?.('calendar-app://event/abc-123');
    expect(navigateMock).toHaveBeenNthCalledWith(1, '/calendar?event=abc-123');
    // ?event= が URL に残ったままだと手動リロードで同じシートが再度開くため、
    // 次の macrotask で /calendar へ replace してクエリを取り除く。
    expect(navigateMock).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(navigateMock).toHaveBeenNthCalledWith(2, '/calendar', { replace: true });
  });

  it('calendar-app://day/{date} を /calendar?date={date} へ変換して navigate する', () => {
    render(<DeepLinkListener />);
    capturedHandler?.('calendar-app://day/2026-09-20');
    expect(navigateMock).toHaveBeenCalledWith('/calendar?date=2026-09-20');
  });

  it('ホスト部の大文字小文字ゆれ(calendar-app://Event/x)を無視する', () => {
    vi.useFakeTimers();
    render(<DeepLinkListener />);
    capturedHandler?.('calendar-app://Event/abc-123');
    expect(navigateMock).toHaveBeenNthCalledWith(1, '/calendar?event=abc-123');
    vi.runAllTimers();
  });

  it('未知のホスト部(calendar-app://unknown/xyz)は navigate しない', () => {
    render(<DeepLinkListener />);
    capturedHandler?.('calendar-app://unknown/xyz');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('calendar-app 以外のスキームは navigate しない(クラッシュしない)', () => {
    render(<DeepLinkListener />);
    expect(() => capturedHandler?.('https://example.com/event/abc')).not.toThrow();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('URL としてパース不能な値は navigate しない(クラッシュしない)', () => {
    render(<DeepLinkListener />);
    expect(() => capturedHandler?.('not a url')).not.toThrow();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('アンマウント時に購読を解除する', () => {
    const { unmount } = render(<DeepLinkListener />);
    unmount();
    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
  });
});
