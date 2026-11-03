// 取り込んだ壁紙・BGM のファイルについての決まりごと (画面 (DOM) に依存しない純粋な関数)。web-media.js が使う

export const MEDIA_KINDS = Object.freeze({
  wallpapers: { label: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] },
  bgm: { label: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
});

function extensionOf(name) {
  const match = /\.([^.]+)$/.exec(name);
  return match ? match[1].toLowerCase() : '';
}

// 取り込もうとしているファイルが、その種類で受け付ける形式か
export function isAllowedFile(kind, name) {
  const rule = MEDIA_KINDS[kind];
  return Boolean(rule) && rule.extensions.includes(extensionOf(name));
}

// アプリが保存時に付けた名前 (英数字とハイフン + 許可された拡張子) か。
// しまったファイルを読むとき、この形以外の名前は受け付けない
export function isStoredName(kind, name) {
  return /^[a-z0-9-]+\.[a-z0-9]+$/.test(name) && isAllowedFile(kind, name);
}

// 保存するときの名前: アプリが付けた ID + 元の拡張子 (小文字)。受け付けない形式なら null。
export function storedNameFor(kind, originalName, id) {
  if (!isAllowedFile(kind, originalName)) return null;
  return `${String(id).toLowerCase()}.${extensionOf(originalName)}`;
}

// ファイル選択の画面 (<input type="file"> の accept) に渡す、選べる形式の一覧
export function acceptFor(kind) {
  return MEDIA_KINDS[kind].extensions.map((ext) => `.${ext}`).join(',');
}
