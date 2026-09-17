import { t, useLanguage } from '@/i18n';
import { useState } from 'react';
import { Screen } from '@/ui/Screen';
import { resolveMessage } from '@/data/messages';
import { useSecretMode } from '@/app/secret-mode-context';
/**
 * シークレットモードの設定画面(タブ外、spec-secret-mode)。
 * `hasPasscode===false` ならまずパスコード設定フォームだけを出す(解除トグルは出さない、
 * I/O & Edge-Case Matrix)。設定済みなら「ロック中/解除中」のON/OFFトグル
 * (OFF→ON はパスコード入力必須、ON→OFF は即座)を出す。
 * 「パスコードを変更」導線は `unlocked===true` のときだけ出す(レビュー指摘: ロック中でも
 * 出してしまうと、現行パスコードの確認なしに新パスコードを設定してそのまま解除できてしまい、
 * 機能の意味が無くなる)。
 * 真実源は `useSecretMode()`(AppShell の `SecretModeProvider` 配下)。
 */
export function SecretModeSettingsScreen() {
  useLanguage();
  const { hasPasscode, unlocked, errorKey, unlock, lock, setPasscode, dismissError } =
    useSecretMode();
  // 初回パスコード設定用(hasPasscode===false のときだけ使う)。
  const [setupInput, setSetupInput] = useState('');
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  // 「解除する」入力欄 / 「パスコードを変更」フォームは排他(同時に2つ出さない)。
  const [activeForm, setActiveForm] = useState<'none' | 'unlock' | 'change'>('none');
  const [formInput, setFormInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const closeForm = () => {
    setActiveForm('none');
    setFormInput('');
    dismissError();
  };
  if (!hasPasscode) {
    return (
      <Screen title={t('シークレットモード')}>
        <p className="text-meta text-ink-secondary">
          {t('見せたくない予定を隠せます。まずロック解除用のパスコードを設定してください。')}
        </p>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (setupSubmitting) return;
            setSetupSubmitting(true);
            const ok = await setPasscode(setupInput);
            setSetupSubmitting(false);
            if (ok) setSetupInput('');
          }}
        >
          <label className="flex flex-col gap-1">
            <span className="text-meta text-ink-secondary">
              {t('パスコード(4〜8文字の半角英数字)')}
            </span>
            <input
              type="password"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              maxLength={8}
              value={setupInput}
              onChange={(e) => {
                setSetupInput(e.target.value);
                dismissError();
              }}
              className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
            />
          </label>

          {errorKey && (
            <p role="alert" className="text-meta text-danger">
              {resolveMessage(errorKey)}
            </p>
          )}

          <button
            type="submit"
            disabled={setupSubmitting || setupInput.trim() === ''}
            className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
          >
            {setupSubmitting ? t('設定中…') : t('パスコードを設定する')}
          </button>
        </form>
      </Screen>
    );
  }
  return (
    <Screen title={t('シークレットモード')}>
      <section aria-labelledby="secret-mode-heading">
        <h2 id="secret-mode-heading" className="text-body font-semibold text-ink-primary">
          {t('表示')}
        </h2>
        <div
          role="radiogroup"
          aria-labelledby="secret-mode-heading"
          className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!unlocked}
            disabled={submitting}
            onClick={() => {
              // 再ロックはパスコード不要で即座に(spec Design Notes)。
              lock();
              setActiveForm('none');
              setFormInput('');
              dismissError();
            }}
            className={[
              'flex min-h-11 w-full items-center justify-between px-4 text-left text-body',
              !unlocked ? 'text-accent' : 'text-ink-primary',
            ].join(' ')}
          >
            <span>{t('ロック中(隠す)')}</span>
            {!unlocked && <span aria-hidden="true">✓</span>}
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={unlocked}
            disabled={submitting}
            onClick={() => {
              if (unlocked) return;
              // 解除は必ずパスコード入力を要求する(spec Design Notes)。
              setActiveForm('unlock');
              setFormInput('');
              dismissError();
            }}
            className={[
              'flex min-h-11 w-full items-center justify-between border-t border-border-hairline px-4 text-left text-body',
              unlocked ? 'text-accent' : 'text-ink-primary',
            ].join(' ')}
          >
            <span>{t('解除中(表示)')}</span>
            {unlocked && <span aria-hidden="true">✓</span>}
          </button>
        </div>

        {activeForm === 'unlock' && (
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (submitting) return;
              setSubmitting(true);
              const ok = await unlock(formInput);
              setSubmitting(false);
              // 誤りだった場合も含め、パスコードの入力値は毎回クリアする(平文を画面に残さない)。
              setFormInput('');
              if (ok) setActiveForm('none');
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-meta text-ink-secondary">{t('パスコード')}</span>
              <input
                type="password"
                inputMode="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                maxLength={8}
                value={formInput}
                onChange={(e) => setFormInput(e.target.value)}
                className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || formInput.trim() === ''}
                className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
              >
                {submitting ? t('確認中…') : t('解除する')}
              </button>
              <button
                type="button"
                onClick={closeForm}
                className="min-h-11 px-4 text-body text-ink-secondary"
              >
                {t('キャンセル')}
              </button>
            </div>
          </form>
        )}

        {errorKey && activeForm !== 'change' && (
          <p role="alert" className="mt-3 text-meta text-danger">
            {resolveMessage(errorKey)}
          </p>
        )}
      </section>

      {unlocked && (
        <section className="mt-6">
          {activeForm !== 'change' ? (
            <button
              type="button"
              onClick={() => {
                setActiveForm('change');
                setFormInput('');
                dismissError();
              }}
              className="min-h-11 text-body text-accent"
            >
              {t('パスコードを変更')}
            </button>
          ) : (
            <form
              className="flex flex-col gap-3"
              onSubmit={async (e) => {
                e.preventDefault();
                if (submitting) return;
                setSubmitting(true);
                const ok = await setPasscode(formInput);
                setSubmitting(false);
                if (ok) {
                  setActiveForm('none');
                  setFormInput('');
                }
              }}
            >
              <label className="flex flex-col gap-1">
                <span className="text-meta text-ink-secondary">
                  {t('新しいパスコード(4〜8文字の半角英数字)')}
                </span>
                <input
                  type="password"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  maxLength={8}
                  value={formInput}
                  onChange={(e) => setFormInput(e.target.value)}
                  className="min-h-11 rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
                />
              </label>

              {errorKey && (
                <p role="alert" className="text-meta text-danger">
                  {resolveMessage(errorKey)}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={submitting || formInput.trim() === ''}
                  className="min-h-11 rounded-sm bg-accent px-4 text-body font-semibold text-on-accent disabled:opacity-60"
                >
                  {submitting ? t('保存中…') : t('保存する')}
                </button>
                <button
                  type="button"
                  onClick={closeForm}
                  className="min-h-11 px-4 text-body text-ink-secondary"
                >
                  {t('キャンセル')}
                </button>
              </div>
            </form>
          )}
        </section>
      )}
    </Screen>
  );
}
