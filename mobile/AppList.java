package io.github.marusako.focusr;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.telecom.TelecomManager;
import java.util.Collections;
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

    // 緊急情報 (血液型・緊急連絡先など) を見せる画面を開く合図。公開の定数はないが、Android 標準の「緊急情報」
    // (com.android.emergency) などがこの合図を受け取る。機種ごとの緊急情報のアプリを見つけるのに使う
    private static final String ACTION_EMERGENCY_ASSISTANCE = "android.telephony.action.EMERGENCY_ASSISTANCE";

    // 合図で見つからないときのために、名前で足す緊急情報のアプリ (入っていなくても害はない)
    private static final String[] EMERGENCY_PACKAGES = {
        "com.android.emergency", // Android 標準の「緊急情報」
        "com.google.android.apps.safetyhub", // Google の「緊急情報サービス」(Personal Safety)
    };

    // いつも止めないアプリ (ホームアプリすべてと、既定の電話アプリと、緊急情報のアプリ。緊急のときに止めないため)。自分は含まない
    static Set<String> alwaysAllowed(Context context) {
        Set<String> names = new HashSet<>();
        PackageManager packages = context.getPackageManager();
        for (ResolveInfo info : packages.queryIntentActivities(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)) {
            names.add(info.activityInfo.packageName);
        }
        for (ResolveInfo info : packages.queryIntentActivities(new Intent(ACTION_EMERGENCY_ASSISTANCE), 0)) {
            names.add(info.activityInfo.packageName);
        }
        Collections.addAll(names, EMERGENCY_PACKAGES);
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
