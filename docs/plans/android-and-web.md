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
- `npm run dev`：`src` を `http://127.0.0.1:5173/` で配る小さなサーバー（`scripts/dev-server.mjs`。Node の標準の機能だけで作り、依存を増やさない）。開くとすぐ使える
- ポートは環境変数 `PORT` で変えられる（既定 5173）。外から見えないよう `127.0.0.1` だけで待つ。起動したら、開く URL を 1 行出す
- データはブラウザーの localStorage・IndexedDB にしまう（Web 版と同じ。オリジン（http://127.0.0.1:<ポート>）ごとに別なので、公開の Web 版とは混ざらず、開発サーバーのポートを変えても別のデータになる）

#### 外から見える形（`scripts/dev-server.mjs` が export する）
- `resolveRequestPath(root, urlPath)` → 配るファイルの絶対パス、または `null`
  - `?` や `#` のあとは捨てる。`%E3%81%82` などの URL の符号は戻す（戻せない文字列なら `null`）
  - `/` で終わるときは、その下の `index.html`
  - `root` の外に出るパス（`/../package.json`、`/%2e%2e/x` など）は `null`
- `contentTypeFor(filePath)` → Content-Type。拡張子で決める（大文字も同じに扱う）
  - `.html` → `text/html; charset=utf-8`、`.js`・`.mjs` → `text/javascript; charset=utf-8`、`.css` → `text/css; charset=utf-8`、`.json` → `application/json; charset=utf-8`、`.svg` → `image/svg+xml`、`.png` → `image/png`、`.jpg`・`.jpeg` → `image/jpeg`、`.webp` → `image/webp`、`.woff2` → `font/woff2`、`.mp3` → `audio/mpeg`、`.ogg` → `audio/ogg`、`.wav` → `audio/wav`、`.ico` → `image/x-icon`
  - それ以外 → `application/octet-stream`
- `createDevServer({ root })` → Node の `http.Server`（まだ listen していない）
  - GET・HEAD：ファイルがあれば 200 と中身（HEAD は中身なし）。Content-Type は `contentTypeFor`。`Cache-Control: no-store`（直したらすぐ見えるように）
  - ファイルがない・`root` の外・フォルダーで `index.html` がない → 404
  - GET・HEAD 以外 → 405
- 直接実行したとき（`node scripts/dev-server.mjs`）だけ、`src` を root にして listen する。import しただけでは listen しない
- `package.json` の scripts に `"dev": "node scripts/dev-server.mjs"` を足す

### Android の開発版 APK
- 完成版と並べて入れられるよう、識別子（applicationId）を `io.github.marusako.kugiritimer.dev`（2026-11-03 に識別子を変えたので、今は `io.github.marusako.focusr.dev`）、名前を「Focusr (開発版)」にした APK を作る
  - Java のパッケージ名（namespace）は変えない。mobile/*.java はそのまま使える（通知のボタンは明示的な Intent なので、2 つ入れてもぶつからない）
  - 識別子が違うと Android は別のアプリとして扱うので、データは自動で別々になる
  - versionName は `<版>-dev`（設定画面の版の表示で開発版だと分かる）
- 作るのは GitHub Actions：`android-build.yml` に入力 `variant`（`release` か `dev`。既定 `release`）を足す。`android.yml`（main に push・手で動かしたとき）は `dev` で呼び、APK は下書き（draft）の Release「dev」に `focusr-dev.apk` として上書きで置く（2026-11-03 に変更。Actions の成果物は、公開リポジトリではログインした人なら誰でも取れるため。下書きは書き込める人にしか見えない）。release.yml は今までどおり
- 書き換えは sed ではなく、テストできる Node のスクリプトでする

#### 外から見える形
- `scripts/android-variant.mjs` が export する `applyDevVariant({ gradle, strings })` → `{ gradle, strings }`
  - `gradle`（android/app/build.gradle の中身）の `applicationId "X"` を `applicationId "X.dev"` にする。`namespace` の行は変えない
  - `strings`（res/values/strings.xml の中身）の `app_name` と `title_activity_main` の値を `Focusr (開発版)` にする
  - 書き換える場所が見つからない・すでに `.dev` になっているときは Error を投げる（ビルドを止めて気づけるように）
- 直接実行したとき（`node scripts/android-variant.mjs dev <android のフォルダー>`）だけ、2 つのファイルを読み、書き換えて保存する
- `src/mobile-update.js` に `isDevAppId(appId)` を足す：`.dev` で終わる識別子なら true。renderer.js は `mobileApp.getInfo()` の `id` がこれに当たるとき、更新の確認（GitHub の Release を見る）をしない。版の表示はする

### 受け入れ条件
1. `npm test` が通る（終了コード 0）。上の 3 つの関数と、サーバーを port 0 で実際に listen して fetch で確かめるテストがある（200・404・405・HEAD・`root` の外・Content-Type・Cache-Control）
2. `npm run dev` で開き、すべての画面が動く（本体がブラウザーで確かめる）
3. 開発版 APK と完成版 APK を、同じ端末に同時に入れられる。データは別々（APK は push 後に Actions で作られる。端末での確認は開発者）
4. 開発版で、更新のバナーが出ない

### テストのコマンド
`npm test`（終了コード 0 で合格）。新しいテストは `test/dev-server.test.js`・`test/android-variant.test.js`、`test/mobile-update.test.js` に `isDevAppId` を足す。`test/syntax.test.js` の一覧に `scripts/*.mjs` を加える

## 段階 3：Web 版（GitHub Pages）

URL は `https://marusako.github.io/focusr/`（2026-11-03 にリポジトリの名前を focusr に変えた。公開したときは `/kugiri-timer/` だった）。

### 調べてわかったこと（2026-11-03）
- index.html・CSS・JS の中のパスはすべて相対なので、`/focusr/` のようなサブパスの下でもそのまま動く
- 外部カレンダーは、Web 版ではすでに隠れている（`calendarFeeds` が null のとき `#feeds-section` を出さない）
- Android 版だけの設定項目は、設定画面にない（ロック画面・システムの帯は自動で動く）
- 通知：`showNotification` は Web 版でブラウザーの `Notification` を出すが、**許可を一度も求めていない**ので、実際には出ない

### 公開の仕組み
- 新しい `.github/workflows/pages.yml`：main に push したとき（`src/**` か pages.yml が変わったとき）と、手で動かしたとき
  - `npm ci` → `npm test` → `src` をそのまま GitHub Pages の成果物にして公開する（`actions/upload-pages-artifact` と `actions/deploy-pages`。版は作るときに最新を確かめる）
  - 権限は `pages: write`・`id-token: write`・`contents: read`。公開は一度に 1 つずつ。走っている公開は途中で止めず、待っているものは最新の 1 つだけを残す（concurrency。`cancel-in-progress: false`。GitHub の公式のひな形と同じ）
- リポジトリの設定で、Pages の公開元を「GitHub Actions」にする（本体が `gh api` でする。外に影響するので、する前に開発者に確かめる）

### 通知の許可（新しい振る舞い）
- 設定パネルの「データ」の上に「通知」の欄を足す。Web 版で、ブラウザーに `Notification` があるときだけ出す（Android 版では出さない。Android は起動時に許可を求めている）
- 欄の中身は、許可の状態で変わる
  - まだ決めていない（`default`）：説明と「通知を許可する」ボタン。押すと `Notification.requestPermission()`
  - 許可済み（`granted`）：「通知はオンです（このタブを開いている間だけ届きます）」
  - 拒否（`denied`）：「ブラウザーの設定で通知がブロックされています。アドレスバーの左のマークから変えられます」（今の Chrome は鍵のアイコンではないため、「左のマーク」にした）
- 文言は 10 言語すべてに足す（i18n のテストが、全言語に同じ鍵があるかを確かめている）

#### 外から見える形
- 新しい `src/web-notice.js` が export する `webNoticeState({ isMobileApp, hasNotification, permission })` → `'hidden'` | `'ask'` | `'on'` | `'blocked'`
  - `isMobileApp` が true、または `hasNotification` が false → `'hidden'`
  - `permission` が `'granted'` → `'on'`、`'denied'` → `'blocked'`、それ以外（`'default'`・知らない値・undefined）→ `'ask'`
- renderer.js は、起動したときと、ボタンを押して許可の結果が返ったときに、この関数で欄を描き直す

### 外部カレンダー
- Web 版では今までどおり隠す。かわりに、カレンダーの設定の欄に「外部カレンダーの取り込みは Android 版だけで使えます」の 1 行を出す（Web 版だけ）

### README
- Web 版の URL と、できること・できないこと（外部カレンダーなし、通知はタブを開いている間だけ、データはそのブラウザーの中だけ）を書く

### 受け入れ条件
1. `npm test` が通る（終了コード 0）。`webNoticeState` のテストがある。i18n のテストで、新しい文言が全言語にある
2. `npm run dev` で開き、通知の欄が出て、ボタンで許可を求められる（本体がブラウザーで確かめる）
3. 公開した URL で開いて、タイマー・ストップウォッチ・レベル・カレンダー・設定・データの書き出しと読み込みが動く。コンソールにエラーがない（本体が確かめる）
4. 外部カレンダーなど使えないものが、壊れた状態で出ていない
5. Android 版の動きは変わらない（通知の欄が出ない）

### テストのコマンド
`npm test`（終了コード 0 で合格）。新しいテストは `test/web-notice.test.js`

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
