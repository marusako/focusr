# 作業中のアプリの制限（Android 版）

2026-11-03 に開発者が決めた方針。ROADMAP の「段階未定：作業中のアプリの制限」の最初の版。

## 決めたこと（2026-11-03、開発者）
- 作るのは Android 版だけ（Windows 版はなくした。Web 版はブラウザーの仕組み上、ほかのアプリに手を出せない）
- 作り方は「使用状況へのアクセス＋ほかのアプリの上に重ねて表示」（ユーザー補助は使わない。ストア以外から入れたアプリは、Android 13 から「制限付き設定を許可」の手順が要るため）
- 止めるのは、作業のタイマーが動いている間だけ（通常のタイマーの「作業」と、ラウンドの作業のコマ）。休憩中・一時停止中・止まっているとき・時間割モードでは止めない
- 途中でやめたいときは、通常のタイマーの作業なら一時停止すれば解除される。ラウンドの作業のコマは時計どおりに進むので一時停止では解除できず、設定で「制限する」をオフにすると解除できる（抜けにくくする工夫はしない）
- 止めるアプリは、入っているアプリの一覧から選ぶ
- 止めるアプリを開こうとしたら、その上に「作業中」の画面をかぶせる（残り時間と「ホームに戻る」ボタン）

## 仕組み
- 画面（renderer.js）は、タイマーが変わるたびに、この先の「作業の時間帯」の並び（`[{ from, to }]`）と止めるアプリの一覧を、Android の部品 `AppBlock` に渡す（ロック画面のタイマー `syncLockScreenTimer` と同じ時に、同じ区切り `timerSegments` から作る）
- Android の部品は、時間帯があればフォアグラウンドサービス（通知を出して動き続ける処理）を動かす。サービスは 1 秒ごとに、今が時間帯の中か、前に出ているアプリ（`UsageStatsManager` の直近の出来事）が止めるアプリかを確かめ、当てはまれば重ねる画面を出す。当てはまらなくなったら消す。最後の時間帯が終わったら、サービスを止める
- 画面が裏にあって止まっていても、渡した時間帯の並びに沿って動く（休憩のあと自動で始まる次の作業も止める）
- 一時停止・リセット・止めるのをやめた・アプリの一覧が空になった → 空の並びを渡し、サービスを止める
- Focusr 自身は止めない（一覧に出さず、渡されても無視する）

## 外から見える形

### 画面に依存しない純粋な関数（新しい `src/app-block.js`）
- `blockWindows(segments, now)` → `[{ from, to }]`
  - `segments` は `timerSegments` の返す並び（`{ mode, endAt }` か `{ round, phase, koma, endAt }`。時刻の順）
  - 作業の区切り（`mode === 'work'` か `phase === 'work'`）だけを時間帯にする。区切りの始まりは、1 つ前の区切りの `endAt`（最初の区切りは `now`）
  - 続いている作業の区切り（前の `to` と次の `from` が同じ）は 1 つにまとめる
  - `to <= now` の時間帯は入れない。最初の時間帯の `from` が `now` より前になることはない（`now` にそろえる）
  - 区切りがない・作業がない → `[]`
- `normalizeBlockedApps(list)` → 重なりを除き、並べ替えた文字列の配列
  - 文字列でないもの・空の文字列・パッケージ名の形（`a.b` のように `.` で区切られた英数字と `_`）でないものは捨てる。最大 200 個（超えた分は捨てる）
- `appBlockState({ isMobileApp, enabled, usageAccess, overlay, apps })` → 設定の欄の様子
  - `isMobileApp` が false → `'hidden'`
  - `enabled` が false → `'off'`
  - `usageAccess` か `overlay` が false → `'needsPermission'`
  - `apps` が空 → `'noApps'`
  - それ以外 → `'ready'`
- `shouldSendPlan(state)` は作らない（renderer.js で `appBlockState(...) === 'ready'` のときだけ時間帯を渡し、それ以外は空の並びを渡す）

### 設定（`src/settings.js`）
- `DEFAULT_SETTINGS` に `appBlockEnabled: false`、`appBlockApps: []` を足す
- `parseSettings`：`appBlockEnabled` は true のときだけ true。`appBlockApps` は `normalizeBlockedApps` を通す
- 書き出し・読み込みは今までどおり settings に入る

### Android の部品（新しい `mobile/AppBlock.java`、`mobile/AppBlockService.java`）
画面からは `Capacitor.Plugins.AppBlock` で呼ぶ。MainActivity で登録する。
- `status()` → `{ usageAccess: boolean, overlay: boolean }`（`AppOpsManager` の `OPSTR_GET_USAGE_STATS`、`Settings.canDrawOverlays`）
- `openUsageAccessSettings()`・`openOverlaySettings()`：Android の設定画面を開く（重ねて表示は、このアプリのページを直接開く）
- `listApps()` → `{ apps: [{ packageName, label }] }`：ホーム画面に出るアプリ（ランチャーのアプリ）。名前の順。Focusr 自身は除く
- `setPlan({ windows: [{ from, to }], apps: [packageName], texts: { title, home, notice } })`：保存して、時間帯があり、権限がそろっていればサービスを始める（なければ止める）。`texts` は重ねる画面とサービスの通知の文（画面の言語に合わせて渡す）
- サービス（`AppBlockService`）：フォアグラウンドサービスの種類は `specialUse`（Android 14 から種類の宣言が要る）。通知は「作業中のアプリの制限」のチャンネルに、目立たない形で出す
- 重ねる画面：画面いっぱい。「作業中」の文、残り時間（mm:ss。1 秒ごとに更新）、「ホームに戻る」ボタン（押すとホーム画面を開いて、重ねる画面を消す）

### ビルド（`android-build.yml`）
- AndroidManifest.xml に足す：
  - 権限 `PACKAGE_USAGE_STATS`・`SYSTEM_ALERT_WINDOW`・`FOREGROUND_SERVICE_SPECIAL_USE`（`FOREGROUND_SERVICE` はすでにある）
  - `<service android:name=".AppBlockService" android:exported="false" android:foregroundServiceType="specialUse">` と、その中の `<property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="...">`（何に使うかの短い説明）
  - `<queries>` にランチャーのアプリを探す `<intent>`（`MAIN` と `LAUNCHER`）。`QUERY_ALL_PACKAGES` は使わない

### 設定の画面（Android 版だけ）
- 設定の「一般」タブに「作業中のアプリの制限」の欄を足す（Web 版では出さない）
- 欄の中身（`appBlockState` で決める）
  - `off`：説明（「作業のタイマーが動いている間、選んだアプリを開けなくします。一時停止すると解除されます」）とオン・オフ
  - `needsPermission`：足りない権限ごとに「使用状況へのアクセスを許可」「ほかのアプリの上に重ねて表示を許可」のボタン（押すと Android の設定を開く）。アプリに戻ってきたら（`visibilitychange`）、権限を確かめ直す
  - `noApps`・`ready`：「止めるアプリを選ぶ（N 個）」のボタン。押すとアプリの一覧（チェックボックス。名前の順）を開き、チェックを変えるたびに保存する
- 文言は 10 言語すべてに足す

## 受け入れ条件
1. `npm test` が通る（終了コード 0）。`blockWindows`・`normalizeBlockedApps`・`appBlockState` と、設定の新しい項目（既定値・`parseSettings`）のテストがある
2. `npm run dev`（Web 版）で、制限の欄が出ず、ほかの画面が今までどおり動く（本体がブラウザーで確かめる）
3. GitHub Actions で開発版 APK がビルドできる（本体が確かめる）
4. 開発版を端末に入れて：権限の許可 → アプリを選ぶ → 作業のタイマーを始める → 選んだアプリを開くと「作業中」の画面が出て、「ホームに戻る」で戻れる。一時停止・休憩に入ると開ける。アプリを裏にしても止まる（開発者が確かめる）

## 進め方
- 役を分けて進める（test-writer → implementer → reviewer）。Java の部分は自動のテストができないので、reviewer に特に見てもらい、端末での確認は開発者にお願いする
- 費用の見込み（推測）：最初の版まで $10〜15。端末での直しが続いて $20 を超えそうなら、止めて相談する
- コミットは段階ごと。push は開発者が決める（push すると開発版 APK ができる）

## テストのコマンド
`npm test`（終了コード 0 で合格）。新しいテストは `test/app-block.test.js`、`test/settings.test.js` に足す
