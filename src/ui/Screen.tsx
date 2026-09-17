import type { ReactNode } from 'react';

interface ScreenProps {
  title: string;
  /** 見出し右の補助アクション(任意)。 */
  action?: ReactNode;
  children?: ReactNode;
}

/**
 * 画面の共通スキャフォールド。スマホ縦・単一カラム。
 * 見出しバー + 縦スクロールする本文。下タブの高さぶんの余白を確保する。
 */
export function Screen({ title, action, children }: ScreenProps) {
  return (
    <div className="app-screen flex min-h-[100dvh] flex-col bg-surface-sunken animate-[fade-in_200ms_ease-out]">
      <header className="flex items-baseline justify-between px-4 pt-3 pb-4">
        <h1 className="text-title font-semibold text-ink-primary">{title}</h1>
        {action}
      </header>
      <main className="flex-1 overflow-y-auto px-4 pb-24">{children}</main>
    </div>
  );
}
