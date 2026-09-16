package com.mythicbharatstudios.mythicforge;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * Hands a file the user chose to export (project package, web build, log) to the Android
 * share sheet, so they can save it to Files/Drive or send it to another device.
 *
 * Files are written to cache/exports only (the sole FileProvider path), old exports are
 * removed, and nothing is shared unless the user picks a target.
 */
@CapacitorPlugin(name = "ProjectExport")
public class ProjectExportPlugin extends Plugin {

    private static final long MAX_AGE_MS = 60 * 60 * 1000L;
    private static final int MAX_NAME = 100;

    @PluginMethod
    public void share(PluginCall call) {
        String name = call.getString("name");
        String data = call.getString("data");
        String mime = call.getString("mime", "application/octet-stream");
        if (name == null || data == null) {
            call.reject("name and data are required");
            return;
        }
        File dir = new File(getContext().getCacheDir(), "exports");
        if (!dir.exists() && !dir.mkdirs()) {
            call.reject("Could not prepare the export folder");
            return;
        }
        removeOldExports(dir);
        File file = new File(dir, safeName(name));
        try (FileOutputStream out = new FileOutputStream(file)) {
            out.write(Base64.decode(data, Base64.NO_WRAP));
        } catch (IOException | IllegalArgumentException e) {
            call.reject("Could not write the export file", e);
            return;
        }
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        send.putExtra(Intent.EXTRA_TITLE, file.getName());
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        Intent chooser = Intent.createChooser(send, "Save or send " + file.getName());
        startActivityForResult(call, chooser, "onShareClosed");
    }

    @ActivityCallback
    private void onShareClosed(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        // Android's share sheet does not report whether a target was chosen.
        ret.put("closed", true);
        call.resolve(ret);
    }

    static String safeName(String name) {
        String base = name.replaceAll("[^A-Za-z0-9._ -]", "_").replaceAll("\\.{2,}", "_").trim();
        if (base.isEmpty() || base.startsWith(".")) base = "export" + base;
        return base.length() > MAX_NAME ? base.substring(base.length() - MAX_NAME) : base;
    }

    private static void removeOldExports(File dir) {
        File[] files = dir.listFiles();
        if (files == null) return;
        long now = System.currentTimeMillis();
        for (File f : files) {
            if (now - f.lastModified() > MAX_AGE_MS) {
                // Best effort; a leftover file is only a small cache entry.
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }
}
