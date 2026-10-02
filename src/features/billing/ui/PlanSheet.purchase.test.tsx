import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { PlanSheet } from './PlanSheet';
import { PlanSection } from './PlanSection';
import { ok, err, appError } from '@/data/result';

/**
 * 課金SDK有効(ネイティブ + 公開キー)の PlanSheet / PlanSection。
 * `@/data/purchases`(プラグインの薄いラッパ)と entitlements の取得をモックする。
 * 権利の判定は実装(useEntitlements / DB 再取得)をそのまま使う。
 */

const snapshot = { userId: 'u1' as string | null };
const purchases = {
  purchasesSupported: vi.fn(() => true),
  subscribePurchases: vi.fn((_listener: () => void) => () => undefined),
  getPurchasesSnapshot: vi.fn(() => snapshot),
  getPlanPrices: vi.fn(),
  purchasePlan: vi.fn(),
  restorePurchases: vi.fn(),
  getManagementUrl: vi.fn(),
};
const listMyEntitlements = vi.fn();
const openExternalUrl = vi.fn();
let authState: { state: string; session: { user: { id: string } } | null } = {
  state: 'authenticated',
  session: { user: { id: 'u1' } },
};

vi.mock('@/data/purchases', () => ({
  purchasesSupported: () => purchases.purchasesSupported(),
  subscribePurchases: (l: () => void) => purchases.subscribePurchases(l),
  getPurchasesSnapshot: () => purchases.getPurchasesSnapshot(),
  getPlanPrices: () => purchases.getPlanPrices(),
  purchasePlan: (p: string) => purchases.purchasePlan(p),
  restorePurchases: () => purchases.restorePurchases(),
  getManagementUrl: () => purchases.getManagementUrl(),
}));
vi.mock('@/data/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/data/entitlements')>();
  return { ...actual, listMyEntitlements: () => listMyEntitlements() };
});
vi.mock('@/data/env', () => ({ env: { hasSupabase: true } }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/platform/externalLinks', () => ({
  openExternalUrl: (u: string) => openExternalUrl(u),
}));

const multi = { entitlement: 'multi_account', expiresAt: null };
const write = { entitlement: 'calendar_write', expiresAt: null };

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function tick(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderSheet() {
  return render(<PlanSheet open reason="settings" onClose={vi.fn()} />);
}
const card = (name: string) => within(screen.getByRole('listitem', { name }));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  snapshot.userId = 'u1';
  authState = { state: 'authenticated', session: { user: { id: 'u1' } } };
  purchases.purchasesSupported.mockReturnValue(true);
  purchases.getPlanPrices.mockResolvedValue(
    ok({ calendar_write: '¥300', multi_account: '¥1,000' }),
  );
  purchases.purchasePlan.mockResolvedValue(ok('purchased'));
  purchases.restorePurchases.mockResolvedValue(ok({ hasActiveSubscription: true }));
  purchases.getManagementUrl.mockResolvedValue(ok('https://store.example/manage'));
  listMyEntitlements.mockResolvedValue(ok([]));
  openExternalUrl.mockReset().mockResolvedValue(true);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('PlanSheet(課金SDK有効)', () => {
  it('購入ボタンが有効になり、価格はストア表示(「仮の表示」注記なし)', async () => {
    renderSheet();
    await flush();
    const w = card('予定反映');
    expect(w.getByText('¥300 / 月')).toBeInTheDocument();
    expect(screen.queryByText(/仮の表示/)).not.toBeInTheDocument();
    expect(w.getByRole('button', { name: '予定反映 を購入' })).toBeEnabled();
    expect(card('複数アカウント').getByText('¥1,000 / 月')).toBeInTheDocument();
    expect(screen.queryByText('有料プランは準備中のため、現在は購入できません。')).not.toBeInTheDocument();
  });

  it('価格が取れないプランは仮表示のまま', async () => {
    purchases.getPlanPrices.mockResolvedValue(ok({ calendar_write: '¥300' }));
    renderSheet();
    await flush();
    expect(card('複数アカウント').getByText('¥1,000 / 月(仮の表示)')).toBeInTheDocument();
  });

  it('購入成功 → 「反映中…」→ entitlements を2秒間隔で再取得 → 反映されたら完了', async () => {
    renderSheet();
    await flush();
    // 初回ロード(PlanSheet と usePurchase の2インスタンス分)を済ませてから数え直す。
    listMyEntitlements.mockReset();
    listMyEntitlements
      .mockResolvedValueOnce(ok([])) // 2秒後
      .mockResolvedValue(ok([write])); // 4秒後
    fireEvent.click(card('予定反映').getByRole('button', { name: '予定反映 を購入' }));
    await flush();
    expect(purchases.purchasePlan).toHaveBeenCalledWith('calendar_write');
    expect(screen.getByRole('status')).toHaveTextContent('反映中…');
    expect(listMyEntitlements).toHaveBeenCalledTimes(0);

    await tick(2000);
    expect(listMyEntitlements).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('反映中…');

    await tick(2000);
    expect(listMyEntitlements).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('status')).toHaveTextContent('購入が反映されました。');
    expect(card('予定反映').getByText('契約中')).toBeInTheDocument();
  });

  it('10回待っても反映されなければ、復元を案内する文言を出す', async () => {
    renderSheet();
    await flush();
    listMyEntitlements.mockClear();
    fireEvent.click(card('予定反映').getByRole('button', { name: '予定反映 を購入' }));
    await flush();
    await tick(2000 * 10);
    expect(listMyEntitlements).toHaveBeenCalledTimes(10);
    expect(screen.getByRole('status')).toHaveTextContent(
      '反映に時間がかかっています。しばらくしてから「購入を復元」をお試しください',
    );
  });

  it('購入のキャンセルは無言(メッセージもエラーも出ず、再取得もしない)', async () => {
    purchases.purchasePlan.mockResolvedValue(ok('cancelled'));
    renderSheet();
    await flush();
    listMyEntitlements.mockClear();
    fireEvent.click(card('予定反映').getByRole('button', { name: '予定反映 を購入' }));
    await flush();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await tick(5000);
    expect(listMyEntitlements).toHaveBeenCalledTimes(0);
  });

  it('購入エラーは日本語メッセージで出す', async () => {
    purchases.purchasePlan.mockResolvedValue(err(appError('purchase/failed', 'purchase/failed')));
    renderSheet();
    await flush();
    fireEvent.click(card('予定反映').getByRole('button', { name: '予定反映 を購入' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent(
      '購入を完了できませんでした。もう一度お試しください',
    );
  });

  it('二重課金防止: 複数アカウント有効なら「予定反映」の購入ボタンは出さず、含まれる旨を出す', async () => {
    listMyEntitlements.mockResolvedValue(ok([multi]));
    renderSheet();
    await flush();
    const w = card('予定反映');
    expect(w.queryByRole('button')).not.toBeInTheDocument();
    expect(w.getByText('複数アカウントプランに含まれています')).toBeInTheDocument();
    const m = card('複数アカウント');
    expect(m.queryByRole('button')).not.toBeInTheDocument();
    expect(m.getByText('契約中')).toBeInTheDocument();
  });

  it('予定反映の契約中: 予定反映は契約中表示、複数アカウントへの変更は旧契約の扱いを一言添える', async () => {
    listMyEntitlements.mockResolvedValue(ok([write]));
    renderSheet();
    await flush();
    expect(card('予定反映').getByText('契約中')).toBeInTheDocument();
    expect(card('予定反映').queryByRole('button')).not.toBeInTheDocument();
    const m = card('複数アカウント');
    expect(m.getByText(/旧契約の扱い/)).toBeInTheDocument();
    expect(m.getByRole('button', { name: '複数アカウント を購入' })).toBeEnabled();
  });

  it('ゲストは購入できない(ログインの案内を出し、ボタンは無効・復元は出さない)', async () => {
    authState = { state: 'guest', session: { user: { id: 'g1' } } };
    renderSheet();
    await flush();
    expect(
      screen.getByText('ログインが必要です。設定の「アカウント」からログインすると購入できます。'),
    ).toBeInTheDocument();
    expect(card('予定反映').getByRole('button', { name: '予定反映 を購入' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: '購入を復元' })).not.toBeInTheDocument();
    expect(purchases.getPlanPrices).not.toHaveBeenCalled();
  });

  it('SDK の設定(ログイン)が済むまでは購入ボタンは押せない', async () => {
    snapshot.userId = null;
    renderSheet();
    await flush();
    expect(card('予定反映').getByRole('button', { name: '予定反映 を購入' })).toBeDisabled();
  });

  it('購入を復元: 有効な購読があれば反映を待つ', async () => {
    renderSheet();
    await flush();
    listMyEntitlements.mockReset();
    listMyEntitlements.mockResolvedValueOnce(ok([])).mockResolvedValue(ok([multi]));
    fireEvent.click(screen.getByRole('button', { name: '購入を復元' }));
    await flush();
    expect(purchases.restorePurchases).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('反映中…');
    await tick(2000);
    expect(screen.getByRole('status')).toHaveTextContent('反映中…');
    await tick(2000);
    expect(screen.getByRole('status')).toHaveTextContent('購入が反映されました。');
  });

  it('購入を復元: 有効な購読が無ければその旨を出す', async () => {
    purchases.restorePurchases.mockResolvedValue(ok({ hasActiveSubscription: false }));
    renderSheet();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: '購入を復元' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('復元できる購入は見つかりませんでした。');
  });

  it('購入を復元: 失敗はメッセージ', async () => {
    purchases.restorePurchases.mockResolvedValue(
      err(appError('purchase/restore-failed', 'purchase/restore-failed')),
    );
    renderSheet();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: '購入を復元' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('購入を復元できませんでした。もう一度お試しください');
  });

  it('購読を管理: 契約が無ければボタンを出さない', async () => {
    renderSheet();
    await flush();
    expect(screen.queryByRole('button', { name: '購読を管理' })).not.toBeInTheDocument();
  });

  it('購読を管理: 契約中は管理URLを外部で開く。URLが無ければ案内を出す', async () => {
    listMyEntitlements.mockResolvedValue(ok([write]));
    renderSheet();
    await flush();
    fireEvent.click(screen.getByRole('button', { name: '購読を管理' }));
    await flush();
    expect(openExternalUrl).toHaveBeenCalledWith('https://store.example/manage');

    purchases.getManagementUrl.mockResolvedValue(ok(null));
    fireEvent.click(screen.getByRole('button', { name: '購読を管理' }));
    await flush();
    expect(screen.getByRole('status')).toHaveTextContent('管理できる購読が見つかりません');
  });

  it('自動更新の注意書きは維持される', async () => {
    renderSheet();
    await flush();
    expect(
      screen.getByText('定期購入は自動で更新されます。価格・期間・解約方法は各ストアの設定に従います。'),
    ).toBeInTheDocument();
  });
});

describe('PlanSection(設定画面のプラン欄)', () => {
  it('現在の状態を出す(無料 / 予定反映 / 複数アカウント)。価格は書かない', async () => {
    const { unmount } = render(<PlanSection />);
    await flush();
    expect(screen.getByText('無料')).toBeInTheDocument();
    expect(screen.queryByText(/¥/)).not.toBeInTheDocument();
    unmount();

    listMyEntitlements.mockResolvedValue(ok([write]));
    const second = render(<PlanSection />);
    await flush();
    expect(screen.getByText('予定反映')).toBeInTheDocument();
    second.unmount();

    listMyEntitlements.mockResolvedValue(ok([multi]));
    render(<PlanSection />);
    await flush();
    expect(screen.getByText('複数アカウント')).toBeInTheDocument();
  });

  it('復元ボタンを出し、購入導線は PlanSheet を開く', async () => {
    render(<PlanSection />);
    await flush();
    expect(screen.getByRole('button', { name: '購入を復元' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'プランを選ぶ' }));
    await flush();
    expect(screen.getByRole('dialog', { name: 'プランを選ぶ' })).toBeInTheDocument();
  });

  it('ゲストにはログインの案内だけを出す', async () => {
    authState = { state: 'guest', session: { user: { id: 'g1' } } };
    render(<PlanSection />);
    await flush();
    expect(
      screen.getByText('ログインが必要です。設定の「アカウント」からログインすると購入できます。'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('Supabase 未設定(unavailable)では何も出さない', async () => {
    authState = { state: 'unavailable', session: null };
    const { container } = render(<PlanSection />);
    await flush();
    expect(container).toBeEmptyDOMElement();
  });
});
