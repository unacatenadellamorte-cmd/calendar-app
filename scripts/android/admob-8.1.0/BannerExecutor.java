package com.getcapacitor.community.admob.banner;

import android.app.Activity;
import android.content.Context;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RelativeLayout;
import androidx.annotation.NonNull;
import androidx.coordinatorlayout.widget.CoordinatorLayout;
import androidx.core.util.Supplier;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import com.getcapacitor.community.admob.helpers.AdViewIdHelper;
import com.getcapacitor.community.admob.helpers.RequestHelper;
import com.getcapacitor.community.admob.models.AdMobRevenueData;
import com.getcapacitor.community.admob.models.AdOptions;
import com.getcapacitor.community.admob.models.Executor;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.common.util.BiConsumer;

public class BannerExecutor extends Executor {

    private final JSObject emptyObject = new JSObject();
    private RelativeLayout mAdViewLayout;
    private AdView mAdView;
    private ViewGroup mViewGroup;
    private int requestId;

    public BannerExecutor(
        Supplier<Context> contextSupplier,
        Supplier<Activity> activitySupplier,
        BiConsumer<String, JSObject> notifyListenersFunction,
        String pluginLogTag
    ) {
        super(contextSupplier, activitySupplier, notifyListenersFunction, pluginLogTag, "BannerExecutor");
    }

    public void initialize() {
        mViewGroup = (ViewGroup) ((ViewGroup) activitySupplier.get().findViewById(android.R.id.content)).getChildAt(0);
    }

    public void showBanner(final PluginCall call) {
        // Viewの生成からPromiseの完了までUIスレッドで直列化する。
        activitySupplier.get().runOnUiThread(() -> showBannerOnUi(call));
    }

    private void showBannerOnUi(final PluginCall call) {
        final AdOptions adOptions = AdOptions.getFactory().createBannerOptions(call);
        final float density = contextSupplier.get().getResources().getDisplayMetrics().density;
        final int width = call.getInt("width", 0);
        if (width <= 0 || mAdView != null) {
            call.reject("広告幅が不正、または古い広告の削除が未完了");
            return;
        }
        requestId = call.getInt("requestId", 0);

        // Why a try catch block?
        try {
            mAdView = new AdView(contextSupplier.get());

            if (!adOptions.adSize.toString().equals("ADAPTIVE_BANNER")) {
                mAdView.setAdSize(adOptions.adSize.getSize());
            } else {
                // ADAPTIVE BANNER
                mAdView.setAdSize(
                    AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(contextSupplier.get(), width)
                );
            }

            // WebViewと同じCoordinatorLayout内にDOM枠と同じ座標で置く。
            // decorViewのInsetsリスナーを上書きせず、安全領域を二重加算しない。
            mAdViewLayout = new RelativeLayout(contextSupplier.get());
            mAdViewLayout.setHorizontalGravity(Gravity.CENTER_HORIZONTAL);
            mAdViewLayout.setVisibility(View.INVISIBLE);
            final CoordinatorLayout.LayoutParams params = new CoordinatorLayout.LayoutParams(
                Math.round(width * density), CoordinatorLayout.LayoutParams.WRAP_CONTENT
            );
            params.gravity = Gravity.TOP | Gravity.LEFT;
            params.setMargins(Math.round(call.getInt("left", 0) * density), Math.round(adOptions.margin * density), 0, 0);
            mAdViewLayout.setLayoutParams(params);

            createNewAdView(adOptions);

            call.resolve();
        } catch (Exception ex) {
            call.reject(ex.getLocalizedMessage(), ex);
        }
    }

    public void updateBannerPlacement(final PluginCall call) {
        activitySupplier.get().runOnUiThread(() -> {
            try {
                // 古い非同期要求で新しい広告を動かしたり表示したりしない。
                if (mAdViewLayout != null && mAdView != null && call.getInt("requestId", -1) == requestId) {
                    final float density = contextSupplier.get().getResources().getDisplayMetrics().density;
                    final CoordinatorLayout.LayoutParams params = (CoordinatorLayout.LayoutParams) mAdViewLayout.getLayoutParams();
                    params.setMargins(Math.round(call.getInt("left", 0) * density), Math.round(call.getInt("margin", 0) * density), 0, 0);
                    mAdViewLayout.setLayoutParams(params);
                    final boolean visible = call.getBoolean("visible", false);
                    mAdViewLayout.setVisibility(visible ? View.VISIBLE : View.INVISIBLE);
                    if (visible) mAdView.resume();
                    else mAdView.pause();
                }
                call.resolve();
            } catch (Exception ex) {
                call.reject(ex.getLocalizedMessage(), ex);
            }
        });
    }

    public void hideBanner(final PluginCall call) {
        activitySupplier.get().runOnUiThread(() -> {
            if (mAdViewLayout != null && mAdView != null) {
                mAdViewLayout.setVisibility(View.INVISIBLE);
                mAdView.pause();
            }
            call.resolve();
        });
    }

    public void resumeBanner(final PluginCall call) {
        // DOMの高さ確保と位置確認を飛ばす表示は許可しない。
        call.reject("updateBannerPlacementでDOM枠を確認して再表示すること");
    }

    public void removeBanner(final PluginCall call) {
        activitySupplier.get().runOnUiThread(() -> {
            try {
                if (mAdViewLayout != null) mViewGroup.removeView(mAdViewLayout);
                if (mAdView != null) {
                    if (mAdViewLayout != null) mAdViewLayout.removeView(mAdView);
                    mAdView.destroy();
                    mAdView = null;
                }
                mAdViewLayout = null;
                // UI破棄の完了後にのみJSの次のリクエストへ進める。
                call.resolve();
            } catch (Exception ex) {
                call.reject(ex.getLocalizedMessage(), ex);
            }
        });
    }

    /**
     * Follow iOS method Name:
     * https://developers.google.com/admob/ios/banner?hl=ja
     */
    private void createNewAdView(AdOptions adOptions) {
        // Bind to the AdView instance created for this call. `mAdView` is a
        // shared field that removeBanner/hideBanner or a stale ad-listener
        // callback can null from the UI thread before this posted task runs;
        // reading the field inside the task would then throw a
        // NullPointerException (e.g. in AdViewIdHelper.assignIdToAdView).
        final AdView adView = mAdView;

        // Run AdMob In Main UI Thread
        activitySupplier
            .get()
            .runOnUiThread(() -> {
                if (adView != mAdView) {
                    // Banner was removed or replaced before this task ran.
                    return;
                }
                final AdRequest adRequest = RequestHelper.createRequest(adOptions);
                // Assign the correct id needed
                AdViewIdHelper.assignIdToAdView(adView, adOptions, adRequest, logTag, contextSupplier.get());
                // Add the AdView to the view hierarchy.
                mAdViewLayout.addView(adView);
                adView.setAdListener(
                    new AdListener() {
                        @Override
                        public void onAdLoaded() {
                            if (adView != mAdView) {
                                return;
                            }
                            final JSObject sizeInfo = new JSObject();
                            sizeInfo.put("width", adView.getAdSize().getWidth());
                            sizeInfo.put("height", adView.getAdSize().getHeight());
                            sizeInfo.put("requestId", requestId);

                            notifyListeners(BannerAdPluginEvents.SizeChanged.getWebEventName(), sizeInfo);
                            notifyListeners(BannerAdPluginEvents.Loaded.getWebEventName(), emptyObject);
                            super.onAdLoaded();
                        }

                        @Override
                        public void onAdFailedToLoad(@NonNull LoadAdError adError) {
                            if (adView != mAdView) {
                                // Stale callback from a banner that was already removed or
                                // replaced. Do not touch the current banner or emit teardown
                                // events for a view the JS layer has already discarded.
                                super.onAdFailedToLoad(adError);
                                return;
                            }

                            mViewGroup.removeView(mAdViewLayout);
                            mAdViewLayout.removeView(adView);
                            adView.destroy();
                            mAdView = null;

                            final JSObject sizeInfo = new JSObject();
                            sizeInfo.put("width", 0);
                            sizeInfo.put("height", 0);
                            sizeInfo.put("requestId", requestId);
                            notifyListeners(BannerAdPluginEvents.SizeChanged.getWebEventName(), sizeInfo);

                            final JSObject adMobPluginError = new JSObject();
                            adMobPluginError.put("code", adError.getCode());
                            adMobPluginError.put("message", adError.getMessage());
                            adMobPluginError.put("requestId", requestId);
                            notifyListeners(BannerAdPluginEvents.FailedToLoad.getWebEventName(), adMobPluginError);

                            super.onAdFailedToLoad(adError);
                        }

                        @Override
                        public void onAdOpened() {
                            notifyListeners(BannerAdPluginEvents.Opened.getWebEventName(), emptyObject);
                            super.onAdOpened();
                        }

                        @Override
                        public void onAdClosed() {
                            notifyListeners(BannerAdPluginEvents.Closed.getWebEventName(), emptyObject);
                            super.onAdClosed();
                        }

                        @Override
                        public void onAdImpression() {
                            notifyListeners(BannerAdPluginEvents.AdImpression.getWebEventName(), emptyObject);
                            super.onAdImpression();
                        }
                    }
                );

                adView.setOnPaidEventListener((adValue) -> {
                    if (adView != mAdView) {
                        return;
                    }
                    String networkName = "";
                    String impressionId = "";
                    if (adView.getResponseInfo() != null) {
                        networkName = adView.getResponseInfo().getMediationAdapterClassName();
                        if (networkName == null) networkName = "";
                        impressionId = adView.getResponseInfo().getResponseId();
                        if (impressionId == null) impressionId = "";
                    }
                    AdMobRevenueData revenueData = new AdMobRevenueData(adValue, adView.getAdUnitId(), networkName, impressionId);
                    notifyListeners(BannerAdPluginEvents.AdPaid.getWebEventName(), revenueData);
                });

                // Add AdViewLayout top of the WebView
                mViewGroup.addView(mAdViewLayout);
                adView.loadAd(adRequest);
            });
    }
}
