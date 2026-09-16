import { useCallback, useState, type ReactNode } from 'react';
import { hashPasscode, isValidPasscodeFormat } from '@/lib/passcode';
import { SecretModeContext, type SecretModeState } from './secret-mode-context';

interface SecretModeProviderProps {
  children: ReactNode;
  /** 真実源は AppShell の単一 `useProfile()`(Part Aの反省、Design Notes)。 */
  passcodeHash: string | null;
  onChangePasscodeHash: (hash: string | null) => Promise<boolean>;
}

/**
 * シークレットモードの解除状態を配信する(spec-secret-mode)。
 * `unlocked` は `useState(false)` のみで保持し、**永続化しない**(アプリ起動・リロードの
 * たびに必ずロックへ戻る、spec Always)。パスコードハッシュ自体はここでは持たず、
 * props(`passcodeHash`/`onChangePasscodeHash`)経由で AppShell の profile とやり取りする。
 * `unlock` はハッシュ比較のみでオフラインでも動く(DB往復不要)。
 */
export function SecretModeProvider({
  children,
  passcodeHash,
  onChangePasscodeHash,
}: SecretModeProviderProps) {
  const [unlocked, setUnlocked] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const unlock = useCallback(
    async (passcode: string) => {
      const hash = await hashPasscode(passcode);
      if (passcodeHash !== null && hash === passcodeHash) {
        setUnlocked(true);
        setErrorKey(null);
        return true;
      }
      setErrorKey('secret/incorrect-passcode');
      return false;
    },
    [passcodeHash],
  );

  // 再ロックはパスコード不要で即座に(spec Design Notes: 隠す側に認証を課さない非対称)。
  const lock = useCallback(() => {
    setUnlocked(false);
    setErrorKey(null);
  }, []);

  const setPasscode = useCallback(
    async (passcode: string) => {
      if (!isValidPasscodeFormat(passcode)) {
        setErrorKey('secret/invalid-passcode');
        return false;
      }
      const hash = await hashPasscode(passcode);
      const success = await onChangePasscodeHash(hash);
      if (success) setErrorKey(null);
      else setErrorKey('secret/save-failed');
      return success;
    },
    [onChangePasscodeHash],
  );

  const dismissError = useCallback(() => setErrorKey(null), []);

  const value: SecretModeState = {
    unlocked,
    hasPasscode: passcodeHash !== null,
    errorKey,
    unlock,
    lock,
    setPasscode,
    dismissError,
  };

  return <SecretModeContext.Provider value={value}>{children}</SecretModeContext.Provider>;
}
