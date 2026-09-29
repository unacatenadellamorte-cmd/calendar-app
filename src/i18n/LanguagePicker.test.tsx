import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingScreen } from '@/features/profile/ui/OnboardingScreen';
import { applyLanguage, getLanguage } from './index';
import { LanguagePicker } from './LanguagePicker';

afterEach(() => {
  vi.restoreAllMocks();
  applyLanguage('ja');
});

describe('プロフィールの言語選択', () => {
  it('初回画面で6言語を選べて、入力済みの名前を保持したまま即時反映する', () => {
    render(<OnboardingScreen create={vi.fn()} errorKey={null} />);
    fireEvent.change(screen.getByLabelText('名前'), { target: { value: 'Ryo花子' } });
    const select = screen.getByRole('combobox', { name: 'Language' });
    expect(screen.getAllByRole('option')).toHaveLength(6);
    fireEvent.change(select, { target: { value: 'en' } });
    expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Ryo花子');
    expect(getLanguage()).toBe('en');
    expect(localStorage.getItem('calendar-app.language')).toBe('en');
    fireEvent.change(select, { target: { value: 'ja' } });
    expect(screen.getByRole('heading', { name: 'ようこそ' })).toBeInTheDocument();
  });
  it('保存できないときはエラーを表示し、前の選択を保持する', () => {
    render(<LanguagePicker />);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('容量不足');
    });
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'es' } });
    expect(screen.getByRole('alert')).toHaveTextContent('言語を保存できません');
    expect(screen.getByRole('combobox')).toHaveValue('ja');
  });
});
