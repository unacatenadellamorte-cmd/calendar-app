import { useEffect, useRef, useState } from 'react';
import { t, useLanguage } from '@/i18n';

const pages = [
  {
    title: '予定をカレンダーに登録',
    body: '「＋予定」から予定を登録できます。日付を長押しすると、その日の予定を追加できます。',
    tips: [
      '日付をタップすると、その日の予定を確認できます。',
      '月・日・リストなど、見たい表示に切り替えられます。',
    ],
  },
  {
    title: 'シフトはひな形でかんたんに',
    body: 'よく使う勤務時間を「お気に入りシフト」に登録しておくと、日付を選んでシフトを追加できます。',
    tips: [
      '「＋シフト」からシフト入力を開きます。',
      '勤務時間や時給を設定すると、給料見込みも確認できます。',
    ],
  },
  {
    title: 'タグとスタンプで見分けやすく',
    body: '「設定」→「予定タグ」で、スタンプ・予定名称・色・時間をひな形として登録できます。',
    tips: [
      '予定を追加するときにタグを選ぶと、登録した内容を呼び出せます。',
      'スタンプがあれば予定名称は空欄でも登録でき、カレンダーでは絵だけで表示できます。',
    ],
  },
  {
    title: 'Google接続とアプリの登録は別',
    body: '予定やシフトはゲストでも使えます。Googleカレンダーを接続するには、アプリのアカウント登録・ログインが必要です。',
    tips: [
      '最初に設定するプロフィールの名前は、アカウント登録とは別です。',
      '「設定」のアカウント欄で登録・ログインしてから、Googleアカウントを接続します。',
    ],
  },
  {
    title: '取り込みと予定反映を使い分ける',
    body: '「取り込み」はGoogleの予定をアプリで見る機能。「予定反映」はアプリで作った予定をGoogleへ送る有料機能です。',
    tips: [
      '反映には対応プランとGoogleへの書き込み許可が必要です。',
      '「設定」→「カレンダーの並び順」→対象カレンダーの「Googleへの予定反映」で反映先を選び、「この反映先を保存」を押します。',
      '接続・購入だけでは反映は始まりません。シークレット予定はGoogleへ送りません。',
    ],
  },
] as const;

/** 説明のための線画。操作ボタンや個人データを含めず、認可も開始しない。 */
function Illustration({ page }: { page: number }) {
  return (
    <svg
      viewBox="0 0 120 96"
      aria-hidden="true"
      className="h-24 w-32 text-accent"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {page === 0 ? (
        <>
          <rect x="25" y="18" width="70" height="62" rx="9" />
          <path d="M25 36h70M42 12v14M78 12v14M48 57h24M60 45v24" />
        </>
      ) : page === 1 ? (
        <>
          <circle cx="60" cy="48" r="32" />
          <path d="M60 28v22l16 10M22 18l-8 9M98 18l8 9" />
        </>
      ) : page === 2 ? (
        <>
          <path d="M27 28h39l27 27-30 30-36-36Z" />
          <circle cx="42" cy="42" r="4" />
          <path d="m64 51 3 7 8 1-6 6 1 8-7-4-7 4 1-8-6-6 8-1Z" />
        </>
      ) : page === 3 ? (
        <>
          <circle cx="38" cy="31" r="12" />
          <path d="M17 73v-7a21 21 0 0 1 42 0v7M76 27h28v41H76M76 40h28M88 22v10M71 50H61m5-5-5 5 5 5" />
        </>
      ) : (
        <>
          <rect x="9" y="29" width="37" height="40" rx="6" />
          <rect x="74" y="29" width="37" height="40" rx="6" />
          <path d="M9 40h37M74 40h37M18 24v10M36 24v10M83 24v10M101 24v10M54 43h12m-5-5 5 5-5 5M66 58H54m5-5-5 5 5 5" />
        </>
      )}
    </svg>
  );
}

export function FirstRunTutorial({ onFinish }: { onFinish: () => void }) {
  useLanguage();
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const current = pages[page]!;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [page]);
  return (
    <section
      aria-label={t('使い方ガイド')}
      className="flex min-h-[calc(100dvh-4rem)] flex-col bg-surface-sunken px-4 py-4"
    >
      <header className="mx-auto flex w-full max-w-lg items-center justify-between gap-3">
        <h1 className="text-meta text-ink-secondary">{t('使い方ガイド')}</h1>
        <button
          type="button"
          onClick={onFinish}
          className="min-h-11 shrink-0 rounded-sm px-3 text-meta text-ink-secondary"
        >
          {t('スキップ')}
        </button>
      </header>
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-5 py-6">
        <div className="flex justify-center">
          <Illustration page={page} />
        </div>
        <p className="text-center text-meta tabular text-ink-secondary" role="status">
          {t('使い方 {0}/{1}', [page + 1, pages.length])}
        </p>
        <h2
          ref={heading}
          tabIndex={-1}
          className="text-title font-semibold text-ink-primary outline-none"
        >
          {t(current.title)}
        </h2>
        <p className="break-words text-body leading-relaxed text-ink-primary">
          {t(current.body)}
        </p>
        <ul className="flex flex-col gap-3 rounded-md border border-border-hairline bg-surface-raised p-4">
          {current.tips.map((tip) => (
            <li key={tip} className="break-words text-meta leading-relaxed text-ink-secondary">
              {t(tip)}
            </li>
          ))}
        </ul>
      </div>
      <footer className="mx-auto flex w-full max-w-lg gap-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => setPage((value) => Math.max(0, value - 1))}
          className="min-h-11 flex-1 rounded-sm border border-border-hairline px-4 text-body text-ink-primary disabled:opacity-40"
        >
          {t('前へ')}
        </button>
        <button
          type="button"
          onClick={() =>
            page === pages.length - 1 ? onFinish() : setPage((value) => value + 1)
          }
          className="min-h-11 flex-1 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent"
        >
          {page === pages.length - 1 ? t('使いはじめる') : t('次へ')}
        </button>
      </footer>
    </section>
  );
}
