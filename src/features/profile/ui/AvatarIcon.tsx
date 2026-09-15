import { useEffect, useState } from 'react';

interface AvatarIconProps {
  displayName: string;
  avatarDataUrl?: string | null;
  /** px 単位。既定は32(上部アイコン用)。編集画面プレビューは大きめの値を渡す。 */
  size?: number;
}

/** 名前の先頭1文字(コードポイント単位)。絵文字等のサロゲートペアでも文字化けしない。 */
function firstChar(name: string): string {
  const trimmed = name.trim();
  const [head] = trimmed; // 文字列の for...of / スプレッドは UTF-16 コードポイント単位で反復する
  return head ?? '?';
}

/**
 * 丸いアバター表示。写真があればそれを、無ければ名前の頭文字を丸背景に表示する。
 * 写真の読み込みに失敗した場合(壊れた data URI 等)も頭文字表示にフォールバックする。
 * 装飾専用(常に aria-hidden)。アクセシブルな名前は呼び出し側(リンク・ボタン)で付ける。
 */
export function AvatarIcon({ displayName, avatarDataUrl, size = 32 }: AvatarIconProps) {
  const [imgFailed, setImgFailed] = useState(false);

  // 写真が差し替えられたら、前の失敗状態を引きずらない。
  useEffect(() => {
    setImgFailed(false);
  }, [avatarDataUrl]);

  const initial = firstChar(displayName);
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(12, Math.round(size * 0.45)),
  };

  if (avatarDataUrl && !imgFailed) {
    return (
      <img
        src={avatarDataUrl}
        alt=""
        aria-hidden="true"
        style={style}
        className="shrink-0 rounded-full object-cover"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      style={style}
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-weak font-semibold text-accent"
    >
      {initial}
    </span>
  );
}
