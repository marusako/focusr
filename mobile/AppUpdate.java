package io.github.marusako.focusr;

import android.app.DownloadManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.regex.Pattern;

// アプリの中から、新しい版の APK をダウンロードする、このアプリだけの部品
// (画面からは Capacitor.Plugins.AppUpdate で呼ぶ。src/renderer.js の startUpdate)。
// ダウンロードは Android の DownloadManager に頼み、インストールは Android に任せる。
// このアプリが APK を開いたりインストールしたりしないので、インストールの権限 (REQUEST_INSTALL_PACKAGES) は要らない
// (docs/plans/in-app-update.md)。ダウンロードが終わると Android の通知が出て、それを押すとインストールの画面が出る。
// - download: GitHub の Release の APK をダウンロードする。進み具合は updateProgress ({ received, total }。total が分からなければ -1) で知らせ、
//   終わったら resolve ({ ok: true })、失敗・取り消されたら reject
// - openDownloads: Android のダウンロードの一覧を開く
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdate extends Plugin {
    // ダウンロードしてよい URL は、このリポジトリの Release のファイルだけ (src/mobile-update.js の apkUpdate と同じ)
    private static final String ALLOWED_PREFIX = "https://github.com/marusako/focusr/releases/download/";
    private static final Pattern VERSION = Pattern.compile("[0-9]+\\.[0-9]+\\.[0-9]+");
    private static final long POLL_INTERVAL_MS = 500;
    private static final String PREFS = "AppUpdate";
    private static final String KEY_DOWNLOAD_ID = "downloadId";
    private static final String KEY_DOWNLOAD_VERSION = "downloadVersion";

    // 進み具合を調べる処理は、すべてメインスレッドで動かす (状態を 1 つのスレッドだけで触るため)
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable poller;

    // アプリが閉じるときは、調べるのをやめる (ダウンロード自体は Android が続ける)
    @Override
    protected void handleOnDestroy() {
        handler.removeCallbacksAndMessages(null);
        poller = null;
        super.handleOnDestroy();
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("version");
        if (url == null || !url.startsWith(ALLOWED_PREFIX)) {
            call.reject("url not allowed");
            return;
        }
        if (version == null || !VERSION.matcher(version).matches()) {
            call.reject("version not allowed");
            return;
        }
        handler.post(() -> start(call, url, version));
    }

    private void start(PluginCall call, String url, String version) {
        // ダウンロードは、同時に 2 つ走らせない
        if (poller != null) {
            call.reject("busy");
            return;
        }
        Context context = getContext();
        DownloadManager manager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
        if (manager == null) {
            call.reject("download manager not found");
            return;
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        long previous = prefs.getLong(KEY_DOWNLOAD_ID, -1);
        if (previous != -1) {
            // 前に頼んだのが同じ版なら、取り直さない: 終わっていればすぐ resolve、途中ならそのまま見張り直す
            if (version.equals(prefs.getString(KEY_DOWNLOAD_VERSION, null))) {
                int status = statusOf(manager, previous);
                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    call.resolve(new JSObject().put("ok", true));
                    return;
                }
                if (status == DownloadManager.STATUS_PENDING || status == DownloadManager.STATUS_RUNNING
                    || status == DownloadManager.STATUS_PAUSED) {
                    poll(call, manager, previous);
                    return;
                }
            }
            // 違う版・失敗した・消されたものは、ファイルごと消す (古い APK がたまらないように)
            manager.remove(previous);
        }
        prefs.edit().remove(KEY_DOWNLOAD_ID).remove(KEY_DOWNLOAD_VERSION).apply();

        long id;
        try {
            String name = "focusr-" + version + ".apk";
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setMimeType("application/vnd.android.package-archive")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                // 「ダウンロード」フォルダー (権限は要らない)
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            } else {
                // アプリ専用の外部のフォルダー (権限は要らない)
                request.setDestinationInExternalFilesDir(context, null, name);
            }
            id = manager.enqueue(request);
        } catch (RuntimeException e) {
            call.reject("download failed");
            return;
        }
        prefs.edit().putLong(KEY_DOWNLOAD_ID, id).putString(KEY_DOWNLOAD_VERSION, version).apply();
        poll(call, manager, id);
    }

    // 0.5 秒ごとに進み具合を調べる。終わった (成功・失敗・消された) ら、調べるのをやめて、結果を返す
    private void poll(PluginCall call, DownloadManager manager, long id) {
        poller = new Runnable() {
            @Override
            public void run() {
                String result = check(manager, id);
                if (result == null) {
                    handler.postDelayed(this, POLL_INTERVAL_MS);
                    return;
                }
                poller = null;
                if (result.isEmpty()) call.resolve(new JSObject().put("ok", true));
                else call.reject(result);
            }
        };
        handler.post(poller);
    }

    // ダウンロードの状態 (DownloadManager.STATUS_*)。行がない・調べられないときは -1
    private int statusOf(DownloadManager manager, long id) {
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            if (cursor == null || !cursor.moveToFirst()) return -1;
            return cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
        } catch (RuntimeException e) {
            return -1;
        }
    }

    // 調べた結果: 続けるなら null、成功なら ""、失敗・取り消しなら理由
    private String check(DownloadManager manager, long id) {
        try (Cursor cursor = manager.query(new DownloadManager.Query().setFilterById(id))) {
            // 行がない = 通知やダウンロードの一覧から取り消された
            if (cursor == null || !cursor.moveToFirst()) return "download cancelled";
            int status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
            if (status == DownloadManager.STATUS_SUCCESSFUL) return "";
            if (status == DownloadManager.STATUS_FAILED) return "download failed";
            long received = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
            long total = cursor.getLong(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
            JSObject data = new JSObject();
            data.put("received", received);
            data.put("total", total > 0 ? total : -1);
            notifyListeners("updateProgress", data);
            return null;
        } catch (RuntimeException e) {
            return "download failed";
        }
    }

    @PluginMethod
    public void openDownloads(PluginCall call) {
        Intent intent = new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("open failed");
        }
    }
}
