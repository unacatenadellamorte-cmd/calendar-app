import { describe, expect, it } from 'vitest';
import { deriveNotificationId } from './notification-id';

describe('deriveNotificationId', () => {
  it('同じ id なら常に同じ値を返す(決定的)', () => {
    const id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    expect(deriveNotificationId(id)).toBe(deriveNotificationId(id));
  });

  it('ハイフンを除いた先頭8桁hexを32bit整数として parse し、符号あり32bitへ変換する', () => {
    expect(deriveNotificationId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee')).toBe(-1431655766);
    expect(deriveNotificationId('550e8400-e29b-41d4-a716-446655440000')).toBe(1427014656);
    expect(deriveNotificationId('00000001-0000-0000-0000-000000000000')).toBe(1);
  });

  it('先頭8桁hexが同じなら、後続部分が違っても同じ値になる', () => {
    const a = deriveNotificationId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    const b = deriveNotificationId('aaaaaaaa-1111-2222-3333-444444444444');
    expect(a).toBe(b);
  });

  it('0x80000000 以上は符号あり32bitとして負値になる(| 0 の折り返し)', () => {
    expect(deriveNotificationId('ffffffff-ffff-ffff-ffff-ffffffffffff')).toBe(-1);
    expect(deriveNotificationId('80000000-0000-0000-0000-000000000000')).toBe(-2147483648);
  });

  it('parse 不能な hex(先頭が非16進文字)は 0 を返す', () => {
    expect(deriveNotificationId('zzzzzzzz-0000-0000-0000-000000000000')).toBe(0);
  });
});
