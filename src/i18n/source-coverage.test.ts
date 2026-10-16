// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import sourceKeys from './source-keys.json';

it('5言語の実辞書のキーを完全一致させ、代替表示に欠落を隠さない', () => {
  for (const language of ['en', 'zh', 'ko', 'es', 'fr']) {
    const dictionary = JSON.parse(readFileSync(`src/i18n/${language}.json`, 'utf8')) as Record<
      string,
      string
    >;
    expect(Object.keys(dictionary).sort(), language).toEqual([...sourceKeys].sort());
  }
});

it('アプリ内のすべてのt文字列リテラルが辞書へ登録されている', () => {
  const known = new Set<string>(sourceKeys);
  const missing: string[] = [];
  function scan(directory: string): void {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory()) scan(path);
      else if (/\.tsx?$/.test(item.name) && !/\.(test|spec)\./.test(item.name)) {
        const file = ts.createSourceFile(
          path,
          readFileSync(path, 'utf8'),
          ts.ScriptTarget.Latest,
          true,
        );
        function visit(node: ts.Node): void {
          if (
            ts.isCallExpression(node) &&
            ts.isIdentifier(node.expression) &&
            node.expression.text === 't'
          ) {
            const key = node.arguments[0];
            if (key && ts.isStringLiteralLike(key) && !known.has(key.text))
              missing.push(`${path}: ${key.text}`);
          }
          ts.forEachChild(node, visit);
        }
        visit(file);
      }
    }
  }
  scan('src');
  expect(missing).toEqual([]);
});
