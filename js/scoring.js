import { TIERS } from './config.js';

/**
 * TierRank ('S' | 'A' | 'B' | 'C' | 'D') をインデックス番号に変換 (0..4)
 * @param {string} rank 
 * @returns {number}
 */
export function rankToIndex(rank) {
  const idx = TIERS.indexOf(rank);
  return idx !== -1 ? idx : 4;
}

/**
 * 各アイテムがどのTierに配置されているかの辞書マップを作成
 * @param {Record<string, string[]>} tierState 例: { S: ['納豆'], A: ['生卵'], ... }
 * @returns {Record<string, string>} 例: { '納豆': 'S', '生卵': 'A', ... }
 */
export function buildItemToRankMap(tierState) {
  const map = {};
  if (!tierState || typeof tierState !== 'object') return map;
  for (const rank of TIERS) {
    const items = tierState[rank] || [];
    for (const item of items) {
      map[item] = rank;
    }
  }
  return map;
}

/**
 * 各アイテムのランクおよびランク内の並び順（左からの位置 0..N）マップを作成
 * @param {Record<string, string[]>} tierState 
 * @returns {Record<string, { rank: string, index: number }>}
 */
export function buildItemPositionMap(tierState) {
  const map = {};
  if (!tierState || typeof tierState !== 'object') return map;
  for (const rank of TIERS) {
    const items = tierState[rank] || [];
    items.forEach((item, index) => {
      map[item] = {
        rank,
        index
      };
    });
  }
  return map;
}

/**
 * ゲストのTier予想とホストの正解Tierを比較採点
 * @param {string} peerId 
 * @param {string} playerName 
 * @param {Record<string, string[]>} guestTier 
 * @param {Record<string, string[]>} hostTier 
 * @param {string[]} allItems 
 * @param {Object} [options]
 * @param {boolean} [options.hasOrder] - 左右差あり（左ほど上位）ルールかどうか
 * @returns {import('./types.js').PlayerScore}
 */
export function calculatePlayerScore(peerId, playerName, guestTier, hostTier, allItems, options = {}) {
  const hasOrder = Boolean(options.hasOrder);
  const isOrderRule = hasOrder;
  const hostPosMap = buildItemPositionMap(hostTier);
  const guestPosMap = buildItemPositionMap(guestTier);
  const itemsList = Array.isArray(allItems) ? allItems : [];

  let totalScore = 0;
  const details = [];

  for (const item of itemsList) {
    const hostPos = hostPosMap[item] || { rank: 'D', index: 0 };
    const guestPos = guestPosMap[item] || { rank: 'D', index: 0 };

    const hostRankIdx = rankToIndex(hostPos.rank);
    const guestRankIdx = rankToIndex(guestPos.rank);
    const rankDiff = Math.abs(hostRankIdx - guestRankIdx);
    const orderDiff = Math.abs(hostPos.index - guestPos.index);

    let points = 0;
    let matchType = 'miss'; // 'exact' | 'order-miss' | 'near' | 'miss'

    if (isOrderRule) {
      // 左右差ありルール
      if (rankDiff === 0) {
        if (orderDiff === 0) {
          points = 20; // ランクも並び順も完全一致 (100%)
          matchType = 'exact';
        } else {
          points = 10; // ランクは同じだが、左右の順番がズレている (50%)
          matchType = 'order-miss';
        }
      } else if (rankDiff === 1) {
        points = 5;  // 1ランクズレ (25%)
        matchType = 'near';
      } else {
        points = 0;  // 2ランク以上ズレ
        matchType = 'miss';
      }
    } else {
      // 左右差なしルール
      if (rankDiff === 0) {
        points = 20; // ランク一致なら順番不問で満点 (100%)
        matchType = 'exact';
      } else if (rankDiff === 1) {
        points = 5;  // 1ランクズレ (25%)
        matchType = 'near';
      } else {
        points = 0;
        matchType = 'miss';
      }
    }

    totalScore += points;
    details.push({
      item,
      hostRank: hostPos.rank,
      guestRank: guestPos.rank,
      hostIndex: hostPos.index,
      guestIndex: guestPos.index,
      rankDiff,
      orderDiff,
      points,
      matchType,
      hasOrder
    });
  }

  const maxScore = allItems.length * 20;

  return {
    peerId,
    playerName,
    score: totalScore,
    maxScore,
    details
  };
}

/**
 * 提出された全プレイヤーのスコアを計算し、得点降順でソート
 * @param {Record<string, string[]>} hostTier 
 * @param {Map<string, { name: string, tier: Record<string, string[]> }>} guestSubmissions 
 * @param {string[]} allItems 
 * @param {Object} [options]
 * @returns {Array}
 */
export function calculateAllScores(hostTier, guestSubmissions, allItems, options = {}) {
  const results = [];

  for (const [peerId, sub] of guestSubmissions.entries()) {
    const scoreObj = calculatePlayerScore(peerId, sub.name, sub.tier, hostTier, allItems, options);
    results.push(scoreObj);
  }

  // スコアの降順にソート
  results.sort((a, b) => b.score - a.score);

  return results;
}
