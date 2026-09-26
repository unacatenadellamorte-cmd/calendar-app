package jp.ryo.multicalendar;

import android.app.Activity;
import android.text.TextUtils;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.util.Arrays;
import org.junit.Test;
import org.mockito.MockedConstruction;
import org.mockito.MockedStatic;
import static org.junit.Assert.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

public class GoogleAuthorizationPluginTest {
    @Test
    public void 取消でpendingを解除し次の認可成功を処理できる() throws Exception {
        // Androidの文字列・JSONとSDK応答だけを置換し、プラグインの状態遷移は実装を実行する。
        try (MockedStatic<TextUtils> textUtils = mockStatic(TextUtils.class);
             MockedConstruction<JSObject> objects = mockConstruction(JSObject.class);
             MockedConstruction<JSArray> arrays = mockConstruction(JSArray.class)) {
            GoogleAuthorizationPlugin plugin = new GoogleAuthorizationPlugin();
            Field pending = GoogleAuthorizationPlugin.class.getDeclaredField("pending");
            pending.setAccessible(true);
            PluginCall first = mock(PluginCall.class);
            pending.set(plugin, first);

            plugin.handleAuthorizationResult(new ActivityResult(Activity.RESULT_CANCELED, null));

            verify(first).reject(anyString(), eq("cancelled"));
            verify(first, never()).resolve(any(JSObject.class));
            assertNull(pending.get(plugin));
            // 同じ取消が遅れて届いても完了済みの呼び出しへ再通知しない。
            plugin.handleAuthorizationResult(new ActivityResult(Activity.RESULT_CANCELED, null));
            verify(first, times(1)).reject(anyString(), eq("cancelled"));

            PluginCall second = mock(PluginCall.class);
            pending.set(plugin, second);
            AuthorizationResult result = mock(AuthorizationResult.class);
            when(result.getServerAuthCode()).thenReturn("retry-code");
            when(result.getGrantedScopes()).thenReturn(Arrays.asList(
                "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
                "https://www.googleapis.com/auth/calendar.events.readonly"
            ));
            Method finish = GoogleAuthorizationPlugin.class.getDeclaredMethod("finish", AuthorizationResult.class);
            finish.setAccessible(true);
            finish.invoke(plugin, result);

            assertNull(pending.get(plugin));
            assertEquals(1, objects.constructed().size());
            assertEquals(1, arrays.constructed().size());
            JSObject response = objects.constructed().get(0);
            verify(response).put("code", "retry-code");
            verify(second).resolve(response);
            verify(second, never()).reject(anyString(), anyString());
            verify(first, never()).resolve(any(JSObject.class));
        }
    }
}
