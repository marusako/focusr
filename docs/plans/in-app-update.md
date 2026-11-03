# アプリの中からの更新（Android 版）

2026-11-03 に開発者が頼んだこと：「アプリのアップデートを今よりやりやすくしたい（Windows 版のように、アプリ内で操作して自動でアップデートできる仕組み）」。

## 今の動き
起動したときに GitHub の最新の Release を見て、新しい版の APK があればバナーで知らせる。「更新する」を押すとブラウザーで Release のページを開き、そこで APK をダウンロードして、自分でインストールする（`src/mobile-update.js` の `apkUpdate`、`src/update-status.js`）。

## 新しい動き
1. バナーの「更新する」を押すと、アプリの中で APK をダウンロードする（バナーに進み具合 0〜100% を出す）
2. ダウンロードが終わると、Android のインストールの仕組み（`PackageInstaller`）に渡す。Android の確認の画面が出たら、利用者が「更新」を押す。入れ替わると、アプリは自動で閉じる（次に開くと新しい版）
3. Focusr に「不明なアプリのインストール」の許可がないときは、バナーに説明と「許可する」のボタンを出す（押すと Android の設定のこのアプリのページを開く）。許可してアプリに戻ってきたら（`visibilitychange`）、もう一度確かめて、許可されていればダウンロードを始める
4. 失敗したとき（通信が切れた・APK がおかしい・インストールが取り消された）は、バナーに「更新できませんでした」と「もう一度」「ブラウザーで開く」（今までの、Release のページを開く動き）を出す
5. Android 12 以降で、前回の更新を Focusr 自身が入れていれば、確認の画面なしで入れ替わることがある（`setRequireUserAction(USER_ACTION_NOT_REQUIRED)` と `UPDATE_PACKAGES_WITHOUT_USER_ACTION`。Android の決まりで、確認が出ることもある。出たらそのまま 2 の流れ）
6. 開発版は、今までどおり更新を確かめない

### 決めたこと（Claude の案。開発者の OK 待ち）
- ダウンロードする APK は、`apkUpdate` が見つけたものだけ（このリポジトリの Release の `focusr-<版>.apk`）
- インストールの前に、ダウンロードした APK の中身を確かめる：パッケージ名が自分と同じで、版の番号（versionCode）が今より大きいこと。違えば入れずに失敗にする（署名が違う APK は Android が入れないので、そこは Android に任せる）
- ダウンロードは、アプリのキャッシュのフォルダー（ほかのアプリから見えない）に置き、入れ終わったか失敗したら消す
- 「あとで」で閉じたら、次に起動するまで出さない（今と同じ）

## 外から見える形

### `src/mobile-update.js`
- `apkUpdate(release, currentVersion)` の返す値に `apk`（APK の `browser_download_url`。今も確かめている、このリポジトリの Release の URL）を足す → `{ version, page, apk }`

### `src/update-status.js`（バナーの状態。純粋な関数）
- 状態：`{ phase, version, progress }`
- phase：`idle` → `available` → `needsPermission`・`downloading`・`installing` → `failed`・`hidden`
- 出来事（`nextUpdateState(state, event)` の `event.type`）
  - `available`（`version`）：`available` にする
  - `dismiss`：`hidden`
  - `needsPermission`：`needsPermission`
  - `download`：`downloading`、`progress: 0`
  - `progress`（`progress`。0〜1）：`downloading` のときだけ、`progress` を 0〜1 に収めて更新する（減らさない）
  - `install`：`installing`
  - `fail`：`failed`
  - `retry`：`failed` か `needsPermission` のときだけ `available` に戻す
- `isBannerVisible(state)`：`available`・`needsPermission`・`downloading`・`installing`・`failed` のとき true
- `updateBannerView(state)` → `{ text, percent, actions }`（`text` は i18n の鍵、`percent` は `downloading` のときだけ 0〜100 の整数、`actions` はボタンの種類の並び：`update`・`later`・`allow`・`retry`・`browser`）
  - `available`：`updateAvailable`、`['update', 'later']`
  - `needsPermission`：`updateNeedsPermission`、`['allow', 'later']`
  - `downloading`：`updateDownloading`、`percent`、`[]`
  - `installing`：`updateInstalling`、`[]`
  - `failed`：`updateFailed`、`['retry', 'browser', 'later']`
  - それ以外：`null`

### Android の部品（新しい `mobile/AppUpdate.java`、`mobile/AppUpdateReceiver.java`）
画面からは `Capacitor.Plugins.AppUpdate` で呼ぶ。MainActivity で登録する。
- `canInstall()` → `{ allowed }`（`PackageManager.canRequestPackageInstalls()`）
- `openInstallSettings()`：`Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES` をこのアプリのページで開く
- `download({ url })` → 終わったら resolve（`{ ok: true }`）。別のスレッドで HTTPS だけを受け付けてダウンロードし、進み具合を `notifyListeners('updateProgress', { received, total })` で知らせる。失敗したら reject
- `install()`：ダウンロードした APK を確かめ（パッケージ名・versionCode）、`PackageInstaller` のセッションで入れる。Android 12 以降は `setRequireUserAction(USER_ACTION_NOT_REQUIRED)`。結果は `AppUpdateReceiver`（外から呼べない受け取り口）で受け、確認の画面が要るとき（`STATUS_PENDING_USER_ACTION`）はその画面を開く。失敗・取り消しは `notifyListeners('updateResult', { ok: false, message })` で画面に知らせる（成功したときはアプリが入れ替わって閉じるので、知らせは届かない）

### ビルド（`android-build.yml`）
- 権限 `REQUEST_INSTALL_PACKAGES`・`UPDATE_PACKAGES_WITHOUT_USER_ACTION` と、受け取り口 `<receiver android:name=".AppUpdateReceiver" android:exported="false" />` を足す（既存の sed の書き方に合わせ、足せたかを grep で確かめる）

### 画面（`src/renderer.js`・`src/index.html`）
- バナーを `updateBannerView` で描く。ボタンは、文が入れ替わる 1〜3 個（`update`「更新する」・`later`「あとで」・`allow`「許可する」・`retry`「もう一度」・`browser`「ブラウザーで開く」）。ダウンロード中は進み具合（％と細い棒）
- 文言は 10 言語すべてに足す

## 受け入れ条件
1. `npm test` が通る（終了コード 0）。`apkUpdate` の `apk`、`nextUpdateState` のすべての出来事、`isBannerVisible`、`updateBannerView` のテストがある
2. GitHub Actions で開発版と完成版の APK がビルドできる
3. 端末で、0.3.0 を入れた状態から、そのあとの版（0.3.1 など）に、アプリの中から更新できる（開発者が確かめる）
   - 注意：今入っている 0.2.0 には、この仕組みが入っていない。なので 0.2.0 → 0.3.0 は、今までどおりブラウザーで入れる。アプリの中からの更新を本当に確かめられるのは、0.3.0 を入れたあとの、次のリリースのとき

## 進め方
- 役を分けて進める（test-writer → implementer → reviewer）。Java は自動のテストができないので、reviewer に特に見てもらう
- 費用の見込み（推測）：$8〜15。超えそうなら止めて相談する
- リリース（0.3.0）は、開発者が言ったときだけ

## テストのコマンド
`npm test`（終了コード 0 で合格）。テストは `test/mobile-update.test.js`・`test/update-status.test.js` に足す・直す
