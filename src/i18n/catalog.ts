import en from './en.json';
import zh from './zh.json';
import ko from './ko.json';
import es from './es.json';
import fr from './fr.json';
import keys from './source-keys.json';

const dictionaries: Record<string, string>[] = [en, zh, ko, es, fr];
export const catalog: Record<string, readonly [string, string, string, string, string]> =
  Object.fromEntries(
    keys.map((key) => [
      key,
      dictionaries.map((dictionary) => dictionary[key] ?? key) as [
        string,
        string,
        string,
        string,
        string,
      ],
    ]),
  );
