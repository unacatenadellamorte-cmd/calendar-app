package jp.ryo.multicalendar;

import android.app.Activity;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.common.api.Scope;
import java.util.Arrays;
import java.util.List;

/** Google公式SDKの認可結果からコードだけをWeb層へ返す。 */
@CapacitorPlugin(name = "GoogleAuthorization")
public class GoogleAuthorizationPlugin extends Plugin {
    private static final List<Scope> SCOPES = Arrays.asList(
        new Scope("https://www.googleapis.com/auth/calendar.calendarlist.readonly"),
        new Scope("https://www.googleapis.com/auth/calendar.events.readonly")
    );
    private ActivityResultLauncher<IntentSenderRequest> launcher;
    private PluginCall pending;

    @Override
    public void load() {
        launcher = getActivity().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(), this::handleAuthorizationResult);
    }

    void handleAuthorizationResult(ActivityResult result) {
        if (pending == null) return;
        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            rejectPending("cancelled");
            return;
        }
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            rejectPending("exchange-failed");
            return;
        }
        try {
            finish(Identity.getAuthorizationClient(getActivity())
                .getAuthorizationResultFromIntent(result.getData()));
        } catch (ApiException error) {
            rejectPending(error.getStatusCode() == CommonStatusCodes.CANCELED
                ? "cancelled" : "exchange-failed");
        }
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != null) {
                call.reject("認可処理中です", "in-progress");
                return;
            }
            String clientId = call.getString("serverClientId");
            if (clientId == null || clientId.trim().isEmpty()) {
                call.reject("接続設定がありません", "exchange-failed");
                return;
            }
            pending = call;
            try {
                AuthorizationRequest request = AuthorizationRequest.builder()
                    .setRequestedScopes(SCOPES)
                    .requestOfflineAccess(clientId, true)
                    .build();
                Identity.getAuthorizationClient(getActivity()).authorize(request)
                    .addOnSuccessListener(result -> {
                        if (pending != call) return;
                        try {
                            if (result.hasResolution()) {
                                if (result.getPendingIntent() == null) {
                                    rejectPending("exchange-failed");
                                    return;
                                }
                                launcher.launch(new IntentSenderRequest.Builder(
                                    result.getPendingIntent().getIntentSender()).build());
                            } else {
                                finish(result);
                            }
                        } catch (RuntimeException error) {
                            rejectPending("exchange-failed");
                        }
                    })
                    .addOnFailureListener(error -> {
                        if (pending != call) return;
                        rejectPending(error instanceof ApiException
                            && ((ApiException) error).getStatusCode() == CommonStatusCodes.CANCELED
                            ? "cancelled" : "exchange-failed");
                    });
            } catch (RuntimeException error) {
                rejectPending("exchange-failed");
            }
        });
    }

    private void finish(AuthorizationResult result) {
        if (pending == null) return;
        String code = result.getServerAuthCode();
        List<String> granted = result.getGrantedScopes();
        if (code == null || code.isEmpty() || granted == null
            || !SCOPES.stream().allMatch(scope -> granted.contains(scope.getScopeUri()))) {
            rejectPending("exchange-failed");
            return;
        }
        JSObject response = new JSObject();
        response.put("code", code);
        response.put("grantedScopes", new JSArray(granted));
        PluginCall call = pending;
        pending = null;
        call.resolve(response);
    }

    private void rejectPending(String code) {
        PluginCall call = pending;
        pending = null;
        if (call != null) call.reject("Googleの認可を完了できませんでした", code);
    }

    @Override
    protected void handleOnDestroy() {
        rejectPending("cancelled");
        if (launcher != null) launcher.unregister();
    }
}
