import { beforeEach, describe, expect, it } from 'vitest';
import { buildWidgetAppearance } from './widgetAppearance';

describe('buildWidgetAppearance', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('style');
  });

  it.each([
    ['sakura', '#fff8fa', '#a52c62'],
    ['leaf', '#f7fcf6', '#326c36'],
    ['ocean', '#f5fbff', '#086d9e'],
    ['lavender', '#fbf8ff', '#7042a8'],
  ] as const)('%s paletteをそのまま共有する', (theme, backgroundColor, accentColor) => {
    expect(buildWidgetAppearance(theme)).toMatchObject({ theme, backgroundColor, accentColor });
  });

  it('lightはCSSの現在値を使い、古いCSS色を再利用しない', () => {
    localStorage.setItem('calendar-app.theme', 'light');
    document.documentElement.style.setProperty('--color-surface-base', '#112233');
    document.documentElement.style.setProperty('--color-accent', '#445566');
    expect(buildWidgetAppearance()).toMatchObject({ backgroundColor: '#112233', accentColor: '#445566' });
  });

  it('darkはdark用CSS色を使う', () => {
    localStorage.setItem('calendar-app.theme', 'dark');
    document.documentElement.style.setProperty('--color-surface-base', '#16181c');
    document.documentElement.style.setProperty('--color-accent', '#6aa0ff');
    expect(buildWidgetAppearance()).toMatchObject({ theme: 'dark', backgroundColor: '#16181c', accentColor: '#6aa0ff' });
  });

  it('systemは現在のCSS色を使い、fontサイズ3段階を倍率へ変換する', () => {
    localStorage.setItem('calendar-app.theme', 'system');
    localStorage.setItem('calendar-app.month-event-size', 'large');
    document.documentElement.style.setProperty('--color-surface-base', '#abcdef');
    expect(buildWidgetAppearance()).toMatchObject({ theme: 'system', backgroundColor: '#abcdef', appFontScale: 1.2 });
  });

  it('不正なfontサイズはsmallの安全既定値になる', () => {
    localStorage.setItem('calendar-app.month-event-size', 'broken');
    expect(buildWidgetAppearance().appFontScale).toBe(0.8);
  });
});
