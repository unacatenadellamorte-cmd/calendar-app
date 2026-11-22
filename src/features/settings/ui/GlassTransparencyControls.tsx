import { useId } from 'react';
import { t } from '@/i18n';
import { canRefractBackdrop } from '@/features/settings/model/glassRefraction';
import {
  GLASS_TRANSPARENCY_MAX,
  GLASS_TRANSPARENCY_MIN,
  useGlassTransparency,
} from '@/features/settings/model/glassAppearance';

interface SliderProps {
  label: string;
  value: number;
  onChange: (next: number) => void;
  /** 表示単位。屈折の強さは物理量ではないので%を付けない。 */
  unit?: '%' | '';
}

/** 0〜100のスライダー。ラベル・現在値・キーボード操作(矢印/PageUp/Home/End)を備える。 */
function TransparencySlider({ label, value, onChange, unit = '%' }: SliderProps) {
  const id = useId();
  const text = `${value}${unit}`;
  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-body text-ink-primary">
          {label}
        </label>
        <output htmlFor={id} className="text-body font-semibold tabular-nums text-ink-primary" aria-hidden="true">
          {text}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="glass-transparency-slider mt-1"
        min={GLASS_TRANSPARENCY_MIN}
        max={GLASS_TRANSPARENCY_MAX}
        step={1}
        value={value}
        aria-valuetext={text}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

/** テーマ「ガラス」選択時だけ表示する、アプリ/ウィジェットの透過度設定。 */
export function GlassTransparencyControls() {
  const { appTransparency, widgetTransparency, setAppTransparency, setWidgetTransparency, refraction, setRefraction } =
    useGlassTransparency();
  const refracts = canRefractBackdrop();
  return (
    <div
      className="mt-3 rounded-md border border-border-hairline bg-surface-raised"
      data-testid="glass-transparency-controls"
    >
      <TransparencySlider label={t('アプリの透過度')} value={appTransparency} onChange={setAppTransparency} />
      <div className="border-t border-border-hairline">
        <TransparencySlider
          label={t('ウィジェットの透過度')}
          value={widgetTransparency}
          onChange={setWidgetTransparency}
        />
      </div>
      <div className="border-t border-border-hairline">
        <TransparencySlider label={t('屈折の強さ')} value={refraction} onChange={setRefraction} unit="" />
      </div>
      <p className="border-t border-border-hairline px-4 py-3 text-meta text-ink-secondary">
        {t('透過度を下げるほど背景がぼけた、すりガラスになります。屈折の強さは縁で背景が曲がる量で、0で歪みません。文字・予定・入力欄は曲げずに残ります。')}
        {refracts ? null : (
          <>
            {' '}
            {t('この端末では背景の屈折を表示できないため、すりガラスと縁の反射で表現します。')}
          </>
        )}
      </p>
    </div>
  );
}
