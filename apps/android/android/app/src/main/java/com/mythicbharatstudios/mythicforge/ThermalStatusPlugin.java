package com.mythicbharatstudios.mythicforge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Reports device thermal state and system battery-saver mode to the web layer.
 *
 * Event-driven only: uses PowerManager.OnThermalStatusChangedListener (API 29+) and the
 * ACTION_POWER_SAVE_MODE_CHANGED broadcast. Listeners are registered only while the web
 * layer is subscribed (i.e. while a game is running) and removed when it unsubscribes or
 * the app is paused. No sensors are polled and no permissions are needed.
 */
@CapacitorPlugin(name = "ThermalStatus")
public class ThermalStatusPlugin extends Plugin {

    private PowerManager powerManager;
    private PowerManager.OnThermalStatusChangedListener thermalListener;
    private BroadcastReceiver powerSaveReceiver;

    @Override
    public void load() {
        powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(snapshot());
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (hasListeners("change")) startListening();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        stopListening();
    }

    // Overrides must repeat @PluginMethod: the bridge discovers methods by annotation.
    @Override
    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void addListener(PluginCall call) {
        super.addListener(call);
        startListening();
    }

    @Override
    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    public void removeListener(PluginCall call) {
        super.removeListener(call);
        if (!hasListeners("change")) stopListening();
    }

    @Override
    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    public void removeAllListeners(PluginCall call) {
        super.removeAllListeners(call);
        stopListening();
    }

    private void startListening() {
        if (powerManager == null) return;
        if (thermalListener == null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            thermalListener = status -> notifyListeners("change", snapshot());
            powerManager.addThermalStatusListener(getContext().getMainExecutor(), thermalListener);
        }
        if (powerSaveReceiver == null) {
            powerSaveReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    notifyListeners("change", snapshot());
                }
            };
            IntentFilter filter = new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                getContext().registerReceiver(powerSaveReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                getContext().registerReceiver(powerSaveReceiver, filter);
            }
        }
    }

    private void stopListening() {
        if (powerManager != null && thermalListener != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            powerManager.removeThermalStatusListener(thermalListener);
        }
        thermalListener = null;
        if (powerSaveReceiver != null) {
            try {
                getContext().unregisterReceiver(powerSaveReceiver);
            } catch (IllegalArgumentException ignored) {
                // Already unregistered.
            }
            powerSaveReceiver = null;
        }
    }

    private JSObject snapshot() {
        JSObject result = new JSObject();
        result.put("thermal", thermalName());
        result.put("powerSave", powerManager != null && powerManager.isPowerSaveMode());
        return result;
    }

    private String thermalName() {
        if (powerManager == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "unknown";
        switch (powerManager.getCurrentThermalStatus()) {
            case PowerManager.THERMAL_STATUS_NONE:
                return "nominal";
            case PowerManager.THERMAL_STATUS_LIGHT:
            case PowerManager.THERMAL_STATUS_MODERATE:
                return "fair";
            case PowerManager.THERMAL_STATUS_SEVERE:
                return "serious";
            case PowerManager.THERMAL_STATUS_CRITICAL:
            case PowerManager.THERMAL_STATUS_EMERGENCY:
            case PowerManager.THERMAL_STATUS_SHUTDOWN:
                return "critical";
            default:
                return "unknown";
        }
    }
}
