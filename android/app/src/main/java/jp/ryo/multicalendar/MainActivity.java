package jp.ryo.multicalendar;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GoogleAuthorizationPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
