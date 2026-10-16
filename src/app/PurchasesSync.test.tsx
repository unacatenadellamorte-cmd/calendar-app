import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';

/**
 * PurchasesSync: 認証状態に合わせて configurePurchases を呼ぶ(ログイン→configure/logIn、
 * ゲスト・ログアウト→logOut)。SDK が使えない環境では何もしない。
 */

const configurePurchases = vi.fn();
let supported = true;
let auth: { state: string; session: { user: { id: string } } | null } = {
  state: 'loading',
  session: null,
};
vi.mock('@/data/purchases', () => ({
  configurePurchases: (id: string | null) => configurePurchases(id),
  purchasesSupported: () => supported,
}));
vi.mock('./auth-context', () => ({ useAuth: () => auth }));

const { PurchasesSync } = await import('./PurchasesSync');

beforeEach(() => {
  configurePurchases.mockReset().mockResolvedValue({ ok: true, value: undefined });
  supported = true;
  auth = { state: 'loading', session: null };
});

describe('PurchasesSync', () => {
  it('認証確定前(loading)は何もしない', () => {
    render(<PurchasesSync />);
    expect(configurePurchases).not.toHaveBeenCalled();
  });
  it('ログイン済みなら auth.users.id で configure、ユーザーが替われば再度呼ぶ(logIn は data 層)', () => {
    auth = { state: 'authenticated', session: { user: { id: 'u1' } } };
    const { rerender } = render(<PurchasesSync />);
    expect(configurePurchases).toHaveBeenLastCalledWith('u1');
    auth = { state: 'authenticated', session: { user: { id: 'u2' } } };
    rerender(<PurchasesSync />);
    expect(configurePurchases).toHaveBeenLastCalledWith('u2');
  });
  it('ログアウト(ゲストへ戻る)で null を渡す(= logOut)。ゲストでは userId を渡さない', () => {
    auth = { state: 'authenticated', session: { user: { id: 'u1' } } };
    const { rerender } = render(<PurchasesSync />);
    auth = { state: 'guest', session: { user: { id: 'anon' } } };
    rerender(<PurchasesSync />);
    expect(configurePurchases).toHaveBeenLastCalledWith(null);
    expect(configurePurchases).not.toHaveBeenCalledWith('anon');
  });
  it('SDK が使えない環境(Web・キー無し)では何もしない', () => {
    supported = false;
    auth = { state: 'authenticated', session: { user: { id: 'u1' } } };
    render(<PurchasesSync />);
    expect(configurePurchases).not.toHaveBeenCalled();
  });
  it('初期化失敗はdata層に保持され、ユーザー切替と削除開始では紐付けを更新する', async () => {
    configurePurchases.mockResolvedValueOnce({
      ok: false,
      error: { messageKey: 'purchase/configure-failed' },
    });
    auth = { state: 'authenticated', session: { user: { id: 'u1' } } };
    const { rerender } = render(<PurchasesSync />);
    await Promise.resolve();
    auth = { state: 'authenticated', session: { user: { id: 'u2' } } };
    rerender(<PurchasesSync />);
    expect(configurePurchases).toHaveBeenLastCalledWith('u2');
    auth = { state: 'deleting', session: { user: { id: 'u2' } } };
    rerender(<PurchasesSync />);
    expect(configurePurchases).toHaveBeenLastCalledWith(null);
  });
});
