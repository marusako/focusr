# Windows 版の廃止と、Android 版・Web 版への切り替え

2026-11-03 に開発者が決めた方針を、段階に分けて進める。各段階の終わりに `npm test` が通り、開発者が確かめてから次へ進む。

## 決めたこと（2026-11-03、開発者）
- Windows 版（Electron）は廃止する。今使っている人への知らせの版は出さない（配信をやめるだけ。今の版のまま更新が来なくなる）
- パソコン版のコードは全部消す（Git の履歴には残る）
- 開発中の確認は、ブラウザーで開く開発版と、完成版と並べて入れられる Android の開発版 APK の 2 つ
- Web 版を作る。置き場所は GitHub Pages。最初は普通のサイトにして、PWA（インストール・オフライン）は次の段階
- リリースは、開発者が言ったときだけ（今までどおり）

## 段階 1：Windows 版（Electron）を消す

### 消すもの
- ファイル：`main.js`・`preload.cjs`・`data-store.js`・`media-store.js`・`calendar-feeds.js`・`legacy-data.js`・`src/app-identity.js`
- テスト：`test/app-identity.test.js`・`test/legacy-data.test.js`、ほかに上のファイルだけを確かめているテスト。`test/syntax.test.js` の一覧から、消したファイルを外す
- `package.json`：`main`・`start`・`dist`・`build`（electron-builder の設定）・依存の `electron`・`electron-builder`・`electron-updater`。`description` を Android・Web 向けに直す
- `src/renderer.js`：`window.dataStore`・`window.media`・`window.updater`・`window.windowControls`・`window.calendarFeeds`・`window.notifier`・`window.appLinks` を使う分岐（パソコン版のときだけ通る道）。パソコン版だけの設定の項目（あれば）
- 更新のバナー（`#update-banner`・`src/update-status.js`）は、Android 版が新しい APK を知らせるのに使うので残す。ただし、パソコン版だけの段階（ダウンロード中・ダウンロード済み・失敗・再試行・再起動して更新）と、その翻訳の項目は消し、「知らせる（available）・閉じる（dismiss）」だけにする
- 全画面のボタン（`#toggle-fullscreen`。Electron でだけ出していた）と、その翻訳の項目。`src/fullscreen.js` の Esc で全画面を抜ける判断も消す（Android の「戻る」の判断は残す）。Web 版で、ブラウザーの全画面の機能を使って出し直すかは段階 3 で決める
- クレジットの「GitHub」ボタン（`#open-repository`。Electron でだけ出していた）
- `src/media-rules.js` の `mediaUrl`（パソコン版の app-media: の URL）と、index.html の CSP の `app-media:`
- コメントの中の、パソコン版を前提にした説明（「パソコン版は〜」など）。残す処理の説明は、Android 版・Web 版の説明に直す
- `.github/workflows/release.yml`：Windows（`windows-latest`）での exe のビルドと公開。かわりに、Release を作って Android の APK を加えるだけにする（`ubuntu-latest`）
- README：Windows・exe・SmartScreen・自動アップデートの説明

### 残すもの（Android 版と共通）
- `src/fonts.js`・`src/media-rules.js`・`src/fullscreen.js`（「1 つ戻る」の判断だけになるので、`src/back-action.js` に名前を変えた）・`src/update-status.js`（renderer.js・settings.js・web-media.js が使う。パソコン版だけの部分は上のとおり消す）
- `src/data-file.js`（書き出し・読み込みのファイルの形。Android 版と Web 版で使う）

### 受け入れ条件
1. `npm test` が通る（終了コード 0）
2. `git grep -n -i electron` で、消し忘れが見つからない（ROADMAP・release-notes・docs/plans の過去の記録と、README の「配信をやめた」の説明は除く）
3. ブラウザー（段階 2 の開発版）で開いて、タイマー・ストップウォッチ・レベル・カレンダー・設定・データの書き出しと読み込みが今までどおり動く
4. Android の APK が GitHub Actions でビルドできる

## 段階 2：開発の仕組み

### ブラウザーの開発版
- `npm run dev`：`src` を `http://localhost:5173/` で配る小さなサーバー（`scripts/dev-server.mjs`。Node の標準の機能だけで作り、依存を増やさない）。開くとすぐ使える
- データはブラウザーの localStorage・IndexedDB にしまう（Web 版と同じ。localhost なので、公開の Web 版とは混ざらない）

### Android の開発版 APK
- 完成版と並べて入れられるよう、識別子（appId）を `io.github.marusako.kugiritimer.dev`、名前を「Focusr (開発版)」にした APK を作る
- 作るのは GitHub Actions（今の `android.yml` を開発版用にする。main に push したときと、手で動かしたとき）。できた APK は Actions の Artifact から取る
- 開発版は、更新の知らせ（GitHub の Release を見る仕組み）を出さない

### 受け入れ条件
1. `npm run dev` で開き、すべての画面が動く
2. 開発版 APK と完成版 APK を、同じ端末に同時に入れられる。データは別々

## 段階 3：Web 版（GitHub Pages）

- GitHub Actions で、main に push したときに `src` を GitHub Pages に公開する（新しい workflow。`test` が通ったときだけ）
- Web 版で使えないものは、画面に出さないか、使えない理由を出す
  - 外部カレンダー（カレンダーのサーバーが、ほかのサイトからの読み取りを許していない（CORS）ため）
  - Android 版だけの設定（ロック画面・システムの帯など）
- 通知は、ブラウザーの通知の許可を求めて出す（タブを開いている間だけ）
- README に Web 版の URL と、できること・できないことを書く

### 受け入れ条件
1. 公開した URL で開いて、段階 1 の 3 と同じことが動く
2. 外部カレンダーなど使えないものが、壊れた状態で出ていない
3. Android 版の動きは変わらない

## あとの段階（この計画では作らない）
- PWA（manifest・Service Worker。インストールとオフライン）
- リポジトリの名前を focusr に変える（Web 版の URL も変わる）
- ROADMAP の「作業中のアプリの制限」の Windows の部分を消す

## 進め方
- 消す作業（段階 1）は、役（test-writer など）を使わず本体で進め、終わったら reviewer に差分を見てもらう（新しい振る舞いを作らないため、新しいテストは少ない）
- 段階 2・3 の新しい振る舞い（開発用サーバー・Web 版で使えないものを隠す判断）は、役を分けて進める
- 段階ごとにコミットする。push は開発者が決める

## テストのコマンド
`npm test`（終了コード 0 で合格）
