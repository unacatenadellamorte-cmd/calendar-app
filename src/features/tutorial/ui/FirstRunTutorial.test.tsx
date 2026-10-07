import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FirstRunTutorial } from './FirstRunTutorial';
import { applyLanguage, languages } from '@/i18n';

afterEach(() => applyLanguage('ja'));

describe('初回使い方ガイド', () => {
  it.each(languages.filter(({ code }) => code !== 'ja'))(
    '$name の全5ページと操作文言に日本語の取り残しがない',
    async ({ code }) => {
      applyLanguage(code);
      const { container } = render(<FirstRunTutorial onFinish={vi.fn()} />);
      const user = userEvent.setup();
      for (let page = 0; page < 5; page++) {
        expect(container.textContent).not.toMatch(/[ぁ-んァ-ヶ]/);
        if (page < 4) await user.click(container.querySelector('footer button:last-child')!);
      }
    },
  );
  it('5ページを進み、戻ることもでき、最後でだけ完了する', async () => {
    const onFinish = vi.fn();
    const user = userEvent.setup();
    render(<FirstRunTutorial onFinish={onFinish} />);
    expect(screen.getByRole('button', { name: '前へ' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: '予定をカレンダーに登録' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByRole('heading', { name: 'シフトはひな形でかんたんに' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: '前へ' }));
    expect(screen.getByRole('status')).toHaveTextContent('使い方 1/5');
    for (let i = 0; i < 4; i++) await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(screen.getByRole('status')).toHaveTextContent('使い方 5/5');
    expect(screen.getByText(/接続・購入だけでは反映は始まりません/)).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '使いはじめる' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it('途中でもスキップできる', async () => {
    const onFinish = vi.fn();
    render(<FirstRunTutorial onFinish={onFinish} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'スキップ' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
  it('プロフィールとアカウント登録を混同させない', async () => {
    render(<FirstRunTutorial onFinish={vi.fn()} />);
    const user = userEvent.setup();
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '次へ' }));
    expect(
      screen.getByText(/Googleカレンダーを接続するには、アプリのアカウント登録/),
    ).toBeInTheDocument();
    expect(screen.getByText(/プロフィールの名前は、アカウント登録とは別/)).toBeInTheDocument();
  });
});
