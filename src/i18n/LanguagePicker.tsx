import { useState } from 'react';
import { isLanguage, languages, setLanguage, t, useLanguage } from './index';

export function LanguagePicker() {
  const language = useLanguage();
  const [failed, setFailed] = useState(false);
  return (
    <div>
      <label className="flex flex-col gap-1">
        <span className="text-meta text-ink-secondary">{t('表示言語')} / Language</span>
        <select
          value={language}
          aria-label="Language"
          className="min-h-11 w-full rounded-sm border border-border-hairline bg-surface-base px-3 text-body"
          onChange={(event) => {
            const next = event.target.value;
            if (isLanguage(next)) setFailed(!setLanguage(next));
          }}
        >
          {languages.map((item) => (
            <option key={item.code} value={item.code} lang={item.code}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <p className="mt-1 text-meta text-ink-secondary">
        {t('この端末の表示言語です。変更はすぐに保存されます。')}
      </p>
      {failed && (
        <p role="alert" className="text-meta text-danger">
          {t('言語を保存できませんでした。もう一度お試しください。')}
        </p>
      )}
    </div>
  );
}
