import { t, useLanguage } from '@/i18n';
import { readMapApp, setMapApp, type MapApp } from '@/platform/externalLinks';
import { useState } from 'react';

const OPTIONS: { value: MapApp; label: string }[] = [
  { value: 'google', label: 'Google Maps' },
  { value: 'apple', label: 'Apple Maps' },
  { value: 'system', label: '標準の地図アプリ' },
];

export function MapAppSection() {
  useLanguage();
  const [value, setValue] = useState<MapApp>(() => readMapApp());
  return (
    <section aria-labelledby="map-app-heading" className="mt-6">
      <h2 id="map-app-heading" className="text-body font-semibold text-ink-primary">
        {t('地図アプリ')}
      </h2>
      <div role="radiogroup" aria-labelledby="map-app-heading" className="mt-3 overflow-hidden rounded-md border border-border-hairline bg-surface-raised">
        {OPTIONS.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => { setValue(option.value); setMapApp(option.value); }}
            className={["flex min-h-11 w-full items-center justify-between px-4 text-left text-body", index > 0 ? 'border-t border-border-hairline' : '', value === option.value ? 'text-accent' : 'text-ink-primary'].join(' ')}
          >
            {t(option.label)}
            {value === option.value && <span aria-hidden="true">✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
