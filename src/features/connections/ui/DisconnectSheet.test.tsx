import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DisconnectSheet } from './DisconnectSheet';

/**
 * `title` は呼び出し側が渡す(既定文言をハードコードしない、Story 5.3)。
 * 件数プレビュー・確定/やめる/エラー表示の基本動作を検証する。
 */
describe('DisconnectSheet', () => {
  it('渡された title をダイアログの見出しにする(呼び出し側ごとに変わる)', () => {
    render(
      <DisconnectSheet
        open
        title="端末カレンダー接続を解除"
        impact={null}
        busy={false}
        errorKey={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: '端末カレンダー接続を解除' })).toBeInTheDocument();
  });

  it('open=false なら何も描画しない', () => {
    render(
      <DisconnectSheet
        open={false}
        title="x"
        impact={null}
        busy={false}
        errorKey={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('impact が無ければ件数は「—」、あれば件数を出す', () => {
    const { rerender } = render(
      <DisconnectSheet
        open
        title="x"
        impact={null}
        busy={false}
        errorKey={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('予定 —・カレンダー —');

    rerender(
      <DisconnectSheet
        open
        title="x"
        impact={{ events: 3, calendars: 1 }}
        busy={false}
        errorKey={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveTextContent('予定 3 件・カレンダー 1 件');
  });

  it('「接続を解除」で onConfirm、「やめる」で onClose を呼ぶ', async () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <DisconnectSheet
        open
        title="x"
        impact={null}
        busy={false}
        errorKey={null}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole('button', { name: '接続を解除' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'やめる' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('busy=true の間はボタンを無効化し、「解除中…」を表示する', () => {
    render(
      <DisconnectSheet
        open
        title="x"
        impact={null}
        busy={true}
        errorKey={null}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: '解除中…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'やめる' })).toBeDisabled();
  });

  it('errorKey があれば文言解決した alert を出す', () => {
    render(
      <DisconnectSheet
        open
        title="x"
        impact={null}
        busy={false}
        errorKey="connection/disconnect-failed"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('接続の解除に失敗しました。もう一度お試しください');
  });
});
