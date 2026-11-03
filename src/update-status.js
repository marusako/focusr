// 更新の案内バナーの状態 (画面 (DOM) に依存しない純粋関数)。
// Android 版が起動したときに GitHub の最新の Release を見て、新しい版の APK があれば知らせる (mobile-update.js)。
// 見つかったことと、ユーザーの操作・ダウンロードやインストールの進み具合をイベントとして受け取り、次の状態を返す。
//
// phase の移り変わり: idle → available → needsPermission・downloading・installing → failed・hidden
//   (needsPermission は、「不明なアプリのインストール」の許可がないとき。failed と needsPermission は retry で available に戻る)
// progress はダウンロードの進み具合 (0〜1)

export const INITIAL_UPDATE_STATE = Object.freeze({ phase: 'idle', version: null, progress: 0 });

const VISIBLE_PHASES = ['available', 'needsPermission', 'downloading', 'installing', 'failed'];

export function isBannerVisible(state) {
  return VISIBLE_PHASES.includes(state.phase);
}

export function nextUpdateState(state, event) {
  switch (event.type) {
    case 'available':
      return { ...state, phase: 'available', version: event.version, progress: 0 };
    case 'dismiss':
      return { ...state, phase: 'hidden' };
    case 'needsPermission':
      return { ...state, phase: 'needsPermission' };
    case 'download':
      return { ...state, phase: 'downloading', progress: 0 };
    case 'progress': {
      if (state.phase !== 'downloading') return state;
      // 0〜1 に収め、遅れて届いた小さい値で戻さない
      const progress = Math.min(1, Math.max(0, Number(event.progress) || 0));
      return { ...state, progress: Math.max(state.progress, progress) };
    }
    case 'install':
      return { ...state, phase: 'installing' };
    case 'fail':
      return { ...state, phase: 'failed' };
    case 'retry':
      return state.phase === 'failed' || state.phase === 'needsPermission' ? { ...state, phase: 'available', progress: 0 } : state;
    default:
      return state;
  }
}

// バナーに出すもの: text (i18n の鍵)・percent (ダウンロード中だけ、0〜100 の整数)・actions (ボタンの種類の並び)。出さないときは null
export function updateBannerView(state) {
  switch (state.phase) {
    case 'available':
      return { text: 'updateAvailable', percent: null, actions: ['update', 'later'] };
    case 'needsPermission':
      return { text: 'updateNeedsPermission', percent: null, actions: ['allow', 'later'] };
    case 'downloading':
      return { text: 'updateDownloading', percent: Math.round(state.progress * 100), actions: [] };
    case 'installing':
      return { text: 'updateInstalling', percent: null, actions: [] };
    case 'failed':
      return { text: 'updateFailed', percent: null, actions: ['retry', 'browser', 'later'] };
    default:
      return null;
  }
}
