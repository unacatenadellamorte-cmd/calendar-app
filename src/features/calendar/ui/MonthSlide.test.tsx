import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonthSlide } from './MonthSlide';

const page = (month: string, offset = 0) => (
  <MonthSlide monthKey={month} offset={offset} dragging={offset !== 0}>
    <button data-testid="date-button" onClick={vi.fn()}>
      {month}
    </button>
  </MonthSlide>
);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe('月の横スライド', () => {
  it('次のドラッグ開始時に前のアニメーションを止め指の移動を優先する', () => {
    const { rerender, container } = render(page('2026-09'));
    rerender(page('2026-10'));
    expect(container.querySelector('.month-page-enter')).not.toBeNull();
    rerender(page('2026-10', -30));
    expect(container.querySelector('.month-page-enter')).toBeNull();
    expect(container.querySelector('.month-page-exit')).toBeNull();
    expect(
      (screen.getByTestId('month-slide').firstElementChild as HTMLElement).style.transform,
    ).toBe('translateX(-30px)');
  });
  it('公開範囲が変わったら退出中の古い予定も直ちに消す', () => {
    const renderPage = (month: string, version: number, text: string) => (
      <MonthSlide monthKey={month} offset={0} dragging={false} contentVersion={version}>
        <button>{text}</button>
      </MonthSlide>
    );
    const { rerender, container } = render(renderPage('2026-09', 1, '秘密の予定'));
    rerender(renderPage('2026-10', 1, '翌月'));
    expect(container.textContent).toContain('秘密の予定');
    rerender(renderPage('2026-10', 2, '翌月'));
    expect(container.textContent).not.toContain('秘密の予定');
    expect(container.querySelector('.month-page-exit')).toBeNull();
  });
  it('退出月を操作対象から除外し、日付キーは重複させず終了後に削除する', () => {
    vi.useFakeTimers();
    const { rerender, container } = render(page('2026-09'));
    rerender(page('2026-10'));
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button')).toHaveTextContent('2026-10');
    expect(screen.getAllByTestId('date-button')).toHaveLength(1);
    expect(container.querySelector('.month-page-exit')).toHaveAttribute('inert');
    expect(container.querySelector('.month-page-exit')).toHaveTextContent('2026-09');
    act(() => vi.advanceTimersByTime(300));
    expect(container.querySelector('.month-page-exit')).toBeNull();
  });
  it('同じ月の更新はアニメーションせず、年境界も方向を保つ', () => {
    const { rerender, container } = render(page('2026-12'));
    rerender(page('2026-12', -70));
    expect(container.querySelector('.month-page-exit')).toBeNull();
    rerender(page('2027-01'));
    expect(container.querySelector('.month-page-enter')?.getAttribute('style')).toContain(
      '100% + -70px',
    );
    rerender(page('2026-12'));
    expect(container.querySelectorAll('.month-page-exit')).toHaveLength(1);
    expect(container.querySelector('.month-page-enter')?.getAttribute('style')).toContain(
      '-100%',
    );
  });
  it('動きを減らす設定では退出コピーもアニメーションも作らない', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    const { rerender, container } = render(page('2026-09'));
    rerender(page('2026-10'));
    expect(container.querySelector('.month-page-enter')).toBeNull();
    expect(container.querySelector('.month-page-exit')).toBeNull();
    expect(screen.getByRole('button')).toHaveTextContent('2026-10');
  });
});
