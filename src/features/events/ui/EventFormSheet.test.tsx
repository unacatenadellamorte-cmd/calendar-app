import { describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Calendar } from '@/data/calendars';
import { EventFormSheet } from './EventFormSheet';
import { openMap, openExternalUrl } from '@/platform/externalLinks';
vi.mock('@/platform/externalLinks', async (original) => ({
  ...await original<typeof import('@/platform/externalLinks')>(),
  openMap: vi.fn().mockResolvedValue(true),
  openExternalUrl: vi.fn().mockResolvedValue(true),
}));

const calendars: Calendar[] = [
  {
    id: 'c1',
    name: '仕事',
    color: '#0072B2',
    source: 'local',
    isShift: false,
    isVisible: true,
    priority: 0,
    createdAt: '',
    updatedAt: '',
  },
];

function setup(overrides: Partial<Parameters<typeof EventFormSheet>[0]> = {}) {
  const onCreate = vi.fn().mockResolvedValue(true);
  const onUpdate = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  const onSetReminder = vi.fn().mockResolvedValue(true);
  const view = render(
    <EventFormSheet
      open
      editing={null}
      calendars={calendars}
      onClose={onClose}
      onCreate={onCreate}
      onUpdate={onUpdate}
      onSetReminder={onSetReminder}
      {...overrides}
    />,
  );
  return { onCreate, onUpdate, onClose, onSetReminder, ...view };
}

describe('EventFormSheet', () => {
  it('保存済みのローカル予定を開き直すと場所とURLを開ける（保存は行わない）', async () => {
    const user = userEvent.setup();
    const { onCreate, onUpdate } = setup({ editing: {
      id: 'saved', calendarId: 'c1', title: '打合せ', source: 'local',
      allDay: true, eventDate: '2026-09-19', startsAt: null, endsAt: null,
      note: null, location: '京都駅', url: 'https://zoom.us/j/123',
      breakMinutes: null, hourlyWage: null, workplaceLabel: null,
      shiftTemplateId: null, reminderMinutes: null, isSecret: false,
      createdAt: '', updatedAt: '',
    } });
    await user.click(screen.getByRole('button', { name: '地図を開く' }));
    expect(openMap).toHaveBeenCalledWith('京都駅');
    await user.click(screen.getByRole('button', { name: 'リンクを開く' }));
    expect(openExternalUrl).toHaveBeenCalledWith('https://zoom.us/j/123');
    expect(onCreate).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('地図起動失敗は入力を消さず画面内に表示する', async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(openMap).mockResolvedValueOnce(false);
    await user.type(screen.getByLabelText('場所'), '京都駅');
    await user.click(screen.getByRole('button', { name: '地図を開く' }));
    expect(screen.getByRole('alert')).toHaveTextContent('地図を開けませんでした');
    expect(screen.getByLabelText('場所')).toHaveValue('京都駅');
  });

  it('危険なURLは起動操作を出さず保存前にも拒否する', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '会議');
    await user.type(screen.getByLabelText('予定URL'), 'javascript:alert(1)');
    expect(screen.queryByRole('button', { name: 'リンクを開く' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('httpまたはhttps');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('リンク起動の失敗を入力を保持して表示する', async () => {
    const user = userEvent.setup();
    setup();
    vi.mocked(openExternalUrl).mockResolvedValueOnce(false);
    await user.type(screen.getByLabelText('予定URL'), 'https://example.com');
    await user.click(screen.getByRole('button', { name: 'リンクを開く' }));
    expect(screen.getByRole('alert')).toHaveTextContent('リンクを開けませんでした');
    expect(screen.getByLabelText('予定URL')).toHaveValue('https://example.com');
  });

  it('後の起動が成功したら先の遅い失敗結果を表示しない', async () => {
    const user = userEvent.setup();
    setup();
    let finishFirst!: (ok: boolean) => void;
    vi.mocked(openMap).mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve; }));
    await user.type(screen.getByLabelText('場所'), '京都駅');
    await user.click(screen.getByRole('button', { name: '地図を開く' }));
    await user.click(screen.getByRole('button', { name: '地図を開く' }));
    await act(async () => { finishFirst(false); });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('空タイトルでは保存せずバリデーションメッセージを出す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('タイトルを入力');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('開始 > 終了 では保存せず「終了は開始より後に」を出す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '打合せ');
    const [start, end] = screen.getAllByLabelText(/開始|終了/);
    await user.clear(start!);
    await user.type(start!, '2026-09-08T15:00');
    await user.clear(end!);
    await user.type(end!, '2026-09-08T14:00');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('終了は開始より後に');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('開始または終了が空欄でも変換で落とさず時刻エラーを表示する', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '入力途中');
    await user.clear(screen.getByLabelText('開始'));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('終了は開始より後に');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('カレンダーの再取得で入力中のフォームをリセットしない', async () => {
    const user = userEvent.setup();
    const first = setup();
    await user.type(screen.getByLabelText('タイトル'), '入力を保持');
    first.rerender(
      <EventFormSheet
        open
        editing={null}
        calendars={[{ ...calendars[0]!, updatedAt: 'refetched' }]}
        onClose={first.onClose}
        onCreate={first.onCreate}
        onUpdate={first.onUpdate}
        onSetReminder={first.onSetReminder}
      />,
    );
    expect(screen.getByLabelText('タイトル')).toHaveValue('入力を保持');
  });

  it('カレンダー未取得で開いても一覧到着後に自作カレンダーだけ補完する', async () => {
    const user = userEvent.setup();
    const first = setup({ calendars: [] });
    await user.type(screen.getByLabelText('タイトル'), '先に入力');
    first.rerender(
      <EventFormSheet
        open
        editing={null}
        calendars={calendars}
        onClose={first.onClose}
        onCreate={first.onCreate}
        onUpdate={first.onUpdate}
        onSetReminder={first.onSetReminder}
      />,
    );
    expect(screen.getByLabelText('タイトル')).toHaveValue('先に入力');
    expect(screen.getByRole('combobox', { name: 'カレンダー' })).toHaveValue('c1');
  });

  it('外部カレンダーは選択肢に出さず、誤登録 local 予定は自作へ移せる', () => {
    const external: Calendar = {
      ...calendars[0]!,
      id: 'g1',
      name: 'Google取り込み',
      source: 'google',
    };
    const local: Calendar = { ...calendars[0]!, id: 'c2', name: '自作' };
    const editing = {
      id: 'e1',
      calendarId: external.id,
      title: '誤登録',
      allDay: false as const,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
      eventDate: null,
      note: null,
      source: 'local' as const,
      breakMinutes: null,
      hourlyWage: null,
      workplaceLabel: null,
      shiftTemplateId: null,
      reminderMinutes: null,
      isSecret: false,
      createdAt: '',
      updatedAt: '',
    };
    setup({ calendars: [external, local], editing });
    expect(screen.queryByRole('option', { name: 'Google取り込み' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'カレンダー' })).toHaveValue('c2');
  });

  it('終日で日付未入力なら「日付を選んで」を出す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '祝日');
    await user.click(screen.getByRole('checkbox', { name: '終日' }));
    await user.clear(screen.getByLabelText('日付'));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(screen.getByRole('alert')).toHaveTextContent('日付を選んで');
    expect(onCreate).not.toHaveBeenCalled();
  });

  it('seed.date を渡すと新規フォームの開始日がその日付になる', () => {
    setup({ seed: { date: '2026-09-20' } });
    expect(screen.getByLabelText('開始')).toHaveValue('2026-09-20T09:00');
    expect(screen.getByLabelText('終了')).toHaveValue('2026-09-20T10:00');
  });

  it('seed.startLocal を渡すとその時刻から1時間が既定になる', () => {
    setup({ seed: { startLocal: '2026-09-20T14:00' } });
    expect(screen.getByLabelText('開始')).toHaveValue('2026-09-20T14:00');
    expect(screen.getByLabelText('終了')).toHaveValue('2026-09-20T15:00');
  });

  it('編集中に onDelete を渡すと削除ボタンが出て、押すと onDelete + onClose', async () => {
    const user = userEvent.setup();
    const editing = {
      id: 'e9',
      calendarId: 'c1',
      title: '古い予定',
      allDay: false as const,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
      eventDate: null,
      note: null,
      source: 'local' as const,
      breakMinutes: null,
      hourlyWage: null,
      workplaceLabel: null,
      shiftTemplateId: null,
      reminderMinutes: null,
      isSecret: false,
      createdAt: '',
      updatedAt: '',
    };
    const onDelete = vi.fn();
    const { onClose } = setup({ editing, onDelete });
    await user.click(screen.getByRole('button', { name: 'この予定を削除' }));
    expect(onDelete).toHaveBeenCalledWith(editing);
    expect(onClose).toHaveBeenCalled();
  });

  it('編集中かつ時刻付きなら ReminderPicker を表示する', () => {
    const editing = {
      id: 'e9',
      calendarId: 'c1',
      title: '古い予定',
      allDay: false as const,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
      eventDate: null,
      note: null,
      source: 'local' as const,
      breakMinutes: null,
      hourlyWage: null,
      workplaceLabel: null,
      shiftTemplateId: null,
      reminderMinutes: null,
      isSecret: false,
      createdAt: '',
      updatedAt: '',
    };
    setup({ editing });
    expect(screen.getByText('リマインダー')).toBeInTheDocument();
  });

  it('編集中でも終日予定なら ReminderPicker を表示しない', () => {
    const editing = {
      id: 'e9',
      calendarId: 'c1',
      title: '古い予定',
      allDay: true as const,
      startsAt: null,
      endsAt: null,
      eventDate: '2026-09-08',
      note: null,
      source: 'local' as const,
      breakMinutes: null,
      hourlyWage: null,
      workplaceLabel: null,
      shiftTemplateId: null,
      reminderMinutes: null,
      isSecret: false,
      createdAt: '',
      updatedAt: '',
    };
    setup({ editing });
    expect(screen.queryByText('リマインダー')).not.toBeInTheDocument();
  });

  it('新規作成時(editing が null)は ReminderPicker を表示しない', () => {
    setup();
    expect(screen.queryByText('リマインダー')).not.toBeInTheDocument();
  });

  it('onDelete 未指定なら削除ボタンは出ない', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'この予定を削除' })).not.toBeInTheDocument();
  });

  it('正しい入力で onCreate を呼び、UTC ISO で渡す', async () => {
    const user = userEvent.setup();
    const { onCreate, onClose } = setup();
    await user.type(screen.getByLabelText('タイトル'), '打合せ');
    const start = screen.getByLabelText('開始');
    const end = screen.getByLabelText('終了');
    await user.clear(start);
    await user.type(start, '2026-09-08T14:00');
    await user.clear(end);
    await user.type(end, '2026-09-08T15:00');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(onCreate).toHaveBeenCalledTimes(1);
    const arg = onCreate.mock.calls[0]![0];
    expect(arg).toMatchObject({ calendarId: 'c1', title: '打合せ', allDay: false });
    expect(arg.startsAt).toMatch(/^2026-09-08T\d{2}:00:00/); // UTC ISO
    expect(new Date(arg.startsAt).getTime()).toBeLessThan(new Date(arg.endsAt).getTime());
    expect(onClose).toHaveBeenCalled();
  });

  it('場所と予定URLを保存入力として onCreate に渡す', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), 'オンライン会議');
    await user.type(screen.getByLabelText('場所'), '東京駅');
    await user.type(screen.getByLabelText('予定URL'), 'https://zoom.us/j/123');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onCreate.mock.calls[0]![0]).toMatchObject({
      location: '東京駅', url: 'https://zoom.us/j/123',
    });
  });

  it('シークレットのチェックを付けて保存すると isSecret: true で onCreate を呼ぶ(spec-secret-mode)', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '秘密の予定');
    await user.click(screen.getByRole('checkbox', { name: 'シークレット' }));
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ isSecret: true });
  });

  it('シークレットのチェックを付けないと isSecret: false で onCreate を呼ぶ', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.type(screen.getByLabelText('タイトル'), '普通の予定');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(onCreate.mock.calls[0]![0]).toMatchObject({ isSecret: false });
  });

  it('編集中はシークレットの現在値をチェック状態に反映する', () => {
    const editing = {
      id: 'e9',
      calendarId: 'c1',
      title: '秘密の予定',
      allDay: false as const,
      startsAt: '2026-09-08T01:00:00Z',
      endsAt: '2026-09-08T02:00:00Z',
      eventDate: null,
      note: null,
      source: 'local' as const,
      breakMinutes: null,
      hourlyWage: null,
      workplaceLabel: null,
      shiftTemplateId: null,
      reminderMinutes: null,
      isSecret: true,
      createdAt: '',
      updatedAt: '',
    };
    setup({ editing });
    expect(screen.getByRole('checkbox', { name: 'シークレット' })).toBeChecked();
  });
});
