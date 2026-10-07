import { useCallback, useEffect, useRef, useState } from 'react';
import {
  looksLikeEmail,
  signInWithPassword,
  signUpWithPassword,
  upgradeToPassword,
} from '@/data/auth';

export type AuthMode = 'signin' | 'signup';

interface UseAuthFormOptions {
  initialMode?: AuthMode;
  /** 匿名セッション中か。true のとき signup は「昇格」(updateUser)になる。 */
  isGuest: boolean;
  /** 成功時に呼ばれる(画面遷移など)。確認メール待ちでは呼ばない。 */
  onSuccess?: () => void;
}

interface AuthFormState {
  mode: AuthMode;
  email: string;
  password: string;
  submitting: boolean;
  /** 表示すべきエラーの messageKey(無ければ null)。 */
  errorKey: string | null;
  /** 確認メールの送信先。null 以外の間は確認待ちの案内を出す。 */
  pendingEmail: string | null;
}

const PASSWORD_MIN = 6;
/** 同じ宛先へ確認メールを出し直せるまでの間隔(Supabase の既定の送信間隔に合わせる)。 */
const RESEND_COOLDOWN_MS = 60_000;

export function useAuthForm({
  isGuest,
  onSuccess,
  initialMode = 'signin',
}: UseAuthFormOptions) {
  const [form, setForm] = useState<AuthFormState>({
    mode: initialMode,
    email: '',
    password: '',
    submitting: false,
    errorKey: null,
    pendingEmail: null,
  });
  /** 送信中は入力・モード変更・再送信を受け付けない(state の反映を待たずに判定する)。 */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  /** 直近に確認メールを送った宛先と時刻。メモリ上だけに持つ。 */
  const lastSent = useRef<{ email: string; at: number } | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const setMode = useCallback((mode: AuthMode) => {
    if (inFlight.current) return;
    setForm((f) => ({ ...f, mode, errorKey: null, pendingEmail: null }));
  }, []);

  const setEmail = useCallback((email: string) => {
    if (inFlight.current) return;
    setForm((f) => ({ ...f, email, errorKey: null }));
  }, []);

  const setPassword = useCallback((password: string) => {
    if (inFlight.current) return;
    setForm((f) => ({ ...f, password, errorKey: null }));
  }, []);

  /** 確認待ちから、別のメールアドレスでの登録に戻る。 */
  const changeEmail = useCallback(() => {
    if (inFlight.current) return;
    setForm((f) => ({ ...f, mode: 'signup', email: '', errorKey: null, pendingEmail: null }));
  }, []);

  const submit = useCallback(async () => {
    if (inFlight.current) return;
    const email = form.email.trim();
    const { password, mode } = form;

    if (!looksLikeEmail(email)) {
      setForm((f) => ({ ...f, errorKey: 'auth/invalid-email' }));
      return;
    }
    if (password.length < PASSWORD_MIN) {
      setForm((f) => ({ ...f, errorKey: 'auth/weak-password' }));
      return;
    }
    const sent = lastSent.current;
    if (
      mode === 'signup' &&
      sent?.email === email.toLowerCase() &&
      Date.now() - sent.at < RESEND_COOLDOWN_MS
    ) {
      setForm((f) => ({ ...f, errorKey: 'auth/confirmation-recently-sent' }));
      return;
    }

    inFlight.current = true;
    setForm((f) => ({ ...f, submitting: true, errorKey: null }));

    let errorKey: string | null = null;
    let pendingEmail: string | null = null;
    try {
      if (mode === 'signup') {
        const result = isGuest
          ? await upgradeToPassword(email, password)
          : await signUpWithPassword(email, password);
        if (!result.ok) errorKey = result.error.messageKey;
        else if (result.value.status === 'confirmation-pending')
          pendingEmail = result.value.email;
      } else {
        const result = await signInWithPassword(email, password);
        if (!result.ok) errorKey = result.error.messageKey;
      }
    } catch {
      errorKey = 'auth/unknown';
    } finally {
      inFlight.current = false;
    }
    if (!mounted.current) return;

    if (errorKey) {
      setForm((f) => ({ ...f, submitting: false, errorKey }));
    } else if (pendingEmail) {
      lastSent.current = { email: pendingEmail.toLowerCase(), at: Date.now() };
      setForm((f) => ({ ...f, submitting: false, password: '', pendingEmail }));
    } else {
      setForm((f) => ({ ...f, submitting: false, password: '' }));
      onSuccess?.();
    }
  }, [form, isGuest, onSuccess]);

  return { form, setMode, setEmail, setPassword, changeEmail, submit };
}
