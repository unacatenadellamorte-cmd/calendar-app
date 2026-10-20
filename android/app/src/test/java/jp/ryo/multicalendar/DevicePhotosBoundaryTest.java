package jp.ryo.multicalendar;

import android.content.ContentResolver;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.CancellationSignal;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.junit.Test;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 実プラグインの公開APIへ呼び出し、OSとCapacitorの返却境界だけを模擬する。 */
public class DevicePhotosBoundaryTest {
    private PluginCall listCall() {
        JSObject data = mock(JSObject.class);
        // Webから届くJSON整数の表現を使い、実際のPluginCallの型変換を通す。
        when(data.opt("fromMs")).thenReturn(1792422000000L);
        when(data.opt("toMs")).thenReturn(1792508400000L);
        when(data.opt("offset")).thenReturn(0);
        when(data.opt("limit")).thenReturn(40);
        PluginCall call = spy(new PluginCall(null, "DevicePhotos", "検証", "listAssets", data));
        doNothing().when(call).reject(anyString(), anyString());
        doNothing().when(call).resolve(any(JSObject.class));
        return call;
    }

    @Test
    public void ミリ秒のLong整数を受け取り_nullCursorは空一覧でなくエラーを返す() {
        Context context = mock(Context.class);
        ContentResolver resolver = mock(ContentResolver.class);
        AppCompatActivity activity = mock(AppCompatActivity.class);
        when(context.getContentResolver()).thenReturn(resolver);
        when(context.getSharedPreferences(anyString(), anyInt())).thenReturn(mock(SharedPreferences.class));
        DevicePhotosPlugin plugin = new DevicePhotosPlugin() {
            @Override public Context getContext() { return context; }
            @Override public AppCompatActivity getActivity() { return activity; }
        };
        try (MockedStatic<ContextCompat> permissions = mockStatic(ContextCompat.class);
             MockedStatic<ActivityCompat> rationale = mockStatic(ActivityCompat.class);
             MockedConstruction<CancellationSignal> signals = mockConstruction(CancellationSignal.class)) {
            permissions.when(() -> ContextCompat.checkSelfPermission(any(), anyString())).thenReturn(PackageManager.PERMISSION_GRANTED);
            PluginCall call = listCall();
            plugin.listAssets(call);
            verify(call, timeout(2000)).reject(anyString(), eq("unavailable"));
            verify(call, never()).reject(anyString(), eq("invalid-arguments"));
            verify(call, never()).resolve(any(JSObject.class));
        } finally { plugin.handleOnDestroy(); }
    }

    @Test
    public void 一覧検索の応答前に取消でき_OSへ中断を渡して一度だけ完了する() throws Exception {
        Context context = mock(Context.class);
        ContentResolver resolver = mock(ContentResolver.class);
        AppCompatActivity activity = mock(AppCompatActivity.class);
        when(context.getContentResolver()).thenReturn(resolver);
        when(context.getSharedPreferences(anyString(), anyInt())).thenReturn(mock(SharedPreferences.class));
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch released = new CountDownLatch(1);
        when(resolver.query(any(), any(), any(), any(), any(), any(CancellationSignal.class))).thenAnswer(invocation -> {
            entered.countDown();
            released.await(3, TimeUnit.SECONDS);
            return null;
        });
        DevicePhotosPlugin plugin = new DevicePhotosPlugin() {
            @Override public Context getContext() { return context; }
            @Override public AppCompatActivity getActivity() { return activity; }
        };
        try (MockedStatic<ContextCompat> permissions = mockStatic(ContextCompat.class);
             MockedStatic<ActivityCompat> rationale = mockStatic(ActivityCompat.class);
             MockedConstruction<CancellationSignal> signals = mockConstruction(CancellationSignal.class)) {
            permissions.when(() -> ContextCompat.checkSelfPermission(any(), anyString())).thenReturn(PackageManager.PERMISSION_GRANTED);
            PluginCall call = listCall();
            plugin.listAssets(call);
            assertTrue(entered.await(2, TimeUnit.SECONDS));
            plugin.cancelLoads(mock(PluginCall.class));
            verify(call).reject(anyString(), eq("cancelled"));
            verify(signals.constructed().get(0)).cancel();
            released.countDown();
            verify(call, after(100).times(1)).reject(anyString(), anyString());
            verify(call, never()).resolve(any(JSObject.class));
        } finally {
            released.countDown();
            plugin.handleOnDestroy();
        }
    }
}
