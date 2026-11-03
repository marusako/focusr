package io.github.marusako.focusr;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInstaller;

// アプリの更新 (AppUpdate.install) の結果を受け取る。外から呼べない受け取り口 (android-build.yml で AndroidManifest.xml に足す)
public class AppUpdateReceiver extends BroadcastReceiver {
    @SuppressWarnings("deprecation")
    @Override
    public void onReceive(Context context, Intent intent) {
        int status = intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (status == PackageInstaller.STATUS_PENDING_USER_ACTION) {
            // Android の確認の画面 (「更新」を押す) を開く
            Intent confirm = intent.getParcelableExtra(Intent.EXTRA_INTENT);
            AppUpdate.showConfirm(context, confirm);
        } else if (status != PackageInstaller.STATUS_SUCCESS) {
            // 失敗・取り消し。成功したときは、アプリが入れ替わって閉じるので何もしない
            AppUpdate.sendFailure(context, intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE));
        }
    }
}
