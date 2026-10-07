import { describe, expect, it } from 'vitest';
import { applyEventTag } from './event-tag';
import { eventLabelColor, labelTextColor } from './event-label';
import { applyLanguage } from '@/i18n';

describe('タグの値の複写', () => {
  it('通常・月末・年末・うるう年の日付を保つ', () => {
    const tag = {
      allDay: false,
      name: '夜勤',
      color: '#009E73',
      startLocal: '22:00',
      endLocal: '06:00',
    };
    expect(applyEventTag(tag, '2026-09-30')?.endLocal).toBe('2026-10-01T06:00');
    expect(applyEventTag(tag, '2026-12-31')?.endLocal).toBe('2027-01-01T06:00');
    expect(applyEventTag(tag, '2028-02-28')?.endLocal).toBe('2028-02-29T06:00');
    expect(
      applyEventTag({ ...tag, startLocal: '09:00', endLocal: '10:00' }, '2026-09-30')
        ?.endLocal,
    ).toBe('2026-09-30T10:00');
    expect(applyEventTag(tag, '')).toBeNull();
    expect(applyEventTag(tag, '0099-12-31')?.endLocal).toBe('0100-01-01T06:00');
  });
  it('タグを後から変えても複写した値は変わらない', () => {
    const tag = {
      allDay: false,
      name: '会議',
      color: '#009E73',
      startLocal: '09:00',
      endLocal: '10:00',
    };
    const saved = applyEventTag(tag, '2026-09-25');
    tag.name = '新しい名前';
    tag.color = '#FFCC00';
    tag.startLocal = '11:00';
    expect(saved).toMatchObject({
      title: '会議',
      labelColor: '#009E73',
      startLocal: '2026-09-25T09:00',
    });
  });
  it('名称なしタグは内部件名を保ち、スタンプのみ表示する予定値へ複写する', () => {
    applyLanguage('en');
    const tag: {
      allDay: boolean;
      name: string;
      stampId: 'work' | 'meeting';
      color: string;
      startLocal: string;
      endLocal: string;
    } = {
      allDay: false,
      name: '',
      stampId: 'work',
      color: '#009E73',
      startLocal: '09:00',
      endLocal: '10:00',
    };
    const saved = applyEventTag(tag, '2026-09-25');
    expect(saved).toMatchObject({ title: 'Work', stampId: 'work', stampOnly: true });
    tag.stampId = 'meeting';
    expect(saved).toMatchObject({ title: 'Work', stampId: 'work' });
    expect(applyEventTag({ ...tag, name: '手入力の名称' }, '2026-09-25')).toMatchObject({
      title: '手入力の名称',
      stampOnly: false,
    });
    applyLanguage('ja');
  });
  it('外部色は上書きせず、明暗背景の文字を読みやすくする', () => {
    expect(
      eventLabelColor({ source: 'device', labelColor: '#FFCC00' }, { color: '#0072B2' }),
    ).toBe('#0072B2');
    expect(eventLabelColor({ source: 'local', labelColor: null }, { color: '#0072B2' })).toBe(
      '#0072B2',
    );
    expect(labelTextColor('#FFCC00')).toBe('#111827');
    expect(labelTextColor('#7B7B7B')).toBe('#000000');
    expect(labelTextColor('#0072B2')).toBe('#FFFFFF');
  });
});

it.each(['2026-09-30', '2026-12-31', '2028-02-29'])(
  '終日タグは選択日 %s と色・タイトルを複写する',
  (date) => {
    expect(
      applyEventTag(
        {
          allDay: true,
          name: '休み',
          color: '#009E73',
          startLocal: '09:00',
          endLocal: '18:00',
        },
        date,
      ),
    ).toMatchObject({ allDay: true, dateLocal: date, title: '休み', labelColor: '#009E73' });
  },
);
