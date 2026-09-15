import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OnboardingScreen } from './OnboardingScreen';

/**
 * `create`/`errorKey` は `AppShell` の唯一の `useProfile()` インスタンスから props で渡る
 * (レビュー指摘で、画面ごとに別インスタンスの `useProfile` を呼ぶのをやめたため、
 * このテストはフックをモックせず、渡された props だけで完結する)。
 */

const create = vi.fn();

beforeEach(() => {
  create.mockReset();
});

describe('OnboardingScreen', () => {
  it('見出しと名前入力フォームを表示する', () => {
    render(<OnboardingScreen create={create} errorKey={null} />);
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
    expect(screen.getByLabelText('名前')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'はじめる' })).toBeDisabled();
  });

  it('名前を入力して送信すると create を呼ぶ', async () => {
    create.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<OnboardingScreen create={create} errorKey={null} />);
    await user.type(screen.getByLabelText('名前'), '花子');
    await user.click(screen.getByRole('button', { name: 'はじめる' }));
    expect(create).toHaveBeenCalledWith({ displayName: '花子', avatarDataUrl: null });
  });

  it('errorKey があればエラーを表示する', () => {
    render(<OnboardingScreen create={create} errorKey="profile/invalid-name" />);
    expect(screen.getByRole('alert')).toHaveTextContent('名前を入力してください');
  });
});
