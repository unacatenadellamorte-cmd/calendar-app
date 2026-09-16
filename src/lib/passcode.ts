/**
 * シークレットモードのパスコード(数字4〜8桁のPIN)の純関数(新規 npm 依存を追加しない、
 * `src/lib/image.ts` と同じ方針)。ハッシュ化は Web Crypto の `crypto.subtle.digest` を使う。
 * 平文パスコードはどこにも保持・送信しない(spec Always)。
 */

/** パスコードの形式(数字4〜8桁)。PIN形式に限定する(spec Design Notes)。 */
export function isValidPasscodeFormat(passcode: string): boolean {
  return /^\d{4,8}$/.test(passcode);
}

/** パスコードを SHA-256 でハッシュ化し、hex 文字列(64文字)で返す。 */
export async function hashPasscode(passcode: string): Promise<string> {
  const data = new TextEncoder().encode(passcode);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
