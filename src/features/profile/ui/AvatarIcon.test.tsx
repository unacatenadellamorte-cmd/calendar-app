import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AvatarIcon } from './AvatarIcon';

describe('AvatarIcon', () => {
  it('avatarDataUrl があれば画像を表示する', () => {
    const { container } = render(
      <AvatarIcon displayName="花子" avatarDataUrl="data:image/jpeg;base64,x" />,
    );
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,x');
  });

  it('avatarDataUrl が無ければ名前の頭文字を表示する', () => {
    render(<AvatarIcon displayName="花子" avatarDataUrl={null} />);
    expect(screen.getByText('花')).toBeInTheDocument();
  });

  it('名前が空でも壊れない(? を表示)', () => {
    render(<AvatarIcon displayName="" avatarDataUrl={null} />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('size prop で寸法を変えられる', () => {
    const { container } = render(<AvatarIcon displayName="花子" avatarDataUrl={null} size={64} />);
    const el = container.firstChild as HTMLElement;
    expect(el.style.width).toBe('64px');
    expect(el.style.height).toBe('64px');
  });

  it('絵文字などサロゲートペアの先頭文字でも文字化けしない', () => {
    // '😀' は UTF-16 ではサロゲートペア(2コードユニット)。slice(0,1) だと壊れる。
    render(<AvatarIcon displayName="😀花子" avatarDataUrl={null} />);
    expect(screen.getByText('😀')).toBeInTheDocument();
  });

  it('画像の読み込みに失敗したら頭文字表示にフォールバックする', () => {
    const { container } = render(
      <AvatarIcon displayName="花子" avatarDataUrl="data:image/jpeg;base64,broken" />,
    );
    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    fireEvent.error(img!);
    expect(screen.getByText('花')).toBeInTheDocument();
    expect(container.querySelector('img')).toBeNull();
  });

  it('失敗後に avatarDataUrl が差し替えられたら、また画像表示を試みる', () => {
    const { container, rerender } = render(
      <AvatarIcon displayName="花子" avatarDataUrl="data:image/jpeg;base64,broken" />,
    );
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();

    rerender(<AvatarIcon displayName="花子" avatarDataUrl="data:image/jpeg;base64,new" />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'data:image/jpeg;base64,new');
  });
});
