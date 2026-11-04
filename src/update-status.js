// 更新の案内バナーの状態 (画面 (DOM) に依存しない純粋関数)。
// Android 版が起動したときに GitHub の最新の Release を見て、新しい版の APK があれば知らせる (mobile-update.js)。
// 見つかったことと、ユーザーの操作・ダウンロードやインストールの進み具合をイベントとして受け取り、次の状態を返す。
//
// phase の移り変わり: idle → available → downloading → downloaded・failed・hidden
//   (ダウンロードまでをアプリでやり、インストールは Android に任せる。failed は retry で available に戻る)
// progress はダウンロードの進み具合 (0〜1)

export const INITIAL_UPDATE_STATE = Object.freeze({ phase: 'idle', version: null, progress: 0 });

const VISIBLE_PHASES = ['available', 'downloading', 'downloaded', 'failed'];

export function isBannerVisible(state) {
  return VISIBLE_PHASES.includes(state.phase);
}

export function nextUpdateState(state, event) {
  switch (event.type) {
    case 'available':
      return { ...state, phase: 'available', version: event.version, progress: 0 };
    case 'dismiss':
      return { ...state, phase: 'hidden' };
    case 'download':
      return { ...state, phase: 'downloading', progress: 0 };
    case 'progress': {
      if (state.phase !== 'downloading') return state;
      // 0〜1 に収め、遅れて届いた小さい値で戻さない
      const progress = Math.min(1, Math.max(0, Number(event.progress) || 0));
      return { ...state, progress: Math.max(state.progress, progress) };
    }
    case 'downloaded':
      return state.phase === 'downloading' ? { ...state, phase: 'downloaded' } : state;
    case 'fail':
      // 「あとで」で閉じたあと (ダウンロード中にも閉じられる) は、失敗しても出さない
      return state.phase === 'hidden' ? state : { ...state, phase: 'failed' };
    case 'retry':
      return state.phase === 'failed' ? { ...state, phase: 'available', progress: 0 } : state;
    default:
      return state;
  }
}

// バナーに出すもの: text (i18n の鍵)・percent (ダウンロード中だけ、0〜100 の整数)・actions (ボタンの種類の並び)。出さないときは null
export function updateBannerView(state) {
  switch (state.phase) {
    case 'available':
      return { text: 'updateAvailable', percent: null, actions: ['update', 'later'] };
    case 'downloading':
      // 通信が切れると、Android のダウンロードは失敗にせず待ち続ける。止まって見えても閉じられるように「あとで」を出す
      return { text: 'updateDownloading', percent: Math.round(state.progress * 100), actions: ['later'] };
    case 'downloaded':
      return { text: 'updateDownloaded', percent: null, actions: ['open', 'later'] };
    case 'failed':
      return { text: 'updateFailed', percent: null, actions: ['retry', 'browser', 'later'] };
    default:
      return null;
  }
}
