import { TIERS, TIER_COLORS } from './config.js';
import { rankToIndex, buildItemPositionMap, buildItemToRankMap } from './scoring.js';
export function createSearchLink(itemText, searchPrefix = '') {
  const trimmedPrefix = (searchPrefix || '').trim();
  const trimmedItem = (itemText || '').trim();
  const query = trimmedPrefix ? `${trimmedPrefix} ${trimmedItem}` : trimmedItem;

  const link = document.createElement('a');
  link.className = 'chip-search-btn';
  link.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `「${query}」をGoogle画像検索`;
  link.setAttribute('aria-label', `「${query}」をGoogle画像検索`);
  link.dataset.itemText = trimmedItem;
  link.dataset.query = query;
  link.textContent = '🔍';

  // チップのドラッグやタップ操作の伝播を防止し、同じウィンドウの別タブで開く
  link.addEventListener('pointerdown', (e) => e.stopPropagation());
  link.addEventListener('mousedown', (e) => e.stopPropagation());
  link.addEventListener('click', (e) => {
    e.stopPropagation();
  });

  return link;
}

/**
 * Tierアイテムチップを生成
 * cardMode=false: 今まで通りの横長テキストチップ (文字のみモード)
 * cardMode=true: Tiermaker風 四角いアイコンカード (画像ありモード: 上が画像、下が名前)
 */
export function createTierItemChip(itemText, options = {}) {
  const {
    imageUrl = '',
    searchPrefix = '',
    readonly = false,
    cardMode = false
  } = options;

  const chip = document.createElement('div');
  chip.dataset.item = itemText;

  if (!cardMode) {
    // 【文字のみモード（今まで通り）】横長チップ
    chip.className = `tier-item-chip${readonly ? ' readonly' : ''}`;
    if (!readonly) chip.title = 'ドラッグまたはタップで移動';

    const textSpan = document.createElement('span');
    textSpan.className = 'chip-text';
    textSpan.textContent = itemText;
    chip.appendChild(textSpan);

    const searchBtn = createSearchLink(itemText, searchPrefix);
    chip.appendChild(searchBtn);
    return chip;
  }

  // 【画像ありモード】Tiermaker風 四角いアイコンカード
  chip.className = `tier-item-chip card-mode${readonly ? ' readonly' : ''}`;
  if (!readonly) {
    chip.title = `${itemText} (ドラッグまたはタップで移動)`;
  }

  // 1. 上部画像エリア
  const thumbWrapper = document.createElement('div');
  thumbWrapper.className = 'card-thumb-wrapper';

  if (imageUrl) {
    const img = document.createElement('img');
    img.className = 'card-image';
    img.src = imageUrl;
    img.alt = itemText;
    img.loading = 'lazy';
    img.draggable = false;
    img.referrerPolicy = 'no-referrer';
    img.onerror = () => {
      img.style.display = 'none';
      if (!thumbWrapper.querySelector('.card-placeholder')) {
        const ph = document.createElement('span');
        ph.className = 'card-placeholder';
        ph.textContent = '🖼️';
        thumbWrapper.appendChild(ph);
      }
    };
    thumbWrapper.appendChild(img);
  } else {
    const ph = document.createElement('span');
    ph.className = 'card-placeholder';
    ph.textContent = '🖼️';
    thumbWrapper.appendChild(ph);
  }

  // 🔍 ボタン (カード右上に小さく配置)
  const searchBtn = createSearchLink(itemText, searchPrefix);
  searchBtn.className = 'card-search-btn';
  thumbWrapper.appendChild(searchBtn);

  // 2. 下部名前ラベル帯
  const labelBar = document.createElement('div');
  labelBar.className = 'card-label-bar';

  const textSpan = document.createElement('span');
  textSpan.className = 'chip-text';
  textSpan.textContent = itemText;
  textSpan.title = itemText;
  labelBar.appendChild(textSpan);

  chip.appendChild(thumbWrapper);
  chip.appendChild(labelBar);

  return chip;
}

export async function ensureSortable() {
  if (window.Sortable) return window.Sortable;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js';
    script.onload = () => resolve(window.Sortable);
    script.onerror = () => reject(new Error('SortableJSの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

export class TierBoard {
  constructor({ poolContainer, tierContainers, onChange }) {
    this.poolContainer = poolContainer;
    this.tierContainers = tierContainers;
    this.onChange = onChange;
    this.sortables = [];
    this.isLocked = false;
    this.items = [];
    this.searchPrefix = '';
    this.itemImages = {};
    this.hasImages = false;
  }

  async init(items, searchPrefix = '', itemImages = {}, hasImages = false) {
    await ensureSortable();
    this.items = [...items];
    this.searchPrefix = (searchPrefix || '').trim();
    this.itemImages = itemImages || {};
    this.hasImages = Boolean(hasImages);
    this.isLocked = false;
    this.destroy();

    // カードモード時の親クラス付け外し
    const tableContainer = document.querySelector('.tier-table-container');
    if (this.hasImages) {
      this.poolContainer.classList.add('card-mode');
      if (tableContainer) tableContainer.classList.add('card-mode');
    } else {
      this.poolContainer.classList.remove('card-mode');
      if (tableContainer) tableContainer.classList.remove('card-mode');
    }

    this.poolContainer.innerHTML = '';
    for (const rank of TIERS) {
      if (this.tierContainers[rank]) {
        this.tierContainers[rank].innerHTML = '';
      }
    }

    this.items.forEach((itemText) => {
      const imageUrl = this.itemImages[itemText] || '';
      const chip = createTierItemChip(itemText, {
        imageUrl,
        searchPrefix: this.searchPrefix,
        readonly: false,
        cardMode: this.hasImages
      });

      let touchStartTime = 0;
      chip.addEventListener('pointerdown', () => {
        touchStartTime = Date.now();
      });

      chip.addEventListener('click', (e) => {
        if (this.isLocked) return;
        const elapsed = Date.now() - touchStartTime;
        if (elapsed < 300) {
          this.cycleItem(chip);
        }
      });

      this.poolContainer.appendChild(chip);
    });

    const sortableConfig = {
      group: 'tier-shared-items',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      touchStartThreshold: 3,
      onEnd: () => {
        this.triggerChange();
      }
    };

    this.sortables.push(new window.Sortable(this.poolContainer, sortableConfig));

    for (const rank of TIERS) {
      const container = this.tierContainers[rank];
      if (container) {
        this.sortables.push(new window.Sortable(container, sortableConfig));
      }
    }

    this.triggerChange();
  }

  cycleItem(chip) {
    if (this.isLocked) return;

    const parent = chip.parentElement;
    let nextContainer = null;

    if (parent === this.poolContainer) {
      nextContainer = this.tierContainers['S'];
    } else if (parent === this.tierContainers['S']) {
      nextContainer = this.tierContainers['A'];
    } else if (parent === this.tierContainers['A']) {
      nextContainer = this.tierContainers['B'];
    } else if (parent === this.tierContainers['B']) {
      nextContainer = this.tierContainers['C'];
    } else if (parent === this.tierContainers['C']) {
      nextContainer = this.tierContainers['D'];
    } else {
      nextContainer = this.poolContainer;
    }

    if (nextContainer) {
      nextContainer.appendChild(chip);
      this.triggerChange();
    }
  }

  getTierState() {
    const result = {
      S: [],
      A: [],
      B: [],
      C: [],
      D: []
    };

    for (const rank of TIERS) {
      const container = this.tierContainers[rank];
      if (container) {
        const chips = container.querySelectorAll('.tier-item-chip');
        chips.forEach((chip) => {
          if (chip.dataset.item) {
            result[rank].push(chip.dataset.item);
          }
        });
      }
    }

    return result;
  }

  isAllPlaced() {
    const remainingInPool = this.poolContainer.querySelectorAll('.tier-item-chip').length;
    return remainingInPool === 0;
  }

  triggerChange() {
    if (this.onChange) {
      this.onChange(this.isAllPlaced());
    }
  }

  setLocked(locked) {
    if (locked) {
      this.lock();
    } else {
      this.unlock();
    }
  }

  lock() {
    this.isLocked = true;
    for (const s of this.sortables) {
      try {
        s.option('disabled', true);
      } catch (e) {}
    }
    const allContainers = [this.poolContainer, ...Object.values(this.tierContainers)];
    allContainers.forEach((c) => {
      if (!c) return;
      const chips = c.querySelectorAll('.tier-item-chip');
      chips.forEach((chip) => chip.classList.add('locked'));
    });
  }

  unlock() {
    this.isLocked = false;
    for (const s of this.sortables) {
      try {
        s.option('disabled', false);
      } catch (e) {}
    }
    const allContainers = [this.poolContainer, ...Object.values(this.tierContainers)];
    allContainers.forEach((c) => {
      if (!c) return;
      const chips = c.querySelectorAll('.tier-item-chip');
      chips.forEach((chip) => chip.classList.remove('locked'));
    });
  }

  setSearchPrefix(newPrefix) {
    this.searchPrefix = (newPrefix || '').trim();
    const allContainers = [this.poolContainer, ...Object.values(this.tierContainers)];
    allContainers.forEach((container) => {
      if (!container) return;
      const searchBtns = container.querySelectorAll('.chip-search-btn');
      searchBtns.forEach((btn) => {
        const itemText = btn.dataset.itemText || (btn.parentElement ? btn.parentElement.dataset.item : '') || '';
        const trimmedItem = itemText.trim();
        const query = this.searchPrefix ? `${this.searchPrefix} ${trimmedItem}` : trimmedItem;
        btn.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
        btn.dataset.query = query;
        btn.title = `「${query}」をGoogle画像検索`;
        btn.setAttribute('aria-label', `「${query}」をGoogle画像検索`);
      });
    });
  }

  destroy() {
    for (const s of this.sortables) {
      try {
        s.destroy();
      } catch (e) {}
    }
    this.sortables = [];
  }
}

export function createReadonlyTierTable(tierState, options = {}) {
  const {
    hostItemToRankMap = null,
    hostPosMap: providedHostPosMap = null,
    hostTier = null,
    hasOrder = false,
    isHost = false,
    searchPrefix = '',
    itemImages = {},
    hasImages = false
  } = options;
  const isOrderRule = Boolean(hasOrder);
  const hostPosMap = providedHostPosMap || (hostTier ? buildItemPositionMap(hostTier) : null);
  const safeTier = (tierState && typeof tierState === 'object') ? tierState : { S: [], A: [], B: [], C: [], D: [] };

  const table = document.createElement('div');
  table.className = `readonly-tier-table${hasImages ? ' card-mode' : ''}`;

  for (const rank of TIERS) {
    const row = document.createElement('div');
    row.className = `tier-row tier-row-${rank.toLowerCase()}`;

    const label = document.createElement('div');
    label.className = `tier-label rank-${rank.toLowerCase()}`;
    label.textContent = rank;
    const style = TIER_COLORS[rank];
    label.style.backgroundColor = style.bg;
    label.style.color = style.text;

    const slot = document.createElement('div');
    slot.className = 'tier-slot readonly';

    const items = safeTier[rank] || [];
    if (items.length === 0) {
      const emptyNote = document.createElement('span');
      emptyNote.className = 'empty-slot-text';
      emptyNote.textContent = '(なし)';
      slot.appendChild(emptyNote);
    } else {
      items.forEach((itemText, itemIdx) => {
        const imageUrl = (itemImages && itemImages[itemText]) || '';
        const chip = createTierItemChip(itemText, {
          imageUrl,
          searchPrefix,
          readonly: true,
          cardMode: Boolean(hasImages)
        });

        if (!isHost) {
          if (isOrderRule) {
            // 左右差ありルール (左ほど上位)
            const hostPos = hostPosMap ? hostPosMap[itemText] : null;
            if (hostPos) {
              const rankDiff = Math.abs(rankToIndex(rank) - rankToIndex(hostPos.rank));
              const orderDiff = Math.abs(itemIdx - hostPos.index);

              if (rankDiff === 0 && orderDiff === 0) {
                chip.classList.add('chip-match-exact');
                chip.title = '完全一致 (ランク・順序一致 +20)';
              } else if (rankDiff === 0 && orderDiff > 0) {
                chip.classList.add('chip-match-near');
                chip.title = `順序ズレ (正解は${hostPos.index + 1}番目 +10)`;
              } else if (rankDiff === 1) {
                chip.classList.add('chip-match-near');
                chip.title = `1ランクズレ (正解: ${hostPos.rank} +5)`;
              } else {
                chip.classList.add('chip-match-miss');
                chip.title = `ズレ (正解: ${hostPos.rank}の${hostPos.index + 1}番目)`;
              }
            } else if (hostItemToRankMap && hostItemToRankMap[itemText]) {
              const hostRank = hostItemToRankMap[itemText];
              const diff = Math.abs(rankToIndex(rank) - rankToIndex(hostRank));
              if (diff === 0 || diff === 1) {
                chip.classList.add('chip-match-near');
                chip.title = `ランク一致/近接 (正解: ${hostRank})`;
              } else {
                chip.classList.add('chip-match-miss');
                chip.title = `ズレ (正解: ${hostRank})`;
              }
            }
          } else {
            // 左右差なしルール (順不同)
            const hostRank = (hostItemToRankMap && hostItemToRankMap[itemText]) || (hostPosMap && hostPosMap[itemText] && hostPosMap[itemText].rank);
            if (hostRank) {
              const diff = Math.abs(rankToIndex(rank) - rankToIndex(hostRank));
              if (diff === 0) {
                chip.classList.add('chip-match-exact');
                chip.title = '完全一致 (+20)';
              } else if (diff === 1) {
                chip.classList.add('chip-match-near');
                chip.title = '1ランクズレ (+5)';
              } else {
                chip.classList.add('chip-match-miss');
                chip.title = `ズレ (正解: ${hostRank})`;
              }
            }
          }
        }

        slot.appendChild(chip);
      });
    }

    row.appendChild(label);
    row.appendChild(slot);
    table.appendChild(row);
  }

  return table;
}

export function createComparisonGrid(allTiers, hostItemToRankMap, options = {}) {
  const hasOrder = Boolean(options.hasOrder);
  const hostTier = options.hostTier || null;
  const hostPosMap = hostTier ? buildItemPositionMap(hostTier) : null;
  const itemImages = options.itemImages || {};
  const hasImages = Boolean(options.hasImages);
  const container = document.createElement('div');
  container.className = 'comparison-grid';

  const safeAllTiers = Array.isArray(allTiers) ? allTiers : [];
  safeAllTiers.forEach((entry) => {
    const card = document.createElement('div');
    card.className = `comparison-card ${entry.isRoundHost ? 'card-round-host' : ''}`;

    const header = document.createElement('div');
    header.className = 'comparison-card-header';
    header.innerHTML = `
      <div class="comparison-player-title">
        ${entry.isRoundHost ? '👑 <strong>' + entry.playerName + ' (主役・正解)</strong>' : '🎮 ' + entry.playerName}
      </div>
    `;

    const table = createReadonlyTierTable(entry.tier, {
      hostItemToRankMap,
      hostPosMap,
      hostTier,
      hasOrder,
      isHost: Boolean(entry.isRoundHost),
      searchPrefix: options.searchPrefix || '',
      itemImages,
      hasImages
    });

    card.appendChild(header);
    card.appendChild(table);
    container.appendChild(card);
  });

  return container;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 左右の同じアイテムにカーソルまたはタップが当たった際に連動ハイライトさせる
 */
function attachLinkedHoverEvents(container) {
  if (!container) return;
  const chips = container.querySelectorAll('.tier-item-chip[data-item]');

  chips.forEach((chip) => {
    const item = chip.dataset.item;
    if (!item) return;

    const setHighlight = (enable) => {
      chips.forEach((c) => {
        if (c.dataset.item === item) {
          if (enable) {
            c.classList.add('item-linked-highlight');
          } else {
            c.classList.remove('item-linked-highlight');
          }
        }
      });
    };

    chip.addEventListener('mouseenter', () => setHighlight(true));
    chip.addEventListener('mouseleave', () => setHighlight(false));

    chip.addEventListener('click', (e) => {
      if (e.target.closest('.chip-search-btn') || e.target.closest('.card-search-btn')) return;
      const isAlready = chip.classList.contains('item-linked-highlight');
      chips.forEach((c) => c.classList.remove('item-linked-highlight'));
      if (!isAlready) {
        setHighlight(true);
      }
    });
  });
}

/**
 * ホスト（主役）と選んだプレイヤーのTier表を横並びで崩れずに比較するUIを生成
 */
export function createSideBySideComparison(hostTier, targetTier, options = {}) {
  const {
    hostPlayerName = '主役',
    targetPlayerName = 'プレイヤー',
    targetScore = null,
    targetMaxScore = null,
    isSkipped = false,
    hasOrder = false,
    searchPrefix = '',
    itemImages = {},
    hasImages = false,
    layoutMode = 'side-by-side' // 'side-by-side' | 'stacked'
  } = options;

  const isOrderRule = Boolean(hasOrder);
  const hostPosMap = buildItemPositionMap(hostTier || {});
  const hostItemToRankMap = buildItemToRankMap(hostTier || {});

  const safeHostTier = (hostTier && typeof hostTier === 'object') ? hostTier : { S: [], A: [], B: [], C: [], D: [] };
  const safeTargetTier = (targetTier && typeof targetTier === 'object') ? targetTier : { S: [], A: [], B: [], C: [], D: [] };

  // 相手が完全一致・近接一致させたアイテムのセット
  const exactMatchedItems = new Set();
  const nearMatchedItems = new Set();

  for (const rank of TIERS) {
    const items = safeTargetTier[rank] || [];
    items.forEach((itemText, itemIdx) => {
      if (isOrderRule) {
        const hostPos = hostPosMap[itemText];
        if (hostPos) {
          const rankDiff = Math.abs(rankToIndex(rank) - rankToIndex(hostPos.rank));
          const orderDiff = Math.abs(itemIdx - hostPos.index);
          if (rankDiff === 0 && orderDiff === 0) exactMatchedItems.add(itemText);
          else if (rankDiff === 0 || rankDiff === 1) nearMatchedItems.add(itemText);
        }
      } else {
        const hostRank = hostItemToRankMap[itemText];
        if (hostRank) {
          const rankDiff = Math.abs(rankToIndex(rank) - rankToIndex(hostRank));
          if (rankDiff === 0) exactMatchedItems.add(itemText);
          else if (rankDiff === 1) nearMatchedItems.add(itemText);
        }
      }
    });
  }

  // ルートコンテナ
  const root = document.createElement('div');
  root.className = `comparison-sync-table ${hasImages ? 'card-mode' : 'text-mode'} layout-${layoutMode}`;

  // テーブルヘッダー
  const header = document.createElement('div');
  header.className = 'cs-table-header';

  let scoreHtml = '';
  if (isSkipped) {
    scoreHtml = '<span class="cs-score-pill skipped">未提出 (0点)</span>';
  } else if (targetScore !== null && targetMaxScore !== null) {
    const pct = targetMaxScore > 0 ? Math.round((targetScore / targetMaxScore) * 100) : 0;
    scoreHtml = `<span class="cs-score-pill">${targetScore} / ${targetMaxScore}点 (${pct}%)</span>`;
  }

  header.innerHTML = `
    <div class="cs-header-side cs-header-host">
      <div class="cs-header-role">👑 主役（正解）</div>
      <div class="cs-header-name">${escapeHtml(hostPlayerName)} さん</div>
    </div>
    <div class="cs-header-vs">
      <span class="cs-vs-badge">VS</span>
    </div>
    <div class="cs-header-side cs-header-target">
      <div class="cs-header-role">🎮 比較中</div>
      <div class="cs-header-name">
        <span class="cs-target-player-name">${escapeHtml(targetPlayerName)} さん</span>
        ${scoreHtml}
      </div>
    </div>
  `;
  root.appendChild(header);

  // 各ランク行コンテナ
  const rowsContainer = document.createElement('div');
  rowsContainer.className = 'cs-sync-rows';

  for (const rank of TIERS) {
    const row = document.createElement('div');
    row.className = `cs-sync-row rank-${rank.toLowerCase()}`;
    row.dataset.rank = rank;

    const rankStyle = TIER_COLORS[rank] || { bg: '#4b5563', text: '#ffffff' };

    // --- 左側: 主役（ホスト）の半身 ---
    const hostHalf = document.createElement('div');
    hostHalf.className = 'cs-half cs-half-host';

    const hostLabel = document.createElement('div');
    hostLabel.className = `tier-label rank-${rank.toLowerCase()}`;
    hostLabel.textContent = rank;
    hostLabel.style.backgroundColor = rankStyle.bg;
    hostLabel.style.color = rankStyle.text;

    const hostSlot = document.createElement('div');
    hostSlot.className = 'tier-slot cs-slot cs-slot-host readonly';

    const hostItems = safeHostTier[rank] || [];
    if (hostItems.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'empty-slot-text';
      emptySpan.textContent = '(なし)';
      hostSlot.appendChild(emptySpan);
    } else {
      hostItems.forEach((itemText) => {
        const imageUrl = (itemImages && itemImages[itemText]) || '';
        const chip = createTierItemChip(itemText, {
          imageUrl,
          searchPrefix,
          readonly: true,
          cardMode: Boolean(hasImages)
        });

        // 相手の一致状況に応じた視覚フィードバック
        if (exactMatchedItems.has(itemText)) {
          chip.classList.add('chip-host-matched');
          chip.title = `${itemText}（${targetPlayerName}さんも完全一致！）`;
        } else if (nearMatchedItems.has(itemText)) {
          chip.classList.add('chip-host-near');
        }

        hostSlot.appendChild(chip);
      });
    }

    hostHalf.appendChild(hostLabel);
    hostHalf.appendChild(hostSlot);

    // --- 右側: 選んだプレイヤーの半身 ---
    const targetHalf = document.createElement('div');
    targetHalf.className = 'cs-half cs-half-target';

    const targetLabel = document.createElement('div');
    targetLabel.className = `tier-label rank-${rank.toLowerCase()}`;
    targetLabel.textContent = rank;
    targetLabel.style.backgroundColor = rankStyle.bg;
    targetLabel.style.color = rankStyle.text;

    const targetSlot = document.createElement('div');
    targetSlot.className = 'tier-slot cs-slot cs-slot-target readonly';

    const targetItems = safeTargetTier[rank] || [];
    if (isSkipped && targetItems.length === 0) {
      const skippedSpan = document.createElement('span');
      skippedSpan.className = 'empty-slot-text';
      skippedSpan.textContent = '(未提出のため未配置)';
      targetSlot.appendChild(skippedSpan);
    } else if (targetItems.length === 0) {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'empty-slot-text';
      emptySpan.textContent = '(なし)';
      targetSlot.appendChild(emptySpan);
    } else {
      targetItems.forEach((itemText, itemIdx) => {
        const imageUrl = (itemImages && itemImages[itemText]) || '';
        const chip = createTierItemChip(itemText, {
          imageUrl,
          searchPrefix,
          readonly: true,
          cardMode: Boolean(hasImages)
        });

        let matchBadgeText = '';
        let matchBadgeClass = '';

        if (isOrderRule) {
          const hostPos = hostPosMap[itemText];
          if (hostPos) {
            const rankDiff = Math.abs(rankToIndex(rank) - rankToIndex(hostPos.rank));
            const orderDiff = Math.abs(itemIdx - hostPos.index);

            if (rankDiff === 0 && orderDiff === 0) {
              chip.classList.add('chip-match-exact');
              chip.title = '完全一致 (ランク・順序一致 +20)';
              matchBadgeText = '⭕ 一致';
              matchBadgeClass = 'badge-exact';
            } else if (rankDiff === 0 && orderDiff > 0) {
              chip.classList.add('chip-match-near');
              chip.title = `順序ズレ (正解は${hostPos.index + 1}番目 +10)`;
              matchBadgeText = '△ 順序ズレ';
              matchBadgeClass = 'badge-near';
            } else if (rankDiff === 1) {
              chip.classList.add('chip-match-near');
              chip.title = `1ランクズレ (正解: ${hostPos.rank} +5)`;
              matchBadgeText = `△ 正解:${hostPos.rank}`;
              matchBadgeClass = 'badge-near';
            } else {
              chip.classList.add('chip-match-miss');
              chip.title = `ズレ (正解: ${hostPos.rank})`;
              matchBadgeText = `✕ 正解:${hostPos.rank}`;
              matchBadgeClass = 'badge-miss';
            }
          } else {
            chip.classList.add('chip-match-miss');
          }
        } else {
          const hostRank = hostItemToRankMap[itemText];
          if (hostRank) {
            const rankDiff = Math.abs(rankToIndex(rank) - rankToIndex(hostRank));
            if (rankDiff === 0) {
              chip.classList.add('chip-match-exact');
              chip.title = '完全一致 (+20)';
              matchBadgeText = '⭕ 一致';
              matchBadgeClass = 'badge-exact';
            } else if (rankDiff === 1) {
              chip.classList.add('chip-match-near');
              chip.title = `1ランクズレ (正解: ${hostRank} +5)`;
              matchBadgeText = `△ 正解:${hostRank}`;
              matchBadgeClass = 'badge-near';
            } else {
              chip.classList.add('chip-match-miss');
              chip.title = `ズレ (正解: ${hostRank})`;
              matchBadgeText = `✕ 正解:${hostRank}`;
              matchBadgeClass = 'badge-miss';
            }
          } else {
            chip.classList.add('chip-match-miss');
          }
        }

        // バッジを追加
        if (matchBadgeText) {
          const badge = document.createElement('span');
          badge.className = `cs-item-badge ${matchBadgeClass}`;
          badge.textContent = matchBadgeText;
          if (hasImages) {
            // 画像カードモード時はカード左上にオーバーレイバッジとして配置（名前テキスト領域を圧迫しない）
            badge.classList.add('card-badge-overlay');
            chip.appendChild(badge);
          } else {
            chip.appendChild(badge);
          }
        }

        targetSlot.appendChild(chip);
      });
    }

    targetHalf.appendChild(targetLabel);
    targetHalf.appendChild(targetSlot);

    row.appendChild(hostHalf);
    row.appendChild(targetHalf);
    rowsContainer.appendChild(row);
  }

  root.appendChild(rowsContainer);

  // 左右アイテムの連動ハイライトイベント設定
  attachLinkedHoverEvents(root);

  return root;
}
