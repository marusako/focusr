package io.github.marusako.focusr;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

// アプリの中から、新しい版の APK をダウンロードして入れる、このアプリだけの部品
// (画面からは Capacitor.Plugins.AppUpdate で呼ぶ。src/renderer.js の startUpdate)。
// - canInstall: 「不明なアプリのインストール」がこのアプリに許可されているか
// - openInstallSettings: その許可を出す Android の設定画面 (このアプリのページ) を開く
// - download: GitHub の Release の APK をキャッシュのフォルダーにダウンロードする。進み具合は updateProgress ({ received, total }。total が分からなければ -1) で知らせる
// - install: ダウンロードした APK の中身を確かめて、PackageInstaller のセッションで入れる。結果は AppUpdateReceiver で受ける。
//   失敗・取り消しは、画面に updateResult ({ ok: false, message }) で知らせる (成功したときはアプリが入れ替わって閉じる)
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdate extends Plugin {
    // ダウンロードしてよい URL は、このリポジトリの Release のファイルだけ (src/mobile-update.js の apkUpdate と同じ)
    private static final String ALLOWED_PREFIX = "https://github.com/marusako/focusr/releases/download/";
    private static final int TIMEOUT_MS = 20000;
    private static final long NOTIFY_INTERVAL_MS = 250;

    private static AppUpdate instance;
    // アプリが前にいるか (handleOnResume / handleOnPause で更新する。読み込まれるのは画面が出る前なので、最初は前にいる扱い)
    private volatile boolean isResumed = true;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final AtomicBoolean working = new AtomicBoolean(false);

    @Override
    public void load() {
        instance = this;
        // 前回の更新で消し損ねた APK が残っていれば片付ける
        File[] old = new File(getContext().getCacheDir(), "update").listFiles();
        if (old != null) for (File f : old) f.delete();
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        isResumed = false;
    }

    // 確認の画面が前に出ると、アプリは onPause になり、確認が終わって戻ると onResume になる。
    // 開いたら消しているので、戻ったときに同じ画面をもう一度開くことはない
    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        isResumed = true;
        openPendingConfirm(getContext());
    }

    // 裏にいる間は、裏からの Activity の起動を Android が黙って止めることがある。
    // 止められたかどうかは分からないので、確認の Intent をとっておき、アプリが前に戻ったときに開き直す
    private static Intent pendingConfirm;

    // 確認の画面を開く (AppUpdateReceiver から呼ぶ)。開けなければ失敗を画面に知らせる
    static synchronized void showConfirm(Context context, Intent confirm) {
        if (confirm == null) {
            sendFailure(context, "no confirm intent");
            return;
        }
        confirm.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        boolean foreground = instance != null && instance.getActivity() != null && instance.isResumed;
        try {
            context.startActivity(confirm);
            // 前にいるなら開けたはずなので、とっておかない。裏にいたなら止められたかもしれないので、とっておく
            pendingConfirm = foreground ? null : confirm;
        } catch (RuntimeException e) {
            if (foreground) {
                sendFailure(context, "confirm failed");
            } else {
                pendingConfirm = confirm;
            }
        }
    }

    private static synchronized void openPendingConfirm(Context context) {
        Intent confirm = pendingConfirm;
        if (confirm == null) return;
        pendingConfirm = null;
        try {
            context.startActivity(confirm);
        } catch (RuntimeException e) {
            sendFailure(context, "confirm failed");
        }
    }

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
            || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject result = new JSObject();
        result.put("allowed", allowed);
        call.resolve(result);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        try {
            getContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("open failed");
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith("https://") || !url.startsWith(ALLOWED_PREFIX)) {
            call.reject("url not allowed");
            return;
        }
        // ダウンロードとインストールは、同時に 2 つ走らせない
        if (!working.compareAndSet(false, true)) {
            call.reject("busy");
            return;
        }
        Context context = getContext();
        executor.execute(() -> {
            File file = apkFile(context);
            try {
                downloadTo(url, file);
                call.resolve(new JSObject().put("ok", true));
            } catch (IOException | RuntimeException e) {
                file.delete();
                call.reject("download failed");
            } finally {
                working.set(false);
            }
        });
    }

    private void downloadTo(String url, File file) throws IOException {
        File dir = file.getParentFile();
        if (!dir.isDirectory() && !dir.mkdirs()) throw new IOException("mkdirs failed");
        HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
        try {
            // GitHub は https から https のリダイレクトで本体を返す (HttpURLConnection が自動で追う)
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) throw new IOException("http " + connection.getResponseCode());
            if (!"https".equals(connection.getURL().getProtocol())) throw new IOException("not https");
            long total = connection.getContentLengthLong();
            long received = 0;
            int lastPercent = -1;
            long lastNotify = 0;
            byte[] buffer = new byte[16384];
            try (InputStream in = connection.getInputStream(); OutputStream out = new FileOutputStream(file)) {
                int read;
                while ((read = in.read(buffer)) != -1) {
                    out.write(buffer, 0, read);
                    received += read;
                    // 知らせは 1% ごとか 250 ミリ秒ごとに間引く
                    int percent = total > 0 ? (int) (received * 100 / total) : -1;
                    long now = System.currentTimeMillis();
                    if (percent != lastPercent || now - lastNotify >= NOTIFY_INTERVAL_MS) {
                        notifyProgress(received, total);
                        lastPercent = percent;
                        lastNotify = now;
                    }
                }
            }
            if (total > 0 && received != total) throw new IOException("incomplete");
            notifyProgress(received, total);
        } finally {
            connection.disconnect();
        }
    }

    private void notifyProgress(long received, long total) {
        JSObject data = new JSObject();
        data.put("received", received);
        data.put("total", total > 0 ? total : -1);
        notifyListeners("updateProgress", data);
    }

    @PluginMethod
    public void install(PluginCall call) {
        if (!working.compareAndSet(false, true)) {
            call.reject("busy");
            return;
        }
        Context context = getContext();
        executor.execute(() -> {
            File file = apkFile(context);
            try {
                String problem = checkApk(context, file);
                if (problem != null) {
                    file.delete();
                    call.reject(problem);
                    return;
                }
                commitSession(context, file);
                // 中身はセッションに写し終わっているので、ダウンロードしたファイルはもう要らない
                file.delete();
                call.resolve();
            } catch (IOException | RuntimeException e) {
                file.delete();
                call.reject("install failed");
            } finally {
                working.set(false);
            }
        });
    }

    // ダウンロードした APK が、このアプリの新しい版か確かめる。問題があれば理由、なければ null
    // (署名が違う APK は Android が入れないので、そこは Android に任せる)
    private static String checkApk(Context context, File file) throws IOException {
        if (!file.isFile()) return "apk not found";
        PackageManager packages = context.getPackageManager();
        PackageInfo downloaded = packages.getPackageArchiveInfo(file.getAbsolutePath(), 0);
        if (downloaded == null) return "apk unreadable";
        if (!context.getPackageName().equals(downloaded.packageName)) return "package mismatch";
        try {
            PackageInfo current = packages.getPackageInfo(context.getPackageName(), 0);
            if (versionCodeOf(downloaded) <= versionCodeOf(current)) return "version not newer";
        } catch (PackageManager.NameNotFoundException e) {
            throw new IOException("package info not found");
        }
        return null;
    }

    @SuppressWarnings("deprecation")
    private static long versionCodeOf(PackageInfo info) {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? info.getLongVersionCode() : info.versionCode;
    }

    private static void commitSession(Context context, File file) throws IOException {
        PackageInstaller installer = context.getPackageManager().getPackageInstaller();
        PackageInstaller.SessionParams params = new PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL);
        params.setAppPackageName(context.getPackageName());
        params.setSize(file.length());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // 前回の更新をこのアプリが入れていれば、確認の画面なしで入れ替わることがある (Android の決まりで、出ることもある)
            params.setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED);
        }
        int id = installer.createSession(params);
        try (PackageInstaller.Session session = installer.openSession(id)) {
            try (InputStream in = new FileInputStream(file); OutputStream out = session.openWrite("focusr-update.apk", 0, file.length())) {
                byte[] buffer = new byte[65536];
                int read;
                while ((read = in.read(buffer)) != -1) out.write(buffer, 0, read);
                session.fsync(out);
            }
            // 結果は AppUpdateReceiver に届く。PackageInstaller が結果を書き込むので、Android 12 以降は FLAG_MUTABLE が要る
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) flags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent result = PendingIntent.getBroadcast(context, id, new Intent(context, AppUpdateReceiver.class), flags);
            session.commit(result.getIntentSender());
        } catch (IOException | RuntimeException e) {
            installer.abandonSession(id);
            throw e;
        }
    }

    // ダウンロードした APK の置き場所 (アプリのキャッシュ。ほかのアプリからは見えない)
    static File apkFile(Context context) {
        return new File(new File(context.getCacheDir(), "update"), "focusr-update.apk");
    }

    // インストールが失敗・取り消された (AppUpdateReceiver から呼ぶ)。ダウンロードした APK を消して、画面に知らせる
    static void sendFailure(Context context, String message) {
        apkFile(context).delete();
        if (instance == null) return;
        JSObject data = new JSObject();
        data.put("ok", false);
        data.put("message", message);
        instance.notifyListeners("updateResult", data);
    }
}
