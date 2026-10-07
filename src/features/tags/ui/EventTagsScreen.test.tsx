import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err, ok, appError } from '@/data/result';
import type { EventTag } from '@/data/event-tags';

const listEventTags = vi.fn();
const createEventTag = vi.fn();
const updateEventTag = vi.fn();
const deleteEventTag = vi.fn();
let authState: { state: string; session: { user: { id: string } } | null } = {
  state: 'guest',
  session: null,
};
vi.mock('@/app/auth-context', () => ({ useAuth: () => authState }));
vi.mock('@/data/event-tags', async () => {
  const actual =
    await vi.importActual<typeof import('@/data/event-tags')>('@/data/event-tags');
  return { ...actual, listEventTags, createEventTag, updateEventTag, deleteEventTag };
});

const tag: EventTag = {
  allDay: false,
  id: 'tag-1',
  name: '仕事',
  color: '#2563EB',
  startLocal: '09:00',
  endLocal: '18:00',
  createdAt: '2026-09-25T00:00:00Z',
  updatedAt: '2026-09-25T00:00:00Z',
};
const { EventTagsScreen } = await import('./EventTagsScreen');

beforeEach(() => {
  vi.clearAllMocks();
  authState = { state: 'guest', session: null };
  listEventTags.mockResolvedValue(ok([tag]));
});

describe('EventTagsScreen', () => {
  it('一覧取得失敗を未登録扱いにせず、再試行で表示する', async () => {
    const user = userEvent.setup();
    listEventTags
      .mockResolvedValueOnce(err(appError('data/query', 'data/query')))
      .mockResolvedValueOnce(ok([tag]));
    render(<EventTagsScreen />);
    expect(await screen.findByRole('alert')).toHaveTextContent('読み込みに失敗しました');
    expect(screen.queryByText('まだ予定タグはありません。')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '再試行' }));
    expect(await screen.findByRole('button', { name: /仕事/ })).toBeInTheDocument();
  });

  it('読み込み完了後に失敗した編集は一覧をロールバックし、フォームを保持する', async () => {
    const user = userEvent.setup();
    updateEventTag.mockResolvedValue(err(appError('data/query', 'data/query')));
    render(<EventTagsScreen />);
    await user.click(await screen.findByRole('button', { name: /仕事/ }));
    const input = screen.getByLabelText('予定名称');
    await user.clear(input);
    await user.type(input, '休み');
    await user.click(screen.getByRole('button', { name: '保存' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました');
    expect(input).toHaveValue('休み');
    expect(
      within(screen.getByRole('list')).getByRole('button', { name: /仕事/ }),
    ).toBeInTheDocument();
  });
});

it('削除失敗でもタグと入力が残り、再試行成功でだけフォームを閉じる', async () => {
  const user = userEvent.setup();
  deleteEventTag
    .mockResolvedValueOnce(err(appError('data/query', 'data/query')))
    .mockResolvedValueOnce(ok(undefined));
  render(<EventTagsScreen />);
  await user.click(await screen.findByRole('button', { name: /仕事/ }));
  await user.click(screen.getByRole('button', { name: 'この予定タグを削除' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('保存に失敗しました');
  expect(screen.getByLabelText('予定名称')).toHaveValue('仕事');
  await user.click(screen.getByRole('button', { name: 'この予定タグを削除' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.getByText('まだ予定タグはありません。')).toBeInTheDocument();
});

it('利用者が変われば前の一覧と編集中の値を破棄する', async () => {
  const user = userEvent.setup();
  authState = { state: 'authenticated', session: { user: { id: 'user-a' } } };
  const { rerender } = render(<EventTagsScreen />);
  await user.click(await screen.findByRole('button', { name: /仕事/ }));
  listEventTags.mockResolvedValueOnce(ok([{ ...tag, id: 'b', name: '別利用者' }]));
  authState = { state: 'authenticated', session: { user: { id: 'user-b' } } };
  rerender(<EventTagsScreen />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(await screen.findByRole('button', { name: /別利用者/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /仕事/ })).not.toBeInTheDocument();
});

it('削除送信中は連打・入力・閉じ操作を抑止する', async () => {
  let finish!: (value: unknown) => void;
  deleteEventTag.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const user = userEvent.setup();
  render(<EventTagsScreen />);
  await user.click(await screen.findByRole('button', { name: /仕事/ }));
  const remove = screen.getByRole('button', { name: 'この予定タグを削除' });
  await user.click(remove);
  await user.click(remove);
  expect(deleteEventTag).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('予定名称')).toBeDisabled();
  await user.click(screen.getByRole('button', { name: '閉じる' }));
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  await act(async () => finish(ok(undefined)));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('終日タグを一覧へ表示し、編集しても終日状態を復元する', async () => {
  listEventTags.mockResolvedValueOnce(ok([{ ...tag, allDay: true }]));
  render(<EventTagsScreen />);
  const button = await screen.findByRole('button', { name: '仕事 終日' });
  expect(button).not.toHaveTextContent('09:00');
  await userEvent.setup().click(button);
  expect(screen.getByLabelText('終日')).toBeChecked();
  expect(screen.queryByLabelText('開始')).not.toBeInTheDocument();
});
