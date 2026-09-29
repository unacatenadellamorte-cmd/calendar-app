package com.getcapacitor.community.admob.banner;

import android.app.Activity;
import android.content.Context;
import android.content.res.Resources;
import android.util.DisplayMetrics;
import android.view.View;
import android.widget.RelativeLayout;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import com.getcapacitor.PluginCall;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import org.junit.Test;
import org.mockito.verification.VerificationMode;

import static org.junit.Assert.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

public class BannerExecutorTest {
    @Test
    public void updateBannerPlacement_appliesPositionAndVisibilityForCurrentRequest() throws Exception {
        Fixture fixture = new Fixture(7);
        PluginCall call = fixture.call(7, 6, 7, true);

        fixture.executor.updateBannerPlacement(call);

        verify(fixture.params).setMargins(12, 14, 0, 0);
        verify(fixture.layout).setLayoutParams(fixture.params);
        verify(fixture.layout).setVisibility(View.VISIBLE);
        verifyMethod(fixture.adView, "resume");
        verifyMethod(fixture.adView, never(), "pause");
        verify(call).resolve();
    }

    @Test
    public void updateBannerPlacement_hidesAndPausesCurrentRequest() throws Exception {
        Fixture fixture = new Fixture(7);
        PluginCall call = fixture.call(7, 6, 7, false);

        fixture.executor.updateBannerPlacement(call);

        verify(fixture.layout).setVisibility(View.INVISIBLE);
        verifyMethod(fixture.adView, "pause");
        verifyMethod(fixture.adView, never(), "resume");
        verify(call).resolve();
    }

    @Test
    public void updateBannerPlacement_ignoresStaleRequestButResolvesCall() throws Exception {
        Fixture fixture = new Fixture(7);
        PluginCall call = fixture.call(8, 6, 7, true);

        fixture.executor.updateBannerPlacement(call);

        verify(fixture.params, never()).setMargins(any(Integer.class), any(Integer.class), any(Integer.class), any(Integer.class));
        verify(fixture.layout, never()).setLayoutParams(any(CoordinatorLayout.LayoutParams.class));
        verify(fixture.layout, never()).setVisibility(any(Integer.class));
        verifyMethod(fixture.adView, never(), "resume");
        verifyMethod(fixture.adView, never(), "pause");
        verify(call).resolve();
    }

    private static void verifyMethod(Object mock, String name) throws Exception {
        verifyMethod(mock, org.mockito.Mockito.times(1), name);
    }

    private static void verifyMethod(Object mock, VerificationMode mode, String name) throws Exception {
        Object verified = verify(mock, mode);
        Method method = verified.getClass().getMethod(name);
        method.invoke(verified);
    }

    private static final class Fixture {
        final Activity activity = mock(Activity.class);
        final Context context = mock(Context.class);
        final Resources resources = mock(Resources.class);
        final RelativeLayout layout = mock(RelativeLayout.class);
        final CoordinatorLayout.LayoutParams params = mock(CoordinatorLayout.LayoutParams.class);
        final Object adView;
        final BannerExecutor executor;

        Fixture(int requestId) throws Exception {
            @SuppressWarnings("unchecked")
            Class<Object> adViewClass = (Class<Object>) Class.forName("com.google.android.gms.ads.AdView");
            adView = mock(adViewClass);
            DisplayMetrics metrics = new DisplayMetrics();
            metrics.density = 2f;
            when(context.getResources()).thenReturn(resources);
            when(resources.getDisplayMetrics()).thenReturn(metrics);
            when(layout.getLayoutParams()).thenReturn(params);
            doAnswer(invocation -> {
                invocation.<Runnable>getArgument(0).run();
                return null;
            }).when(activity).runOnUiThread(any(Runnable.class));

            executor = new BannerExecutor(() -> context, () -> activity, (event, data) -> {}, "test");
            set("mAdViewLayout", layout);
            set("mAdView", adView);
            set("requestId", requestId);
        }

        PluginCall call(int requestId, int left, int margin, boolean visible) {
            PluginCall call = mock(PluginCall.class);
            when(call.getInt(eq("requestId"), any(Integer.class))).thenReturn(requestId);
            when(call.getInt(eq("left"), any(Integer.class))).thenReturn(left);
            when(call.getInt(eq("margin"), any(Integer.class))).thenReturn(margin);
            when(call.getBoolean(eq("visible"), any(Boolean.class))).thenReturn(visible);
            return call;
        }

        private void set(String name, Object value) throws Exception {
            Field field = BannerExecutor.class.getDeclaredField(name);
            field.setAccessible(true);
            field.set(executor, value);
        }
    }
}
