package io.github.marusako.focusr;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Process;
import android.provider.Settings;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

// 作業中に、選んだアプリを開けなくする、このアプリだけの部品
// (画面からは Capacitor.Plugins.AppBlock で呼ぶ。src/renderer.js の syncAppBlock)。
// - status: 必要な 2 つの許可 (使用状況へのアクセス・ほかのアプリの上に重ねて表示) が出ているか
// - openUsageAccessSettings・openOverlaySettings: それぞれの許可を出す Android の設定画面を開く
// - listApps: ホーム画面に出るアプリ (自分以外) の一覧。名前の順
// - setPlan: 作業の時間帯 ({ from, to } の並び)・止めるアプリ・重ねる画面の文を保存し、時間帯があって許可がそろっていれば
//   サービス (AppBlockService) を始める。そうでなければ止める。サービスが前に出ているアプリを見て、重ねる画面を出す
@CapacitorPlugin(name = "AppBlock")
public class AppBlock extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("usageAccess", hasUsageAccess(getContext()));
        result.put("overlay", Settings.canDrawOverlays(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void openUsageAccessSettings(PluginCall call) {
        open(call, new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS));
    }

    @PluginMethod
    public void openOverlaySettings(PluginCall call) {
        // このアプリのページを直接開く
        open(call, new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getContext().getPackageName())));
    }

    private void open(PluginCall call, Intent intent) {
        try {
            getContext().startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("open failed");
        }
    }

    @PluginMethod
    public void listApps(PluginCall call) {
        // アプリが多いと時間がかかるので、画面の処理とは別の流れで調べる
        getBridge().execute(() -> {
            Context context = getContext();
            PackageManager packages = context.getPackageManager();
            Intent launcher = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER);
            List<String[]> apps = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            for (ResolveInfo info : packages.queryIntentActivities(launcher, 0)) {
                String packageName = info.activityInfo.packageName;
                if (packageName.equals(context.getPackageName()) || !seen.add(packageName)) continue;
                apps.add(new String[] { packageName, String.valueOf(info.loadLabel(packages)) });
            }
            Collator collator = Collator.getInstance();
            Collections.sort(apps, (a, b) -> collator.compare(a[1], b[1]));
            JSArray list = new JSArray();
            for (String[] app : apps) {
                JSObject item = new JSObject();
                item.put("packageName", app[0]);
                item.put("label", app[1]);
                list.put(item);
            }
            JSObject result = new JSObject();
            result.put("apps", list);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void setPlan(PluginCall call) {
        Context context = getContext();
        JSArray windows = call.getArray("windows", new JSArray());
        JSArray apps = call.getArray("apps", new JSArray());
        JSObject texts = call.getObject("texts", new JSObject());
        AppBlockService.save(context, windows.toString(), apps.toString(), texts.toString());
        boolean start = apps.length() > 0
            && hasFutureWindow(windows, System.currentTimeMillis())
            && hasUsageAccess(context)
            && Settings.canDrawOverlays(context);
        if (start) {
            // 動いているサービスには、新しい計画を読み直させる。動いていなければ始める
            if (!AppBlockService.reload()) {
                try {
                    ContextCompat.startForegroundService(context, new Intent(context, AppBlockService.class));
                } catch (RuntimeException e) {
                    // 裏にあるときは、Android 12 以降はフォアグラウンドサービスを始められない (次に計画を送るときに始める)
                    call.reject("start failed");
                    return;
                }
            }
        } else {
            // 動いているときだけ止める (始めてすぐ止めると、startForeground が呼ばれずに落ちるため)
            AppBlockService.stop();
        }
        call.resolve();
    }

    private static boolean hasFutureWindow(JSONArray windows, long now) {
        for (int i = 0; i < windows.length(); i++) {
            JSONObject window = windows.optJSONObject(i);
            if (window != null && window.optLong("to", 0) > now) return true;
        }
        return false;
    }

    // 使用状況へのアクセスが許可されているか (AppOpsManager で調べる)
    static boolean hasUsageAccess(Context context) {
        AppOpsManager appOps = (AppOpsManager) context.getSystemService(Context.APP_OPS_SERVICE);
        int mode;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            mode = appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName());
        } else {
            mode = appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName());
        }
        return mode == AppOpsManager.MODE_ALLOWED;
    }
}
