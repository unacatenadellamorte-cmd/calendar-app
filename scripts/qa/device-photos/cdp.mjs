// 検証専用エミュレーターの当アプリWebViewだけへ接続する。実機・他アプリには接続しない。
import { execFileSync } from 'node:child_process';
const serial = 'emulator-5580';
const adb = `${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const shell = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8' }).trim();
if (shell('shell', 'getprop', 'ro.kernel.qemu') !== '1') throw new Error('実機には接続しません。');
if (shell('shell', 'getprop', 'ro.boot.qemu.avd_name') !== 'MultiCalendar_Photos_20261020') throw new Error('検証専用端末ではありません。');
const pid = shell('shell', 'pidof', 'jp.ryo.multicalendar');
if (!/^\d+$/.test(pid)) throw new Error('対象アプリを起動してください。');
shell('forward', 'tcp:9229', `localabstract:webview_devtools_remote_${pid}`);
const pages = await (await fetch('http://127.0.0.1:9229/json/list')).json();
const page = pages.find(page => page.type === 'page' && page.url.startsWith('https://localhost/'));
if (!page) throw new Error('対象のWebViewが見つかりません。');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
const expression = process.argv[2];
if (!expression) throw new Error('検証する式が必要です。');
let nextId = 0;
const calls = new Map();
ws.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const pending = calls.get(message.id);
  if (!pending) return;
  calls.delete(message.id);
  clearTimeout(pending.timeout);
  if (message.error || message.result.exceptionDetails) pending.reject(new Error('端末側の検証式が失敗しました。' + (message.result?.exceptionDetails?.exception?.description?.split('\n')[0] ?? '')));
  else pending.resolve(message.result);
};
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++nextId;
  const timeout = setTimeout(() => { calls.delete(id); reject(new Error('端末の応答待ちが時間切れになりました。')); }, 30000);
  calls.set(id, { resolve, reject, timeout });
  ws.send(JSON.stringify({ id, method, params }));
});
try {
  if (process.argv[3] === '--gc') await command('HeapProfiler.collectGarbage');
  const response = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(response.result.value));
} finally { ws.close(); }
