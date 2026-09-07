import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { appError, err, ok } from '@/data/result';

const buildExportBundle = vi.fn();
const downloadJson = vi.fn();
let authState: { state: string } = { state: 'guest' };

vi.mock('@/data/export', () => ({ buildExportBundle: () => buildExportBundle() }));
vi.mock('@/lib/download', () => ({ downloadJson: (...a: unknown[]) => downloadJson(...a) }));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));

const { DataSection } = await import('./DataSection');

const bundle = { app: 'calendar-app', schemaVersion: 1, exportedAt: 'x', calendars: [], events: [] };

beforeEach(() => {
  buildExportBundle.mockReset();
  downloadJson.mockReset();
  authState = { state: 'guest' };
});

describe('DataSection', () => {
  it('エクスポート成功で downloadJson をバンドルとファイル名で呼ぶ', async () => {
    buildExportBundle.mockResolvedValue(ok(bundle));
    const user = userEvent.setup();
    render(<DataSection />);
    await user.click(screen.getByRole('button', { name: 'JSON でエクスポート' }));
    expect(downloadJson).toHaveBeenCalledTimes(1);
    const [filename, data] = downloadJson.mock.calls[0]!;
    expect(filename).toMatch(/^calendar-app-export-\d{4}-\d{2}-\d{2}\.json$/);
    expect(data).toBe(bundle);
  });

  it('取得失敗ならメッセージを出し、downloadJson を呼ばない', async () => {
    buildExportBundle.mockResolvedValue(err(appError('data/query', 'data/query')));
    const user = userEvent.setup();
    render(<DataSection />);
    await user.click(screen.getByRole('button', { name: 'JSON でエクスポート' }));
    expect(screen.getByRole('alert')).toHaveTextContent('読み込みに失敗');
    expect(downloadJson).not.toHaveBeenCalled();
  });

  it('unavailable ではボタンを出さず設定を促す', () => {
    authState = { state: 'unavailable' };
    render(<DataSection />);
    expect(screen.queryByRole('button', { name: 'JSON でエクスポート' })).not.toBeInTheDocument();
    expect(screen.getByText(/Supabase を設定すると/)).toBeInTheDocument();
  });
});
