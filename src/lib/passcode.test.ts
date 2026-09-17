import { describe, expect, it } from 'vitest';
import { hashPasscode, isValidPasscodeFormat } from './passcode';

describe('isValidPasscodeFormat', () => {
  it('数字4〜8桁を許可する', () => {
    expect(isValidPasscodeFormat('1234')).toBe(true);
    expect(isValidPasscodeFormat('12345678')).toBe(true);
    expect(isValidPasscodeFormat('0000')).toBe(true);
  });

  it('3桁以下は拒否する', () => {
    expect(isValidPasscodeFormat('123')).toBe(false);
    expect(isValidPasscodeFormat('')).toBe(false);
  });

  it('9桁以上は拒否する', () => {
    expect(isValidPasscodeFormat('123456789')).toBe(false);
  });

  it('半角英数字を許可し、空白・記号・全角は拒否する', () => {
    expect(isValidPasscodeFormat('12a4')).toBe(true);
    expect(isValidPasscodeFormat('AbCd1234')).toBe(true);
    expect(isValidPasscodeFormat('Ab!4')).toBe(false);
    expect(isValidPasscodeFormat('12 4')).toBe(false);
    expect(isValidPasscodeFormat('１２３４')).toBe(false); // 全角
  });
});

describe('hashPasscode', () => {
  it('SHA-256 の hex 文字列(64文字)を返す', async () => {
    const hash = await hashPasscode('1234');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('同じ入力は常に同じハッシュになる', async () => {
    expect(await hashPasscode('1234')).toBe(await hashPasscode('1234'));
  });

  it('異なる入力は異なるハッシュになる', async () => {
    expect(await hashPasscode('1234')).not.toBe(await hashPasscode('5678'));
  });

  it('既知の SHA-256 値と一致する', async () => {
    // echo -n "1234" | sha256sum
    expect(await hashPasscode('1234')).toBe(
      '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
    );
  });
});
