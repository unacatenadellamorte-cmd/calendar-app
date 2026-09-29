import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReminderPicker } from './ReminderPicker';

const requestNotificationPermission = vi.fn();
const isNotificationSupported = vi.fn();
vi.mock('@/platform/reminders', () => ({
  requestNotificationPermission: () => requestNotificationPermission(),
  isNotificationSupported: () => isNotificationSupported(),
}));

beforeEach(() => {
  requestNotificationPermission.mockReset();
  requestNotificationPermission.mockResolvedValue('granted');
  isNotificationSupported.mockReset();
  isNotificationSupported.mockReturnValue(true);
});

describe('ReminderPicker', () => {
  it('プリセット(10分/30分/1時間前)を押すと onChange(minutes) を呼ぶ', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '30分前' }));
    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('プリセットを選ぶ前に通知許可を要求する', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  });

  it('許可が無いと警告メッセージを出す(それでも onChange は呼ぶ)', async () => {
    requestNotificationPermission.mockResolvedValue('denied');
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('通知が許可'));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('通知許可の要求が例外を投げても onChange は呼ばれ、拒否を表示する', async () => {
    requestNotificationPermission.mockRejectedValue(new Error('unavailable'));
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(10));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('通知が許可'));
  });

  it('通知許可の応答が保留でも選択状態を先に反映し、許可後に一度だけ保存する', async () => {
    let resolvePermission!: (value: string) => void;
    requestNotificationPermission.mockReturnValue(
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
    );
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '10分前' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    resolvePermission('granted');
    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  });

  it('Web版など通知非対応でも保存し、通知非対応を表示する', async () => {
    isNotificationSupported.mockReturnValue(false);
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    expect(onChange).toHaveBeenCalledWith(10);
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('通知に対応していません');
  });

  it('保存の Promise が例外でも saving を解除してエラーを表示する', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockRejectedValue(new Error('保存失敗'));
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗'));
    expect(screen.getByRole('button', { name: '10分前' })).not.toBeDisabled();
  });

  it('「リマインダーなし」は設定済みのときだけ押せて、押すと onChange(null) を呼ぶ(許可要求はしない)', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={30} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'リマインダーなし' }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('未設定のときは「リマインダーなし」ボタンが無効', () => {
    render(<ReminderPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'リマインダーなし' })).toBeDisabled();
  });

  it('カスタム分数を入力して「設定」を押すと onChange(その値) を呼ぶ', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.type(screen.getByLabelText('カスタム(分)'), '45');
    await user.click(screen.getByRole('button', { name: '設定' }));
    expect(onChange).toHaveBeenCalledWith(45);
  });

  it('カスタム欄が空または負値なら「設定」ボタンは無効', async () => {
    const user = userEvent.setup();
    render(<ReminderPicker value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '設定' })).toBeDisabled();
    await user.type(screen.getByLabelText('カスタム(分)'), '-5');
    expect(screen.getByRole('button', { name: '設定' })).toBeDisabled();
  });

  it('カスタム欄が上限(10080分)を超えるなら「設定」ボタンは無効(サーバ側 CHECK 制約と同じ上限)', async () => {
    const user = userEvent.setup();
    render(<ReminderPicker value={null} onChange={vi.fn()} />);
    await user.type(screen.getByLabelText('カスタム(分)'), '10081');
    expect(screen.getByRole('button', { name: '設定' })).toBeDisabled();
  });

  it('カスタム欄が上限ちょうど(10080分)なら「設定」ボタンは有効', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(true);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.type(screen.getByLabelText('カスタム(分)'), '10080');
    expect(screen.getByRole('button', { name: '設定' })).not.toBeDisabled();
    await user.click(screen.getByRole('button', { name: '設定' }));
    expect(onChange).toHaveBeenCalledWith(10080);
  });

  it('value がプリセット外の値なら、カスタム欄にその値が入り、対応プリセットは選択状態にならない', () => {
    render(<ReminderPicker value={45} onChange={vi.fn()} />);
    expect(screen.getByLabelText('カスタム(分)')).toHaveValue(45);
    expect(screen.getByRole('button', { name: '30分前' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('onChange が false を返すと選択状態をロールバックする', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn().mockResolvedValue(false);
    render(<ReminderPicker value={null} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '10分前' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '10分前' })).toHaveAttribute(
        'aria-pressed',
        'false',
      ),
    );
  });
});
