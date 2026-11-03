// 「1 つ戻る」の判断 (画面 (DOM) に依存しない純粋関数)。
// Esc・Android の「戻る」・何もないところのクリック・右クリックで、メイン画面に向かって 1 つ戻る。
// 設定パネルが開いていればパネルを閉じることを優先し、次に再生バーの小窓 (再生リスト・音量) や再生中の画面を閉じる
export function backAction({ settingsOpen, popupOpen = false }) {
  if (settingsOpen) return 'closeSettings';
  if (popupOpen) return 'closePopup';
  return null;
}
