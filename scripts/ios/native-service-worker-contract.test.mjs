import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertSelfDestroyingServiceWorker } from '../native-service-worker-contract.mjs';

test('自己破棄Service Workerの登録解除とキャッシュ削除を検証する', () => {
  assert.doesNotThrow(() => assertSelfDestroyingServiceWorker(
    'self.registration.unregister(); self.caches.keys(); self.caches.delete(name);',
  ));
  assert.throws(() => assertSelfDestroyingServiceWorker('self.registration.unregister();'));
});

