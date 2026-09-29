import { TIERS, TIER_COLORS } from './config.js';
import { rankToIndex, buildItemPositionMap } from './scoring.js';

export function createSearchLink(itemText) {
  const link = document.createElement('a');
  link.className = 'chip-search-btn';
  link.href = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(itemText)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.title = `「${itemText}」をGoogle画像検索`;
  link.setAttribute('aria-label', `「${itemText}」をGoogle画像検索`);
  link.textContent = '🔍';

  // チップのドラッグやタップ操作の伝播を防止
  link.addEventListener('pointerdown', (e) => e.stopPropagation());
  link.addEventListener('mousedown', (e) => e.stopPropagation());
  link.addEventListener('click', (e) => e.stopPropagation());

  return link;
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
  }

  async init(items) {
    await ensureSortable();
    this.items = [...items];
    this.isLocked = false;
    this.destroy();

    this.poolContainer.innerHTML = '';
    for (const rank of TIERS) {
      if (this.tierContainers[rank]) {
        this.tierContainers[rank].innerHTML = '';
      }
    }

    this.items.forEach((itemText) => {
      const chip = document.createElement('div');
      chip.className = 'tier-item-chip';
      chip.dataset.item = itemText;
      chip.title = 'ドラッグまたはタップで移動';

      const textSpan = document.createElement('span');
      textSpan.className = 'chip-text';
      textSpan.textContent = itemText;
      chip.appendChild(textSpan);

      const searchBtn = createSearchLink(itemText);
      chip.appendChild(searchBtn);

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
    const state = { S: [], A: [], B: [], C: [], D: [] };
    for (const rank of TIERS) {
      const container = this.tierContainers[rank];
      if (container) {
        const chips = container.querySelectorAll('.tier-item-chip');
        chips.forEach((c) => {
          if (c.dataset.item) state[rank].push(c.dataset.item);
        });
      }
    }
    return state;
  }

  isAllPlaced() {
    const unplaced = this.poolContainer.querySelectorAll('.tier-item-chip').length;
    return unplaced === 0;
  }

  triggerChange() {
    if (this.onChange) {
      this.onChange(this.isAllPlaced(), this.getTierState());
    }
  }

  setLocked(locked) {
    this.isLocked = locked;
    for (const s of this.sortables) {
      s.option('disabled', locked);
    }
    const chips = document.querySelectorAll('.tier-item-chip');
    chips.forEach(c => {
      if (locked) {
        c.classList.add('locked');
      } else {
        c.classList.remove('locked');
      }
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
  const { hostItemToRankMap = null, hostPosMap: providedHostPosMap = null, hostTier = null, hasOrder = false, isHost = false } = options;
  const isOrderRule = Boolean(hasOrder);
  const hostPosMap = providedHostPosMap || (hostTier ? buildItemPositionMap(hostTier) : null);
  const safeTier = (tierState && typeof tierState === 'object') ? tierState : { S: [], A: [], B: [], C: [], D: [] };

  const table = document.createElement('div');
  table.className = 'readonly-tier-table';

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
        const chip = document.createElement('div');
        chip.className = 'tier-item-chip readonly';
        chip.dataset.item = itemText;

        const textSpan = document.createElement('span');
        textSpan.className = 'chip-text';
        textSpan.textContent = itemText;
        chip.appendChild(textSpan);

        const searchBtn = createSearchLink(itemText);
        chip.appendChild(searchBtn);

        if (!isHost) {
          if (isOrderRule) {
            // 左右差ありルール (左ほど上位)
            const hostPos = hostPosMap ? hostPosMap[itemText] : null;
            if (hostPos) {
              const rankDiff = Math.abs(rankToIndex(rank) - rankToIndex(hostPos.rank));
              const orderDiff = Math.abs(itemIdx - hostPos.index);

              if (rankDiff === 0 && orderDiff === 0) {
                // ランクも順序も完全一致のみ緑枠 (+20)
                chip.classList.add('chip-match-exact');
                chip.title = '完全一致 (ランク・順序一致 +20)';
              } else if (rankDiff === 0 && orderDiff > 0) {
                // ランクは同じだが順序ズレは必ず黄枠 (+10)
                chip.classList.add('chip-match-near');
                chip.title = `順序ズレ (正解は${hostPos.index + 1}番目 +10)`;
              } else if (rankDiff === 1) {
                // 1ランクズレ (+10)
                chip.classList.add('chip-match-near');
                chip.title = `1ランクズレ (正解: ${hostPos.rank} +10)`;
              } else {
                chip.classList.add('chip-match-miss');
                chip.title = `ズレ (正解: ${hostPos.rank}の${hostPos.index + 1}番目)`;
              }
            } else if (hostItemToRankMap && hostItemToRankMap[itemText]) {
              // hostPosが見つからないフォールバック時も左右差ありなら順序不問完全一致にはしない
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
                chip.title = '1ランクズレ (+10)';
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
      isHost: Boolean(entry.isRoundHost)
    });

    card.appendChild(header);
    card.appendChild(table);
    container.appendChild(card);
  });

  return container;
}
