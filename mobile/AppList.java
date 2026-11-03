package io.github.marusako.focusr;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.telecom.TelecomManager;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

// 作業中のアプリの制限 (AppBlock・AppBlockService) が共有する、入っているアプリを調べる小さな関数
final class AppList {
    private AppList() {}

    // ホーム画面にアイコンが出るアプリ (ランチャーのアプリ)。同じアプリが重なって入ることがある
    static List<ResolveInfo> launcherActivities(PackageManager packages) {
        return packages.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER), 0);
    }

    // いつも止めないアプリ (ホームアプリすべてと、既定の電話アプリ。緊急の電話を止めないため)。自分は含まない
    static Set<String> alwaysAllowed(Context context) {
        Set<String> names = new HashSet<>();
        PackageManager packages = context.getPackageManager();
        for (ResolveInfo info : packages.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)) {
            names.add(info.activityInfo.packageName);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            TelecomManager telecom = (TelecomManager) context.getSystemService(Context.TELECOM_SERVICE);
            String dialer = null;
            try {
                if (telecom != null) dialer = telecom.getDefaultDialerPackage();
            } catch (RuntimeException e) {
                // 取れなければ、電話アプリは足さない
            }
            if (dialer != null) names.add(dialer);
        }
        return names;
    }
}
