import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// 公開する静的ページの実ソースを、通信なしで jsdom 上に読み込んで実行する。
const html = readFileSync(resolve(process.cwd(), 'public/auth-confirmation.html'), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]!);
const SECRET = 'SECRET-TOKEN-0123456789';
const fetchMock = vi.fn();
let logs: ReturnType<typeof vi.spyOn>[];

const PAGE = '/calendar-app/auth-confirmation.html';
const EXPIRED = 'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
const addListener = window.addEventListener.bind(window);
let listeners: [string, EventListenerOrEventListenerObject][] = [];

/** 前のページが登録したリスナーを外す(ページの読み直しに相当)。 */
function closePage() {
  for (const [type, listener] of listeners) window.removeEventListener(type, listener);
  listeners = [];
}

const shown = () => ({
  state: document.getElementById('result')!.getAttribute('data-state'),
  title: document.getElementById('title')!.textContent,
  text: document.body.textContent ?? '',
});

function open(suffix: string, languages: string[] = ['ja-JP']) {
  closePage();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(window, 'addEventListener').mockImplementation(
    (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.push([type, listener]);
      addListener(type, listener);
    },
  );
  window.history.replaceState(null, '', `${PAGE}${suffix}`);
  document.documentElement.innerHTML = html.replace(/<script>[\s\S]*?<\/script>/g, '');
  for (const script of scripts) new Function(script)();
  return shown();
}

function expectCleanUrl() {
  expect(window.location.pathname).toBe(PAGE);
  expect(window.location.search + window.location.hash).toBe('');
  expect(window.location.href).not.toContain(SECRET);
  expect(JSON.stringify(window.history.state ?? null)).not.toContain(SECRET);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
    vi.spyOn(console, level).mockImplementation(() => undefined),
  );
});

afterEach(() => {
  closePage();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('public/auth-confirmation.html', () => {
  it('外部の資源・通信・保存・ログ・HTML差し込みを含まず、参照元を送らない', () => {
    expect(scripts).toHaveLength(1);
    expect(html).toContain('<meta name="referrer" content="no-referrer" />');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/<(img|link|iframe|form|a)\b/i);
    expect(html).not.toMatch(/\ssrc=/i);
    expect(html).not.toMatch(
      /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|console\.|localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|import\(/,
    );
  });

  it.each([
    ['匿名昇格(email_change)', 'email_change'],
    ['新規登録(signup)', 'signup'],
  ])('%s のトークンは URL から直ちに消し、画面・ログ・保存領域へ出さずに受付を案内する', (_label, type) => {
    const page = open(
      `#access_token=${SECRET}&refresh_token=${SECRET}&expires_in=3600&token_type=bearer&type=${type}`,
    );
    expectCleanUrl();
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
    expect(JSON.stringify([{ ...localStorage }, { ...sessionStorage }, document.cookie])).not.toContain(SECRET);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    expect(page.state).toBe('confirmed');
    expect(page.title).toBe('メールアドレスの確認を受け付けました');
    expect(page.text).toContain('アプリに戻り、登録したメールアドレスとパスワードでログインしてください。');
    expect(page.text).toContain('このページでログインは行われません。');
  });

  it.each([
    ['未交換の認証コードだけ', `?code=${SECRET}`],
    ['認証コードと確認種別', `?code=${SECRET}&type=signup`],
    ['空のトークン', '#access_token=&type=email_change'],
    ['種別の無いトークン', `#access_token=${SECRET}`],
    ['パスワード再設定のトークン', `#access_token=${SECRET}&type=recovery`],
    ['マジックリンクのトークン', `#access_token=${SECRET}&type=magiclink`],
    ['query に置かれたトークン', `?access_token=${SECRET}&type=signup`],
  ])('%s は確認受付と表示せず、URL からは消す', (_label, suffix) => {
    const page = open(suffix);
    expect(page.state).toBe('unknown');
    expect(page.title).toBe('確認結果を表示できません');
    expect(page.text).not.toContain('確認を受け付けました');
    expectCleanUrl();
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
  });

  it('同じタブで成功の後に失効リンクへハッシュだけ変わっても、判定し直して URL を消す', async () => {
    expect(open(`#access_token=${SECRET}&type=email_change`).state).toBe('confirmed');

    window.location.hash = `${EXPIRED}&access_token=${SECRET}`;
    await vi.waitFor(() => expect(shown().state).toBe('expired'));
    expect(shown().title).toBe('このリンクは使えません');
    expect(shown().text).not.toContain('確認を受け付けました');
    expectCleanUrl();

    // 失効の後に成功リンクへ移っても、古い表示を残さない。
    window.location.hash = `access_token=${SECRET}&type=signup`;
    await vi.waitFor(() => expect(shown().state).toBe('confirmed'));
    expectCleanUrl();
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });

  it('履歴を戻る・進むと、その履歴の結果を表示し、秘密値は復活しない', async () => {
    open(`#access_token=${SECRET}&type=email_change`);
    window.location.hash = EXPIRED;
    await vi.waitFor(() => expect(shown().state).toBe('expired'));

    window.history.back();
    await vi.waitFor(() => expect(shown().state).toBe('confirmed'));
    expectCleanUrl();
    window.history.forward();
    await vi.waitFor(() => expect(shown().state).toBe('expired'));
    expectCleanUrl();
  });

  it('履歴に残した種別が不正なら結果不明として扱う', () => {
    open('');
    window.history.replaceState({ authResult: '<b>confirmed</b>' }, '', PAGE);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(shown().state).toBe('unknown');
  });

  it.each([
    ['hash', `#${EXPIRED}`],
    ['query', `?${EXPIRED}`],
  ])('失効したメールのリンク(%s)は成功と表示せず、固定文言で再登録を案内する', (_label, suffix) => {
    const page = open(suffix);
    expect(page.state).toBe('expired');
    expect(page.title).toBe('このリンクは使えません');
    expect(page.text).toContain('リンクの有効期限が切れているか、すでに使用されています。');
    expect(page.text).toContain('アプリからもう一度登録し、最新の確認メールのリンクを開いてください。');
    expect(page.text).not.toContain('確認を受け付けました');
    expect(page.text).not.toContain('Email link is invalid');
    expect(window.location.search + window.location.hash).toBe('');
  });

  it('エラーの説明文に入った文字列を画面へ出さず、HTMLとしても解釈しない', () => {
    const injected = encodeURIComponent('<img src=x onerror=alert(1)>攻撃文');
    const page = open(`?error=server_error&error_description=${injected}#access_token=${SECRET}`);
    expect(page.state).toBe('failed');
    expect(page.title).toBe('確認を完了できませんでした');
    expect(page.text).not.toContain('攻撃文');
    expect(document.querySelector('img')).toBeNull();
    expect(document.documentElement.outerHTML).not.toContain(SECRET);
  });

  it('認証結果が無いまま開かれても成功と表示しない', () => {
    for (const suffix of ['', '?type=signup', '#token_hash=abc&type=email_change']) {
      const page = open(suffix);
      expect(page.state).toBe('unknown');
      expect(page.title).toBe('確認結果を表示できません');
      expect(page.text).not.toContain('確認を受け付けました');
      expect(window.location.search + window.location.hash).toBe('');
    }
  });

  it('もう一方の確認が残る応答は、完了と表示しない', () => {
    const page = open('#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email');
    expect(page.state).toBe('more');
    expect(page.title).toBe('確認はまだ完了していません');
    expect(page.text).not.toContain('Confirmation link accepted');
  });

  it('日本語以外の端末には英語で案内する', () => {
    const page = open('#error=access_denied&error_code=otp_expired', ['fr-FR', 'ja-JP']);
    expect(document.documentElement.lang).toBe('en');
    expect(page.title).toBe('This link cannot be used');
    expect(page.text).toContain('register again from the app and open the link in the latest confirmation email.');
    expect(open(`#access_token=${SECRET}&type=signup`, ['en-US']).title).toBe(
      'Your email confirmation was accepted',
    );
  });
});

describe('vite.config.ts の Service Worker 設定', () => {
  const config = readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf8');
  const denylist = new Function(
    `return [${/navigateFallbackDenylist:\s*\[(.*)\],/.exec(config)![1]}]`,
  )() as RegExp[];
  // workbox の NavigationRoute と同じく pathname + search で判定する。
  const fallsBack = (pathAndSearch: string) => !denylist.some((pattern) => pattern.test(pathAndSearch));

  it('受け皿への移動を index.html へ差し替えず、事前キャッシュにも入れない', () => {
    expect(fallsBack('/calendar-app/auth-confirmation.html')).toBe(false);
    expect(fallsBack(`/calendar-app/auth-confirmation.html?${EXPIRED}`)).toBe(false);
    expect(fallsBack('/auth-confirmation.html')).toBe(false);
    expect(fallsBack('/auth-confirmation.html?code=x')).toBe(false);
    expect(config).toMatch(/globIgnores:\s*\[[^\]]*'\*\*\/auth-confirmation\.html'/);
  });

  it('既存の /api 除外と、アプリ画面の index.html への差し替えは保つ', () => {
    expect(fallsBack('/api/health')).toBe(false);
    expect(fallsBack('/settings')).toBe(true);
    expect(fallsBack('/auth')).toBe(true);
    expect(fallsBack('/calendar-app/')).toBe(true);
    expect(fallsBack('/auth-confirmation.html.bak')).toBe(true);
  });
});
