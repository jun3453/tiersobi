/**
 * image-fetcher.js
 * Wikipedia API (APIキー不要・CORS対応・完全無料) を使用した画像自動取得
 */

/**
 * 指定したクエリでWikipediaから記事サムネイル（200px）を検索・取得
 * @param {string} query 検索キーワード (例: "マグロ", "マクドナルド ビッグマック")
 * @returns {Promise<string|null>} 画像URL、見つからない場合はnull
 */
export async function fetchWikipediaThumbnail(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return null;

  try {
    // 1. generator=search で最も関連度の高いWikipedia記事1件を検索し、そのメインサムネイルを取得
    const searchUrl = `https://ja.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(trimmed)}&gsrlimit=1&prop=pageimages&pithumbsize=200&format=json&origin=*`;
    
    const res = await fetch(searchUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) return null;
    const data = await res.json();

    if (data.query && data.query.pages) {
      const pageId = Object.keys(data.query.pages)[0];
      const page = data.query.pages[pageId];
      if (page && page.thumbnail && page.thumbnail.source) {
        return page.thumbnail.source;
      }
    }

    // 2. もしgenerator=searchで見つからなかった場合、記事タイトル直接指定 (titles) で再試行
    const directUrl = `https://ja.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(trimmed)}&prop=pageimages&pithumbsize=200&format=json&origin=*`;
    const directRes = await fetch(directUrl, {
      headers: { 'Accept': 'application/json' }
    });

    if (directRes.ok) {
      const directData = await directRes.json();
      if (directData.query && directData.query.pages) {
        const pageId = Object.keys(directData.query.pages)[0];
        const page = directData.query.pages[pageId];
        if (page && page.thumbnail && page.thumbnail.source) {
          return page.thumbnail.source;
        }
      }
    }

    return null;
  } catch (error) {
    console.warn(`[ImageFetcher] Wikipedia画像取得エラー (${trimmed}):`, error);
    return null;
  }
}

/**
 * 1アイテムの画像を自動取得 (プレフィックス付き ➔ なしの順で試行)
 * @param {string} itemText アイテム名
 * @param {string} searchPrefix 作品名などのプレフィックス (任意)
 * @returns {Promise<string|null>}
 */
export async function fetchItemImage(itemText, searchPrefix = '') {
  const trimmedItem = (itemText || '').trim();
  const trimmedPrefix = (searchPrefix || '').trim();
  if (!trimmedItem) return null;

  // 1. プレフィックスがある場合は "作品名 アイテム名" で検索
  if (trimmedPrefix) {
    const combinedQuery = `${trimmedPrefix} ${trimmedItem}`;
    const result = await fetchWikipediaThumbnail(combinedQuery);
    if (result) return result;
  }

  // 2. アイテム単体名で検索
  return await fetchWikipediaThumbnail(trimmedItem);
}

/**
 * 複数アイテムの画像を一括自動取得
 * @param {string[]} items アイテム名の配列
 * @param {string} searchPrefix 共通検索プレフィックス
 * @param {function(number, number, string, string|null): void} onProgress 進捗コールバック (index, total, item, imageUrl)
 * @returns {Promise<Object.<string, string>>} { [itemText]: imageUrl } のマップ
 */
export async function fetchAllItemImages(items, searchPrefix = '', onProgress = null) {
  const imageMap = {};
  const total = items.length;

  for (let i = 0; i < total; i++) {
    const item = items[i];
    if (!item) continue;

    try {
      const imageUrl = await fetchItemImage(item, searchPrefix);
      if (imageUrl) {
        imageMap[item] = imageUrl;
      }
      if (onProgress) {
        onProgress(i + 1, total, item, imageUrl);
      }
    } catch (e) {
      console.warn(`[ImageFetcher] アイテム一括取得中のエラー: ${item}`, e);
      if (onProgress) {
        onProgress(i + 1, total, item, null);
      }
    }
  }

  return imageMap;
}

/**
 * Google画像検索をドラッグ＆ドロップしやすい別ウィンドウ（ポップアップ）で開く
 * @param {string} query 検索キーワード
 */
export function openImageSearchWindow(query) {
  const trimmed = (query || '').trim();
  if (!trimmed) return;
  const url = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(trimmed)}`;

  // デスクトップで横並び・D&Dしやすいよう、画面右側に配置した独立ポップアップウィンドウとして開く
  const screenWidth = (typeof window !== 'undefined' && window.screen && window.screen.availWidth) ? window.screen.availWidth : 1280;
  const screenHeight = (typeof window !== 'undefined' && window.screen && window.screen.availHeight) ? window.screen.availHeight : 800;
  const width = Math.min(1000, Math.max(500, Math.floor(screenWidth * 0.45)));
  const height = Math.min(900, Math.max(600, Math.floor(screenHeight * 0.85)));
  const left = Math.max(0, screenWidth - width - 20);
  const top = 30;

  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top},noopener,noreferrer`;
  window.open(url, '_blank', features);
}
