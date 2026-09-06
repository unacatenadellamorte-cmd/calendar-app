import { useCallback, useState } from 'react';
import {
  looksLikeEmail,
  signInWithPassword,
  signUpWithPassword,
  upgradeToPassword,
} from '@/data/auth';

export type AuthMode = 'signin' | 'signup';

interface UseAuthFormOptions {
  /** 匿名セッション中か。true のとき signup は「昇格」(updateUser)になる。 */
  isGuest: boolean;
  /** 成功時に呼ばれる(画面遷移など)。 */
  onSuccess?: () => void;
}

interface AuthFormState {
  mode: AuthMode;
  email: string;
  password: string;
  submitting: boolean;
  /** 表示すべきエラーの messageKey(無ければ null)。 */
  errorKey: string | null;
}

const PASSWORD_MIN = 6;

export function useAuthForm({ isGuest, onSuccess }: UseAuthFormOptions) {
  const [form, setForm] = useState<AuthFormState>({
    mode: 'signin',
    email: '',
    password: '',
    submitting: false,
    errorKey: null,
  });

  const setMode = useCallback((mode: AuthMode) => {
    setForm((f) => ({ ...f, mode, errorKey: null }));
  }, []);

  const setEmail = useCallback((email: string) => {
    setForm((f) => ({ ...f, email, errorKey: null }));
  }, []);

  const setPassword = useCallback((password: string) => {
    setForm((f) => ({ ...f, password, errorKey: null }));
  }, []);

  const submit = useCallback(async () => {
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

    setForm((f) => ({ ...f, submitting: true, errorKey: null }));

    const result =
      mode === 'signup'
        ? isGuest
          ? await upgradeToPassword(email, password)
          : await signUpWithPassword(email, password)
        : await signInWithPassword(email, password);

    if (result.ok) {
      setForm((f) => ({ ...f, submitting: false, password: '' }));
      onSuccess?.();
    } else {
      setForm((f) => ({ ...f, submitting: false, errorKey: result.error.messageKey }));
    }
  }, [form, isGuest, onSuccess]);

  return { form, setMode, setEmail, setPassword, submit };
}
