package jp.ryo.multicalendar;

import android.Manifest;
import org.junit.Test;
import static org.junit.Assert.*;

/** 端末内で完結する純粋な判定だけを検査する(JVM 単体テスト。実機・connected 系は使わない)。 */
public class DevicePhotosPluginTest {
    @Test
    public void 全部許可は撮影前の履歴に関わらずgrantedになる() {
        assertEquals("granted", DevicePhotosPlugin.resolveStatus(34, true, false, false, false));
        assertEquals("granted", DevicePhotosPlugin.resolveStatus(33, true, false, true, false));
        assertEquals("granted", DevicePhotosPlugin.resolveStatus(32, true, false, true, true));
    }

    @Test
    public void 一部許可はAndroid14以上でだけlimitedになる() {
        assertEquals("limited", DevicePhotosPlugin.resolveStatus(34, false, true, true, false));
        assertEquals("limited", DevicePhotosPlugin.resolveStatus(35, false, true, false, false));
        // 13 以下に「選択した写真」の権限は存在しない。
        assertEquals("prompt", DevicePhotosPlugin.resolveStatus(33, false, true, false, false));
    }

    @Test
    public void 未要求は許可を求められ_拒否後は再説明が出せるうちはpromptで出せなくなるとdenied() {
        assertEquals("prompt", DevicePhotosPlugin.resolveStatus(34, false, false, false, false));
        assertEquals("prompt", DevicePhotosPlugin.resolveStatus(34, false, false, true, true));
        assertEquals("denied", DevicePhotosPlugin.resolveStatus(34, false, false, true, false));
    }

    @Test
    public void 要求する権限はOS版ごとに必要最小限になる() {
        assertArrayEquals(
            new String[] {Manifest.permission.READ_EXTERNAL_STORAGE},
            DevicePhotosPlugin.requestedPermissions(32));
        assertArrayEquals(
            new String[] {Manifest.permission.READ_MEDIA_IMAGES},
            DevicePhotosPlugin.requestedPermissions(33));
        assertArrayEquals(
            new String[] {
                Manifest.permission.READ_MEDIA_IMAGES,
                Manifest.permission.READ_MEDIA_VISUAL_USER_SELECTED
            },
            DevicePhotosPlugin.requestedPermissions(34));
    }

    @Test
    public void 縮小サイズは長辺をmaxSide以下に収め_小さい画像は拡大しない() {
        assertArrayEquals(new int[] {256, 192}, DevicePhotosPlugin.fitWithin(4000, 3000, 256));
        assertArrayEquals(new int[] {192, 256}, DevicePhotosPlugin.fitWithin(3000, 4000, 256));
        assertArrayEquals(new int[] {100, 50}, DevicePhotosPlugin.fitWithin(100, 50, 256));
        assertArrayEquals(new int[] {1, 256}, DevicePhotosPlugin.fitWithin(1, 4000, 256));
    }

    @Test
    public void 読み込み時の間引き率は縮小後も長辺がmaxSide以上に残る2の累乗になる() {
        assertEquals(1, DevicePhotosPlugin.sampleSizeFor(300, 200, 256));
        assertEquals(8, DevicePhotosPlugin.sampleSizeFor(4000, 3000, 256));
        assertEquals(1, DevicePhotosPlugin.sampleSizeFor(500, 500, 256));
    }

    @Test
    public void 画像IDは数字だけを受け付ける() {
        assertTrue(DevicePhotosPlugin.isValidMediaId("12345"));
        assertFalse(DevicePhotosPlugin.isValidMediaId(""));
        assertFalse(DevicePhotosPlugin.isValidMediaId("12/../3"));
        assertFalse(DevicePhotosPlugin.isValidMediaId(null));
    }
}
