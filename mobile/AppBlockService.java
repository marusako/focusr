package io.github.marusako.focusr;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.Typeface;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONObject;

// 作業の時間帯の間だけ動く、フォアグラウンドサービス。画面 (src/renderer.js) が AppBlock.setPlan で渡した計画
// (作業の時間帯・止めるアプリ・文) を保存から読み、1 秒ごとに、今が時間帯の中か、前に出ているアプリが止めるアプリかを確かめる。
// 当てはまれば、画面いっぱいの「作業中」の画面 (残り時間と「ホームに戻る」ボタン) を、そのアプリの上に重ねる。
// 最後の時間帯が終わったら自分で止まる。画面が裏にあっても、保存した計画に沿って動く
public class AppBlockService extends Service {
    private static final String PREFS = "app-block";
    private static final String KEY_WINDOWS = "windows";
    private static final String KEY_APPS = "apps";
    private static final String KEY_TEXTS = "texts";
    private static final String CHANNEL = "app-block";
    private static final int NOTIFICATION_ID = 7303;
    // 最初の 1 回だけ、前に出ているアプリを決めるために読む、さかのぼる幅 (ms)
    private static final long FIRST_EVENT_RANGE_MS = 6L * 60 * 60 * 1000;
    // 2 回目からは、前回読んだ時刻のこれだけ前から読む (ms)。時刻の端での取りこぼしを防ぐ
    private static final long EVENT_OVERLAP_MS = 2 * 1000;

    // 動いているサービス (なければ null)。AppBlock から、計画の読み直しと停止を頼むために持つ
    private static AppBlockService instance;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private long[][] windows = new long[0][];
    private Set<String> apps = new HashSet<>();
    private String title = "";
    private String home = "";
    private String notice = "";
    private String channelName = "";
    // 前に出ているアプリ。時間帯の外でも毎回更新する。新しい出来事がなければ、前回の値を使い続ける
    private String foreground = "";
    // 前に読んだ出来事の中で、いちばん新しい時刻。これ以前の出来事は読み飛ばす
    private long lastEventTime;
    // 出来事を最後に読み終えた時刻 (0 は、まだ 1 回も読めていない)。次はここの少し前から読む
    private long lastQueryTime;
    private View overlay;
    private TextView remaining;
    private final Runnable tick = new Runnable() {
        @Override
        public void run() {
            if (check()) handler.postDelayed(this, 1000);
        }
    };

    static void save(Context context, String windowsJson, String appsJson, String textsJson) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_WINDOWS, windowsJson)
            .putString(KEY_APPS, appsJson)
            .putString(KEY_TEXTS, textsJson)
            .apply();
    }

    // 動いていれば、新しい計画を読み直させる (メインスレッドで)。動いていなければ false
    static boolean reload() {
        AppBlockService service = instance;
        if (service == null) return false;
        service.handler.post(() -> {
            service.load();
            service.handler.removeCallbacks(service.tick);
            service.handler.post(service.tick);
        });
        return true;
    }

    // 動いていれば止める。後片付けは onDestroy
    static void stop() {
        AppBlockService service = instance;
        if (service != null) service.handler.post(service::stopSelf);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        load();
        // 始めた直後は、5 秒以内に通知を出してフォアグラウンドにする決まりがある (すぐ止まるときも)
        startInForeground();
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_NOT_STICKY;
    }

    // アプリを最近使ったアプリの一覧から閉じたら、止める理由もなくなるので終わる
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        stopSelf();
    }

    @Override
    public void onDestroy() {
        instance = null;
        handler.removeCallbacks(tick);
        hideOverlay();
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // 保存した計画を読む。読めなければ空 (すぐ止まる)
    private void load() {
        SharedPreferences prefs = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        try {
            JSONArray list = new JSONArray(prefs.getString(KEY_WINDOWS, "[]"));
            long[][] loaded = new long[list.length()][];
            for (int i = 0; i < list.length(); i++) {
                JSONObject window = list.getJSONObject(i);
                loaded[i] = new long[] { window.getLong("from"), window.getLong("to") };
            }
            Set<String> names = new HashSet<>();
            JSONArray appList = new JSONArray(prefs.getString(KEY_APPS, "[]"));
            for (int i = 0; i < appList.length(); i++) names.add(appList.getString(i));
            JSONObject texts = new JSONObject(prefs.getString(KEY_TEXTS, "{}"));
            title = texts.optString("title", "Focus time");
            home = texts.optString("home", "Home");
            notice = texts.optString("notice", "App blocking is running");
            channelName = texts.optString("channel", "App blocking");
            windows = loaded;
            // 自分は止めない
            names.remove(getPackageName());
            apps = names;
        } catch (Exception e) {
            windows = new long[0][];
            apps = new HashSet<>();
        }
    }

    private void startInForeground() {
        NotificationManager manager = getSystemService(NotificationManager.class);
        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL, channelName, NotificationManager.IMPORTANCE_LOW);
            channel.setShowBadge(false);
            manager.createNotificationChannel(channel);
            builder = new Notification.Builder(this, CHANNEL);
        } else {
            builder = new Notification.Builder(this);
        }
        Notification notification = builder
            .setSmallIcon(R.drawable.ic_launcher_focusr)
            .setContentTitle(notice)
            .setContentIntent(TimerNotice.openApp(this))
            .setOngoing(true)
            .setShowWhen(false)
            .build();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    // 1 秒ごとの確かめ。次も続けるなら true (止まるときは false)
    private boolean check() {
        long now = System.currentTimeMillis();
        long end = currentWindowEnd(now);
        // 時間帯の外でも前に出ているアプリを追っておく (作業が始まる前から開いているアプリを見分けるため)
        updateForeground(now);
        if (end < 0) {
            hideOverlay();
            if (hasFutureWindow(now)) return true;
            stopSelf();
            return false;
        }
        if (apps.contains(foreground)) showOverlay(end - now);
        else hideOverlay();
        return true;
    }

    // 今の時間帯の終わりの時刻。時間帯の中でなければ -1
    private long currentWindowEnd(long now) {
        for (long[] window : windows) {
            if (window[0] <= now && now < window[1]) return window[1];
        }
        return -1;
    }

    private boolean hasFutureWindow(long now) {
        for (long[] window : windows) {
            if (window[1] > now) return true;
        }
        return false;
    }

    // 出来事から、今前に出ているアプリを調べる (最後に前に出たアプリ)。新しい出来事がなければ、前の値のまま。
    // 最初の 1 回は長い幅をさかのぼり、2 回目からは前回読み終えた時刻の少し前から読む (間が空いても取りこぼさない)
    private void updateForeground(long now) {
        UsageStatsManager stats = (UsageStatsManager) getSystemService(Context.USAGE_STATS_SERVICE);
        UsageEvents events;
        long from = lastQueryTime == 0 ? now - FIRST_EVENT_RANGE_MS : lastQueryTime - EVENT_OVERLAP_MS;
        try {
            events = stats.queryEvents(from, now);
        } catch (RuntimeException e) {
            return;
        }
        if (events == null) return;
        lastQueryTime = now;
        int resumed = Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q ? UsageEvents.Event.ACTIVITY_RESUMED : UsageEvents.Event.MOVE_TO_FOREGROUND;
        UsageEvents.Event event = new UsageEvents.Event();
        while (events.hasNextEvent()) {
            events.getNextEvent(event);
            // 前に読んだ出来事は読み直さない (「ホームに戻る」のあと、前のアプリに戻されないように)
            if (event.getEventType() != resumed || event.getTimeStamp() <= lastEventTime) continue;
            lastEventTime = event.getTimeStamp();
            foreground = event.getPackageName();
        }
    }

    // 重ねる画面を出す (もう出ていれば、残り時間だけ書きかえる)
    private void showOverlay(long remainingMs) {
        if (overlay == null) {
            if (!createOverlay()) return;
        }
        long seconds = Math.max(0, (remainingMs + 999) / 1000);
        remaining.setText(String.format(Locale.US, "%02d:%02d", seconds / 60, seconds % 60));
    }

    private boolean createOverlay() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setBackgroundColor(Color.rgb(38, 45, 56));
        int padding = (int) (24 * getResources().getDisplayMetrics().density);
        root.setPadding(padding, padding, padding, padding);

        TextView heading = new TextView(this);
        heading.setText(title);
        heading.setTextColor(Color.WHITE);
        heading.setTextSize(22);
        heading.setGravity(Gravity.CENTER);
        root.addView(heading);

        TextView time = new TextView(this);
        time.setTextColor(Color.WHITE);
        time.setTextSize(56);
        time.setTypeface(Typeface.MONOSPACE);
        time.setGravity(Gravity.CENTER);
        time.setPadding(0, padding, 0, padding);
        root.addView(time);

        Button button = new Button(this);
        button.setText(home);
        button.setOnClickListener((v) -> goHome());
        root.addView(button);

        int type = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
            : WindowManager.LayoutParams.TYPE_PHONE;
        WindowManager.LayoutParams params = new WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
            PixelFormat.OPAQUE
        );
        try {
            getSystemService(WindowManager.class).addView(root, params);
        } catch (RuntimeException e) {
            // 許可が外されたときなど。次の確かめでもう一度試す
            return false;
        }
        overlay = root;
        remaining = time;
        return true;
    }

    private void hideOverlay() {
        if (overlay == null) return;
        try {
            getSystemService(WindowManager.class).removeView(overlay);
        } catch (RuntimeException e) {
            // すでに消えている
        }
        overlay = null;
        remaining = null;
    }

    // 「ホームに戻る」: ホーム画面を開いて、重ねる画面を消す (開くのが先)
    private void goHome() {
        // ホーム画面が前に出るまでの間、止めるアプリが前に出ていると見られて、すぐ重ね直されないようにする
        foreground = "";
        // Android 15 では、裏からの Activity の起動に、重ねる画面が見えていることが要る場合があるので、起動を先にする
        startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        hideOverlay();
    }
}
