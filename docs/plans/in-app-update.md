# アプリの中からの更新（Android 版）

2026-11-03 に開発者が頼んだこと：「アプリのアップデートを今よりやりやすくしたい（Windows 版のように、アプリ内で操作して自動でアップデートできる仕組み）」。

## 経緯
1. 最初の形（2026-11-03、コミット e6a4e7f）：アプリの中で APK をダウンロードし、`PackageInstaller` で入れる。権限 `REQUEST_INSTALL_PACKAGES`・`UPDATE_PACKAGES_WITHOUT_USER_ACTION` を足した
2. この権限を足した開発版を入れようとすると、Google Play プロテクトが「有害なアプリをブロックしました」と止めた。権限を外した開発版（8bd4d8b）は止められなかった。原因はこの権限（単独か、アプリの制限の「ほかのアプリの上に重ねて表示」との組み合わせか）だと考えている（推測。Google は理由を公開していない）
3. 2026-11-04、開発者が「ダウンロードだけアプリでやり、インストールは Android に任せる」形を選んだ（この設計書）

## 新しい動き
1. バナーの「更新する」を押すと、Android のダウンロードの仕組み（`DownloadManager`）で APK をダウンロードする。バナーに進み具合 0〜100% を出す。Android の通知にも進み具合が出る
2. 終わると、Android の「ダウンロードが完了しました」の通知が出る。通知を押すと、Android のインストールの画面が出る。バナーは「ダウンロードしました」になり、「ダウンロードを開く」（Android のダウンロードの一覧を開く）と「あとで」を出す
3. 最初の 1 回は、Android が「ダウンロード」（または「ファイル」）アプリに「不明なアプリのインストール」を許可するかを聞く（Focusr の許可ではない）
4. 通信が切れたときは、Android のダウンロードは失敗にせず、通信が戻るまで待って続きから再開する。止まって見えても閉じられるように、ダウンロード中のバナーにも「あとで」を出す（閉じてもダウンロードは Android が続け、終われば完了の通知が出る）。失敗したとき（保存できない・取り消された）は、バナーに「更新できませんでした」と「もう一度」「ブラウザーで開く」（今までの、Release のページを開く動き）「あとで」を出す
5. 開発版は、今までどおり更新を確かめない

### Focusr が権限なしで済む根拠（AOSP、Android 14 のソースで確かめた）
- `DownloadProvider` の `OpenHelper.java`：完了の通知を押すと、DownloadProvider が APK を開く
- `PackageInstaller` の `InstallStart.java`：頼んできたのが DownloadProvider（`isSystemDownloadsProvider`）か、文書の管理の権限（`MANAGE_DOCUMENTS`。「ファイル」アプリ）を持つアプリのときは、「`REQUEST_INSTALL_PACKAGES` を宣言しているか」の確かめを飛ばす。「不明なアプリのインストール」の許可は、そのアプリ（DownloadProvider など）のものを見る
- Focusr 自身が APK を開く（`ACTION_VIEW`）と、Focusr が権限を宣言していないので止められる。なので、アプリの中に「インストールする」ボタンは作らず、「ダウンロードを開く」（`DownloadManager.ACTION_VIEW_DOWNLOADS`）にする
- 機種・Android の版で違うことがあるので、端末で確かめる（受け入れ条件 3）

### 決めたこと
- ダウンロードする APK は、`apkUpdate` が見つけたものだけ（このリポジトリの Release の `focusr-<版>.apk`）
- 保存先：Android 10 以降は「ダウンロード」フォルダー（`Environment.DIRECTORY_DOWNLOADS`）の `focusr-<版>.apk`（権限は要らない）。Android 9 以前は、アプリ専用の外部のフォルダー（`setDestinationInExternalFilesDir`。権限は要らない）
- 前に頼んだダウンロード（ID と版を覚えておく）が同じ版なら、取り直さない：終わっていればすぐ resolve、途中ならその ID のまま見張り直す。違う版・失敗した・消されたものは、新しく頼む前に `DownloadManager.remove` で消す（ファイルも消える）。古い APK がたまらないように
- 「ダウンロードを開く」でダウンロードの一覧を開けなかったときは、Release のページを開く（失敗にして「もう一度」を出すと、ダウンロードできた APK を消して取り直すため）
- APK の中身の確かめ（パッケージ名・versionCode）はやめる。入れる前に Focusr が触れないため。署名の違う APK は Android が入れない。URL はこのリポジトリの Release だけに絞っている
- 権限 `REQUEST_INSTALL_PACKAGES`・`UPDATE_PACKAGES_WITHOUT_USER_ACTION` と、受け取り口 `AppUpdateReceiver` は、完成版からも消す
- 「あとで」で閉じたら、次に起動するまで出さない（今と同じ）

## 外から見える形

### `src/mobile-update.js`
- 変えない（`apkUpdate(release, currentVersion)` → `{ version, page, apk }`）

### `src/update-status.js`（バナーの状態。純粋な関数）
- 状態：`{ phase, version, progress }`
- phase：`idle` → `available` → `downloading` → `downloaded`・`failed`・`hidden`（`needsPermission`・`installing` はなくす）
- 出来事（`nextUpdateState(state, event)` の `event.type`）
  - `available`（`version`）：`available` にする
  - `dismiss`：`hidden`
  - `download`：`downloading`、`progress: 0`
  - `progress`（`progress`。0〜1）：`downloading` のときだけ、`progress` を 0〜1 に収めて更新する（減らさない）
  - `downloaded`：`downloading` のときだけ `downloaded` にする
  - `fail`：`failed`（`hidden` のときは何も変えない。ダウンロード中に「あとで」で閉じたあとに失敗しても、また出さない）
  - `retry`：`failed` のときだけ `available` に戻す
  - 前の形の `needsPermission`・`install` は、何も変えない（状態をそのまま返す）
- `isBannerVisible(state)`：`available`・`downloading`・`downloaded`・`failed` のとき true
- `updateBannerView(state)` → `{ text, percent, actions }`（`text` は i18n の鍵、`percent` は `downloading` のときだけ 0〜100 の整数、`actions` はボタンの種類の並び）
  - `available`：`updateAvailable`、`['update', 'later']`
  - `downloading`：`updateDownloading`、`percent`、`['later']`
  - `downloaded`：`updateDownloaded`、`['open', 'later']`
  - `failed`：`updateFailed`、`['retry', 'browser', 'later']`
  - それ以外：`null`

### Android の部品（`mobile/AppUpdate.java` を作り直す。`mobile/AppUpdateReceiver.java` は消す）
画面からは `Capacitor.Plugins.AppUpdate` で呼ぶ。
- `download({ url, version })`：URL が `https://github.com/marusako/focusr/releases/download/` で始まり、`version` が `数字.数字.数字` でなければ reject。前のダウンロードを消してから `DownloadManager` に頼む（通知は `VISIBILITY_VISIBLE_NOTIFY_COMPLETED`、種類は `application/vnd.android.package-archive`）。0.5 秒ごとに進み具合を調べて `notifyListeners('updateProgress', { received, total })`。終わったら resolve（`{ ok: true }`）、失敗・取り消しなら reject
- `openDownloads()`：Android のダウンロードの一覧を開く（`DownloadManager.ACTION_VIEW_DOWNLOADS`）
- `canInstall`・`openInstallSettings`・`install`・`updateResult` の知らせはなくす

### ビルド（`android-build.yml`）
- 「アプリの中からの更新の部品の受け取り口と権限を足す」の手順を消す。完成版にも開発版にも、`REQUEST_INSTALL_PACKAGES` が入っていないことを grep で確かめる（入っていたら止める）

### 画面（`src/renderer.js`・`src/index.html`）
- ボタンの種類：`update`「更新する」・`later`「あとで」・`open`「ダウンロードを開く」・`retry`「もう一度」・`browser`「ブラウザーで開く」（`allow`「許可する」はなくす）
- 許可から戻ってきたとき（`visibilitychange`）にやり直す動きはなくす
- 文言：`updateDownloaded`（「ダウンロードしました。通知か「ダウンロードを開く」から入れてください」）と `updateOpen` を 10 言語すべてに足す。使わなくなった `updateNeedsPermission`・`updateInstalling`・`updateAllow` は消す

## 受け入れ条件
1. `npm test` が通る（終了コード 0）。`nextUpdateState` のすべての出来事（前の形の `needsPermission`・`install` を無視することも）、`isBannerVisible`、`updateBannerView` のテストがある
2. GitHub Actions で開発版と完成版の APK がビルドでき、どちらにも `REQUEST_INSTALL_PACKAGES` が入っていない
3. 端末で、0.3.0 を入れた状態から、そのあとの版（0.3.1 など）に、通知（または「ダウンロードを開く」）から更新できる。Play プロテクトに止められない（開発者が確かめる）
   - 注意：今入っている 0.2.0 には、この仕組みが入っていない。0.2.0 → 0.3.0 は、今までどおりブラウザーで入れる

## 進め方
- 役を分けて進める（test-writer → implementer → reviewer）。Java は自動のテストができないので、reviewer に特に見てもらう
- 費用の見込み（推測）：$5〜10。超えそうなら止めて相談する
- リリース（0.3.0）は、開発者が言ったときだけ

## テストのコマンド
`npm test`（終了コード 0 で合格）。テストは `test/update-status.test.js` を直す
