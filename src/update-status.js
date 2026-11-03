// 更新の案内バナーの状態 (画面 (DOM) に依存しない純粋関数)。
// Android 版が起動したときに GitHub の最新の Release を見て、新しい版の APK があれば知らせる (mobile-update.js)。
// 見つかったことと、ユーザーの操作 (「更新する」「あとで」) をイベントとして受け取り、次の状態を返す。
//
// phase の移り変わり: idle → available → hidden (「更新する」「あとで」のどちらでも閉じる)

export const INITIAL_UPDATE_STATE = Object.freeze({ phase: 'idle', version: null });

export function isBannerVisible(state) {
  return state.phase === 'available';
}

export function nextUpdateState(state, event) {
  switch (event.type) {
    case 'available':
      return { ...state, phase: 'available', version: event.version };
    case 'dismiss':
      return { ...state, phase: 'hidden' };
    default:
      return state;
  }
}
