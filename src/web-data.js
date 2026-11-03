// データの書き出し・読み込みを、ブラウザーの仕組みだけで行う (Android 版と Web 版)。次の操作を用意する:
//   exportData() → { saved }、importData() → { data } | { error: 'invalid' } | { canceled: true }、replace(data) → true / false
// - データは localStorage にある (renderer.js の save)。ファイルの形は data-file.js が決める。
//   以前のパソコン版で書き出したファイルも、同じ形なので読み込める。Android 版と Web 版の間でも、書き出して読み込める
// - 書き出したファイルをどこへ渡すか (share) と、ファイルの選び方 (pickFile) は、使う側が決める (Android 版は共有の画面)
import { DATA_KEYS, MAX_VALUE_LENGTH, serializeData, parseDataFile, backupFileName } from './data-file.js';

// ファイルの大きさの上限 (項目ごとの上限 × 項目の数)
const MAX_FILE_SIZE = DATA_KEYS.length * MAX_VALUE_LENGTH;

// ファイル選択の画面を開き、選ばれたファイルを返す (やめたら null)
function pickJsonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    // accept は付けない (Android では、ドライブなどの .json が JSON として扱われず選べないことがあるため。中身は読むときに確かめる)
    input.addEventListener('change', () => resolve(input.files[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

// ブラウザーで開いたときの書き出し: ファイルとしてダウンロードさせる
async function downloadFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

export function createWebData({ storage, share = downloadFile, pickFile = pickJsonFile, now = () => new Date() }) {
  // localStorage にある、知っている項目 (壊れた値は飛ばす)
  function localData() {
    const data = {};
    for (const key of DATA_KEYS) {
      const raw = storage.getItem(key);
      if (raw === null) continue;
      try {
        data[key] = JSON.parse(raw);
      } catch {
        // 壊れた値は書き出さない
      }
    }
    return data;
  }

  return {
    async exportData() {
      const date = now();
      const saved = await share(serializeData(localData(), date), backupFileName(date));
      return { saved: Boolean(saved) };
    },

    async importData() {
      const file = await pickFile();
      if (!file) return { canceled: true };
      if (file.size > MAX_FILE_SIZE) return { error: 'invalid' };
      try {
        const parsed = parseDataFile(await file.text());
        return parsed ? { data: parsed } : { error: 'invalid' };
      } catch {
        return { error: 'invalid' };
      }
    },

    // 読み込んだデータで入れ替える。ファイルにない項目は消す
    async replace(next) {
      const parsed = parseDataFile(serializeData(next));
      if (!parsed) return false;
      for (const key of DATA_KEYS) {
        if (key in parsed) storage.setItem(key, JSON.stringify(parsed[key]));
        else storage.removeItem(key);
      }
      return true;
    },
  };
}
