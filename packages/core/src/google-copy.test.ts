import { expect, it } from 'vitest';
import { isOwnGoogleCopy } from './google-events';

it('再接続後も本人の反映コピーだけを除外し、共有先の他人のコピーは残す', () => {
  const raw = {
    id: 'remote',
    extendedProperties: { private: { multiCalendarEventId: 'local-a' } },
  };
  expect(isOwnGoogleCopy(raw, new Set(['local-a']))).toBe(true);
  expect(isOwnGoogleCopy(raw, new Set(['local-b']))).toBe(false);
  expect(isOwnGoogleCopy({ id: 'remote' }, new Set(['local-a']))).toBe(false);
  expect(
    isOwnGoogleCopy(
      { extendedProperties: { private: { multiCalendarEventId: 123 } } },
      new Set(['123']),
    ),
  ).toBe(false);
});
