import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthContext, type AuthContextValue } from '@/app/auth-context';
import { AuthScreen } from '@/features/auth/ui/AuthScreen';
import { GoogleSetupScreen } from '@/features/onboarding/ui/GoogleSetupScreen';
import { OnboardingScreen } from '@/features/profile/ui/OnboardingScreen';
import { FirstRunTutorial } from '@/features/tutorial/ui/FirstRunTutorial';
import { applyLanguage, t, type Language } from '@/i18n';
import { ok } from '@/data/result';
import '@/styles/global.css';

export default function Preview() {
  const [step, setStep] = useState(1);
  const [dark, setDark] = useState(false);
  const [large, setLarge] = useState(false);
  const [language, setLanguage] = useState<Language>('ja');
  useEffect(() => {
    applyLanguage(language);
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    document.documentElement.style.fontSize = large ? '24px' : '16px';
  }, [dark, large, language]);
  const auth: AuthContextValue = {
    state: step === 1 ? 'guest' : 'authenticated',
    session: null,
    email: null,
    signOut: async () => ok(undefined),
    deleteAccount: async () => ok(undefined),
  };
  return (
    <MemoryRouter>
      <AuthContext value={auth}>
        <div className="mx-auto max-w-2xl bg-surface-sunken text-ink-primary">
          <div className="flex flex-wrap items-center gap-3 border-b border-border-hairline p-3 text-meta">
            <p>確認用（実アカウント・通信なし）</p>
            <label>
              画面
              <select
                aria-label="確認する段階"
                value={step}
                onChange={(event) => setStep(Number(event.target.value))}
              >
                <option value="1">登録・ログイン</option>
                <option value="2">Google接続</option>
                <option value="3">ユーザー名</option>
                <option value="4">チュートリアル</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={dark}
                onChange={(event) => setDark(event.target.checked)}
              />
              暗い背景
            </label>
            <label>
              <input
                type="checkbox"
                checked={large}
                onChange={(event) => setLarge(event.target.checked)}
              />
              文字拡大
            </label>
            <label>
              言語
              <select
                aria-label="確認言語"
                value={language}
                onChange={(event) => setLanguage(event.target.value as Language)}
              >
                {['ja', 'en', 'fr', 'es', 'zh', 'ko'].map((code) => (
                  <option key={code}>{code}</option>
                ))}
              </select>
            </label>
          </div>
          {step <= 4 && (
            <p className="px-4 pt-4 text-meta text-ink-secondary">
              {t('初回設定 {0}/4', [step])} ·{' '}
              {t(['アプリアカウント', 'Google接続', 'ユーザー名', '使い方ガイド'][step - 1]!)}
            </p>
          )}
          {step === 1 ? (
            <AuthScreen initialMode="signup" onSuccess={() => setStep(2)} />
          ) : step === 2 ? (
            <GoogleSetupScreen onContinue={() => setStep(3)} />
          ) : step === 3 ? (
            <OnboardingScreen
              continueToTutorial
              errorKey={null}
              create={async () => {
                setStep(4);
                return true;
              }}
            />
          ) : step === 4 ? (
            <FirstRunTutorial onFinish={() => setStep(5)} />
          ) : (
            <h1 className="p-4">カレンダーへ（確認画面のみ）</h1>
          )}
        </div>
      </AuthContext>
    </MemoryRouter>
  );
}
createRoot(document.getElementById('root')!).render(<Preview />);
