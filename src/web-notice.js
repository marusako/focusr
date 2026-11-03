// Web 版の「通知」の欄の状態を決める (画面 (DOM) に依存しない純粋な関数)。
// Android 版は起動時に通知の許可を求めているので欄を出さない。ブラウザーに Notification がないときも出さない。
// 戻り値: 'hidden' (欄を出さない) | 'ask' (許可のボタンを出す) | 'on' (許可済み) | 'blocked' (拒否されている)
export function webNoticeState({ isMobileApp, hasNotification, permission }) {
  if (isMobileApp || !hasNotification) return 'hidden';
  if (permission === 'granted') return 'on';
  if (permission === 'denied') return 'blocked';
  return 'ask';
}
