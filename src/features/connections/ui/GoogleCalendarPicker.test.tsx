import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok, err, appError } from '@/data/result';

const navigate = vi.fn();
const listConnectionCalendars = vi.fn();
const refreshGoogleCalendars = vi.fn();
const setGoogleCalendarSelected = vi.fn();
let searchParams = new URLSearchParams();
let authState = { state: 'authenticated' };
let envValue = { hasSupabase: true, hasGoogleOauth: true };
let connectionsValue: {
  connections: unknown[];
  loading: boolean;
  errorKey: string | null;
  refresh: () => void;
} = {
  connections: [
    {
      id: 'c1',
      provider: 'google',
      googleEmail: 'me@gmail.com',
      createdAt: 'x',
      status: 'active',
    },
  ],
  loading: false,
  errorKey: null,
  refresh: vi.fn(),
};

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigate,
  useSearchParams: () => [searchParams],
}));
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/data/env', () => ({
  get env() {
    return envValue;
  },
}));
vi.mock('@/features/connections/model/useGoogleConnections', () => ({
  useGoogleConnections: () => connectionsValue,
}));
vi.mock('@/data/google-calendars', () => ({
  listConnectionCalendars: (...a: unknown[]) => listConnectionCalendars(...a),
  refreshGoogleCalendars: (...a: unknown[]) => refreshGoogleCalendars(...a),
  setGoogleCalendarSelected: (...a: unknown[]) => setGoogleCalendarSelected(...a),
}));

const { GoogleCalendarPicker } = await import('./GoogleCalendarPicker');

const choice = (over: Record<string, unknown> = {}) => ({
  externalCalendarId: 'a@g',
  summary: '個人',
  backgroundColor: '#4285F4',
  selected: false,
  lastSyncedAt: null,
  lastError: null,
  ...over,
});

beforeEach(() => {
  searchParams = new URLSearchParams();
  navigate.mockReset();
  listConnectionCalendars
    .mockReset()
    .mockResolvedValue(ok([choice(), choice({ externalCalendarId: 'b@g', summary: '部活' })]));
  refreshGoogleCalendars.mockReset().mockResolvedValue(ok({ count: 2 }));
  setGoogleCalendarSelected.mockReset().mockResolvedValue(ok(undefined));
  authState = { state: 'authenticated' };
  envValue = { hasSupabase: true, hasGoogleOauth: true };
  connectionsValue = {
    connections: [
      {
        id: 'c1',
        provider: 'google',
        googleEmail: 'me@gmail.com',
        createdAt: 'x',
        status: 'active',
      },
    ],
    loading: false,
    errorKey: null,
    refresh: vi.fn(),
  };
});

describe('GoogleCalendarPicker', () => {
  it('選択の保存が例外になっても保存中を解除し、チェックを戻してエラーを出す', async () => {
    let fail!: (reason: Error) => void;
    setGoogleCalendarSelected.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    );
    render(<GoogleCalendarPicker />);
    await userEvent.setup().click(await screen.findByRole('checkbox', { name: /個人/ }));
    expect(screen.getByText('保存中…')).toBeInTheDocument();
    await act(async () => fail(new Error('保存通信失敗')));
    expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした');
    expect(screen.queryByText('保存中…')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /個人/ })).not.toBeChecked();
  });
  it('未接続なら設定へ戻す案内を出し、関数を呼ばない', () => {
    connectionsValue = { connections: [], loading: false, errorKey: null, refresh: vi.fn() };
    render(<GoogleCalendarPicker />);
    expect(screen.getByText('先に Google を接続してください')).toBeInTheDocument();
    expect(refreshGoogleCalendars).not.toHaveBeenCalled();
  });

  it('接続済み: カタログを出し、Google から取り直す', async () => {
    render(<GoogleCalendarPicker />);
    expect(await screen.findByText('個人')).toBeInTheDocument();
    expect(screen.getByText('部活')).toBeInTheDocument();
    await waitFor(() => expect(refreshGoogleCalendars).toHaveBeenCalledTimes(1));
    // 対象の接続 ID を必ず渡す(省略すると2接続時に 400 connection/ambiguous)
    expect(listConnectionCalendars).toHaveBeenCalledWith('c1');
    expect(refreshGoogleCalendars).toHaveBeenCalledWith('c1');
    // 見出しにアカウントのメール
    expect(screen.getByRole('heading', { name: 'me@gmail.com' })).toBeInTheDocument();
  });

  it('チェックで setGoogleCalendarSelected(id, true) を呼ぶ', async () => {
    const user = userEvent.setup();
    render(<GoogleCalendarPicker />);
    await screen.findByText('個人');
    const checkboxes = screen.getAllByRole('checkbox');
    await user.click(checkboxes[0]!);
    expect(setGoogleCalendarSelected).toHaveBeenCalledWith('c1', 'a@g', true);
  });

  it('トグル失敗でロールバックしエラー表示', async () => {
    setGoogleCalendarSelected.mockResolvedValue(
      err(appError('connection/calendars-failed', 'connection/calendars-failed')),
    );
    const user = userEvent.setup();
    render(<GoogleCalendarPicker />);
    await screen.findByText('個人');
    const cb = screen.getAllByRole('checkbox')[0]!;
    await user.click(cb);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('取得できませんでした'),
    );
    expect((cb as HTMLInputElement).checked).toBe(false);
  });

  it('選択済みカレンダー: 最終取り込み時刻 / 失敗を行ごとに出す', async () => {
    listConnectionCalendars.mockResolvedValue(
      ok([
        choice({
          externalCalendarId: 'a@g',
          summary: '個人',
          selected: true,
          lastSyncedAt: '2026-09-11T05:30:00Z',
        }),
        choice({
          externalCalendarId: 'b@g',
          summary: '部活',
          selected: true,
          lastError: 'sync-failed',
        }),
        choice({ externalCalendarId: 'c@g', summary: '未選択', selected: false }),
      ]),
    );
    refreshGoogleCalendars.mockResolvedValue(ok({ count: 3 }));
    render(<GoogleCalendarPicker />);
    await screen.findByText('個人');
    expect(screen.getByText(/最終取り込み: .*9\/11/)).toBeInTheDocument();
    expect(screen.getByText('前回は取り込めませんでした')).toBeInTheDocument();
    // 未選択の行には注記を出さない
    expect(screen.queryAllByText('まだ取り込んでいません')).toHaveLength(0);
  });

  it('取り直しに失敗してもカタログは出し続ける', async () => {
    refreshGoogleCalendars.mockResolvedValue(
      err(appError('connection/reauth-needed', 'connection/reauth-needed')),
    );
    render(<GoogleCalendarPicker />);
    expect(await screen.findByText('個人')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('接続し直してください'),
    );
  });

  describe('複数アカウント', () => {
    const two = () => ({
      connections: [
        {
          id: 'c1',
          provider: 'google',
          googleEmail: 'me@gmail.com',
          createdAt: 'x',
          status: 'active',
        },
        {
          id: 'c2',
          provider: 'google',
          googleEmail: 'work@gmail.com',
          createdAt: 'y',
          status: 'active',
        },
        {
          id: 'c3',
          provider: 'google',
          googleEmail: 'old@gmail.com',
          createdAt: 'z',
          status: 'suspended',
        },
      ],
      loading: false,
      errorKey: null,
      refresh: vi.fn(),
    });
    beforeEach(() => {
      connectionsValue = two();
      listConnectionCalendars.mockImplementation(async (id: string) =>
        id === 'c2'
          ? ok([choice({ externalCalendarId: 'w@g', summary: '仕事' })])
          : ok([choice(), choice({ externalCalendarId: 'b@g', summary: '部活' })]),
      );
    });

    it('active のアカウントごとに見出しと候補を出し、それぞれの接続 ID で読む。suspended は出さない', async () => {
      render(<GoogleCalendarPicker />);
      const me = await screen.findByRole('region', { name: 'me@gmail.com' });
      const work = screen.getByRole('region', { name: 'work@gmail.com' });
      expect(await within(me).findByText('個人')).toBeInTheDocument();
      expect(await within(work).findByText('仕事')).toBeInTheDocument();
      expect(within(work).queryByText('個人')).not.toBeInTheDocument();
      expect(screen.queryByText('old@gmail.com')).not.toBeInTheDocument();
      await waitFor(() => expect(refreshGoogleCalendars).toHaveBeenCalledTimes(2));
      expect(refreshGoogleCalendars).toHaveBeenCalledWith('c1');
      expect(refreshGoogleCalendars).toHaveBeenCalledWith('c2');
      expect(listConnectionCalendars).not.toHaveBeenCalledWith('c3');
      expect(refreshGoogleCalendars).not.toHaveBeenCalledWith('c3');
      expect(refreshGoogleCalendars).not.toHaveBeenCalledWith();
    });

    it('2つ目のアカウントのチェックはその接続 ID で set する', async () => {
      const user = userEvent.setup();
      render(<GoogleCalendarPicker />);
      const work = await screen.findByRole('region', { name: 'work@gmail.com' });
      await within(work).findByText('仕事');
      await user.click(within(work).getByRole('checkbox'));
      expect(setGoogleCalendarSelected).toHaveBeenCalledWith('c2', 'w@g', true);
    });

    it('アカウントごとの「更新」はその接続だけを取り直す', async () => {
      const user = userEvent.setup();
      render(<GoogleCalendarPicker />);
      await waitFor(() => expect(refreshGoogleCalendars).toHaveBeenCalledTimes(2));
      refreshGoogleCalendars.mockClear();
      await user.click(
        screen.getByRole('button', { name: 'work@gmail.com のカレンダーを更新' }),
      );
      await waitFor(() => expect(refreshGoogleCalendars).toHaveBeenCalledTimes(1));
      expect(refreshGoogleCalendars).toHaveBeenCalledWith('c2');
    });

    it('?connection= 指定時はそのアカウントだけを出す', async () => {
      searchParams = new URLSearchParams({ connection: 'c2' });
      render(<GoogleCalendarPicker />);
      expect(
        await screen.findByRole('region', { name: 'work@gmail.com' }),
      ).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'me@gmail.com' })).not.toBeInTheDocument();
      expect(listConnectionCalendars).not.toHaveBeenCalledWith('c1');
    });

    it('suspended しか無ければ未接続と同じ案内を出し、関数を呼ばない', () => {
      connectionsValue = {
        ...two(),
        connections: [
          {
            id: 'c3',
            provider: 'google',
            googleEmail: 'old@gmail.com',
            createdAt: 'z',
            status: 'suspended',
          },
        ],
      };
      render(<GoogleCalendarPicker />);
      expect(screen.getByText('先に Google を接続してください')).toBeInTheDocument();
      expect(listConnectionCalendars).not.toHaveBeenCalled();
      expect(refreshGoogleCalendars).not.toHaveBeenCalled();
    });
  });
});
