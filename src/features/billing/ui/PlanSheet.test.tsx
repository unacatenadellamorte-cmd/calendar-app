import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlanSheet } from './PlanSheet';
import { PLANS } from '../model/plans';

// PlanSheet は usePurchase / useEntitlements 経由で認証状態を読む。この既存テストは
// Web(課金SDK無効)・未ログイン相当で、従来どおり「準備中」の表示を確かめる。
vi.mock('@/app/auth-context', () => ({ useAuth: () => ({ state: 'guest', session: null }) }));

describe('PlanSheet', () => {
  it('プラン2枚に機能説明と仮の価格を出し、購入ボタンは「準備中」で押せない', () => {
    render(<PlanSheet open reason="first-connect" onClose={vi.fn()} onContinueFree={vi.fn()} />);
    const sheet = screen.getByRole('dialog', { name: 'プランを選ぶ' });

    const write = within(sheet).getByRole('listitem', { name: '予定反映' });
    expect(within(write).getByText('¥300 / 月(仮の表示)')).toBeInTheDocument();
    expect(within(write).getByText(/選んだ Google カレンダーへ反映します/)).toBeInTheDocument();
    const writeBuy = within(write).getByRole('button', { name: '予定反映(準備中)' });
    expect(writeBuy).toBeDisabled();
    expect(writeBuy).toHaveTextContent('準備中');

    const multi = within(sheet).getByRole('listitem', { name: '複数アカウント' });
    expect(within(multi).getByText('¥1,000 / 月(仮の表示)')).toBeInTheDocument();
    expect(within(multi).getByText('予定反映も含みます。')).toBeInTheDocument();
    expect(within(multi).getByRole('button', { name: '複数アカウント(準備中)' })).toBeDisabled();

    // 自動更新の表示
    expect(
      within(sheet).getByText(
        '定期購入は自動で更新されます。価格・期間・解約方法は各ストアの設定に従います。',
      ),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText('有料プランは準備中のため、現在は購入できません。'),
    ).toBeInTheDocument();
  });

  it('価格は plans.ts の仮表示であることを型で区別している', () => {
    expect(PLANS.map((p) => [p.id, p.price.kind])).toEqual([
      ['calendar_write', 'placeholder'],
      ['multi_account', 'placeholder'],
    ]);
  });

  it('初回接続: 「無料で1つ接続する」を出し、押すと onContinueFree', async () => {
    const onContinueFree = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <PlanSheet open reason="first-connect" onClose={onClose} onContinueFree={onContinueFree} />,
    );
    expect(
      screen.getByText('無料プランでは Google アカウント1つのカレンダーを読み取り専用で取り込めます。'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '無料で1つ接続する' }));
    expect(onContinueFree).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('アカウント追加: 無料で続けるボタンは無く、「今はしない」で閉じる', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<PlanSheet open reason="add-account" onClose={onClose} />);
    expect(
      screen.getByText('2つ目以降の Google アカウントを接続するには「複数アカウント」プランが必要です。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '無料で1つ接続する' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '今はしない' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('閉じているときは何も出さない', () => {
    render(<PlanSheet open={false} reason="add-account" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
