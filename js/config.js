/**
 * ゲーム設定 & 定数
 */

export const TIERS = ['S', 'A', 'B', 'C', 'D'];

export const TIER_COLORS = {
  S: { bg: '#ff7f7f', text: '#ffffff' },
  A: { bg: '#ffbf7f', text: '#ffffff' },
  B: { bg: '#ffff7f', text: '#333333' },
  C: { bg: '#7fff7f', text: '#333333' },
  D: { bg: '#7fbfff', text: '#ffffff' }
};

// 入力補助用の例文サンプル (公式お題ではなくフォームのプレースホルダー・ヒント用)
export const THEME_EXAMPLES = [
  {
    theme: 'カレーに入れるなら？',
    items: ['ほうれん草', '生卵', '納豆', '玉ねぎ', 'じゃがいも']
  },
  {
    theme: 'ラーメンの最強トッピング',
    items: ['チャーシュー', '味玉', 'メンマ', '白ネギ', '海苔']
  },
  {
    theme: 'コンビニおにぎりの具',
    items: ['シーチキンマヨ', '鮭', '明太子', '梅干し', '昆布']
  },
  {
    theme: '無人島に持っていくなら？',
    items: ['ナイフ', 'ライター', '寝袋', 'スマホ', '釣り竿']
  }
];

export const MIN_ITEMS = 3;
export const MAX_ITEMS = 20;
