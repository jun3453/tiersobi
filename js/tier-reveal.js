/**
 * 主役のTier表ドラマチックめくり発表演出マネージャー
 * - 好きな順番でランク（S, A, B, C, D）を発表可能！
 * - 主役（RoundHost）もホスト（RoomHost）も両方発表操作可能（ホストの強制進行も維持）
 * - ボード上の未発表スロットを直接クリックしてめくることも可能！
 * - おすすめ順（D→S）の「次をめくる」ボタンも完備
 * - 伏せている間は要素数が一切わからないミステリアスカバー
 */

import { TIER_COLORS } from './config.js';
import { createTierItemChip } from './tier-board.js?v=20261004_side_by_side_fix';
import { ConfettiManager } from './confetti.js';

export const REVEAL_RANKS = ['D', 'C', 'B', 'A', 'S'];
export const ALL_RANKS = ['S', 'A', 'B', 'C', 'D'];
export const DEFAULT_ORDER = ['D', 'C', 'B', 'A', 'S'];

export class TierRevealManager {
  constructor({
    container,
    confettiCanvas,
    onFinished,
    onBroadcastStep,
    onBroadcastFinish
  }) {
    this.container = container;
    this.confetti = confettiCanvas ? new ConfettiManager(confettiCanvas) : null;
    this.onFinished = onFinished;
    this.onBroadcastStep = onBroadcastStep;
    this.onBroadcastFinish = onBroadcastFinish;

    this.payload = null;
    this.isHost = false;
    this.isRoundHost = false;
    this.canControl = false;
    this.revealedRanks = new Set();
    this.isFinished = false;

    // DOMキャッシュ
    this.boardEl = null;
    this.announcerBanner = null;
    this.announcerIcon = null;
    this.announcerText = null;
    this.hostControlsEl = null;
    this.guestControlsEl = null;
    this.operatorBadgeEl = null;
    this.rankPickersEl = null;
    this.hostNoticeEl = null;
    this.noticeHostNameEl = null;
    this.guestWaitingTextEl = null;
    this.btnNext = null;
    this.btnSkip = null;
    this.finishedCard = null;
    this.btnGoResult = null;
    this.hostNameEl = null;
    this.themeTitleEl = null;
    this.ruleBadgeEl = null;
    this.roundBadgeEl = null;
    this.rowElements = {}; // rank => { row, slot, shroud, chipsContainer }
  }

  /**
   * ステージ初期化 (ラウンドごとに毎回実行)
   * @param {Object} payload 
   * @param {boolean|Object} optionsOrIsHost 
   */
  initStage(payload, optionsOrIsHost = false) {
    this.cleanup();
    this.payload = payload;

    let isH = false;
    let isRH = false;
    if (typeof optionsOrIsHost === 'boolean') {
      isH = optionsOrIsHost;
    } else if (optionsOrIsHost && typeof optionsOrIsHost === 'object') {
      isH = Boolean(optionsOrIsHost.isHost);
      isRH = Boolean(optionsOrIsHost.isRoundHost);
    }
    this.isHost = isH;
    this.isRoundHost = isRH;
    this.canControl = this.isHost || this.isRoundHost;

    this.revealedRanks = new Set();
    this.isFinished = false;

    const roundHostTier = (payload.roundHostTier && typeof payload.roundHostTier === 'object')
      ? payload.roundHostTier
      : { S: [], A: [], B: [], C: [], D: [] };

    // ヘッダー情報反映
    if (this.roundBadgeEl) {
      this.roundBadgeEl.textContent = `ROUND ${payload.round || 1} / ${payload.totalRounds || 1}`;
    }
    if (this.hostNameEl) {
      this.hostNameEl.textContent = `${payload.roundHostName || '主役'} さんのTier表`;
    }
    if (this.themeTitleEl) {
      this.themeTitleEl.textContent = payload.theme || '今回のお題';
    }
    if (this.ruleBadgeEl) {
      const isOrder = Boolean(payload.hasOrder);
      this.ruleBadgeEl.textContent = isOrder ? '⚖️ 左右差あり (左ほど上位)' : '⚖️ 左右差なし (順不同)';
      this.ruleBadgeEl.className = `reveal-rule-badge ${isOrder ? 'badge-order' : 'badge-no-order'}`;
    }

    // 前ラウンドの状態リセット
    if (this.btnNext) {
      this.btnNext.style.display = '';
      this.btnNext.disabled = false;
      this.btnNext.textContent = '▶ 【Dランク】をめくる';
    }

    if (this.finishedCard) {
      this.finishedCard.style.display = 'none';
      this.finishedCard.classList.remove('animate-fade-in-up');
    }

    // コントロールバーの表示切り替え（主役 or ホストなら操作バー表示）
    if (this.hostControlsEl) {
      this.hostControlsEl.style.display = this.canControl ? 'flex' : 'none';
    }
    if (this.guestControlsEl) {
      this.guestControlsEl.style.display = this.canControl ? 'none' : 'flex';
    }

    // ホスト用の強制進行注意書き（ホストが主役以外の時のみ表示、ホストが主役の時は非表示）
    if (this.hostNoticeEl) {
      if (this.isHost && !this.isRoundHost) {
        this.hostNoticeEl.style.display = 'flex';
        if (this.noticeHostNameEl) {
          this.noticeHostNameEl.textContent = payload.roundHostName || '主役';
        }
      } else {
        this.hostNoticeEl.style.display = 'none';
      }
    }

    // 操作権限バッジの文言切り替え
    if (this.operatorBadgeEl) {
      if (this.isRoundHost && this.isHost) {
        this.operatorBadgeEl.textContent = '👑 あなたが主役兼ホストです';
      } else if (this.isRoundHost) {
        this.operatorBadgeEl.textContent = '👑 あなたが主役です（発表進行中）';
      } else if (this.isHost) {
        this.operatorBadgeEl.textContent = `👑 ホスト操作（主役: ${payload.roundHostName || '主役'}さん）`;
      }
    }

    // ゲスト用待機メッセージ
    if (this.guestWaitingTextEl) {
      const targetName = payload.roundHostName || '主役';
      this.guestWaitingTextEl.textContent = `⏳ 主役（${targetName}さん）の発表を待っています...（めくると同時に表示されます）`;
    }

    // Tierボードのレンダリング
    this.renderBoard(roundHostTier);

    // ランク選択ボタン群の生成
    this.renderRankPickers();

    // 最初のアナウンスセット
    this.updateAnnouncerInitial();
    this.updateControlsUI();

    // 最初の推奨ランク（D）のプレビュー鼓動エフェクト
    this.highlightActiveRank('D');
  }

  /**
   * ボードのHTML構造を描画
   */
  renderBoard(tierState) {
    if (!this.boardEl) return;
    this.boardEl.innerHTML = '';
    this.rowElements = {};

    const hasImages = Boolean(this.payload && this.payload.hasImages);
    const searchPrefix = (this.payload && this.payload.searchPrefix) || '';
    const itemImages = (this.payload && this.payload.itemImages) || {};

    const table = document.createElement('div');
    table.className = `reveal-board-table${hasImages ? ' card-mode' : ''}`;

    // 表示は上から S, A, B, C, D の順
    const displayRanks = ['S', 'A', 'B', 'C', 'D'];

    displayRanks.forEach((rank) => {
      const row = document.createElement('div');
      row.className = `reveal-tier-row reveal-row-${rank.toLowerCase()}`;
      row.dataset.rank = rank;

      // ラベル (S, A, B, C, D)
      const label = document.createElement('div');
      label.className = `reveal-tier-label rank-${rank.toLowerCase()}`;
      label.textContent = rank;
      const color = TIER_COLORS[rank] || { bg: '#888', text: '#fff' };
      label.style.backgroundColor = color.bg;
      label.style.color = color.text;

      // スロット (アイテム表示部)
      const slot = document.createElement('div');
      slot.className = 'reveal-tier-slot';

      // 1. めくり前の伏せカバー (Shroud)
      const shroud = document.createElement('div');
      shroud.className = 'reveal-shroud';

      const shroudContent = document.createElement('div');
      shroudContent.className = 'reveal-shroud-content single-mystery-panel';

      // 操作権限がある場合は行クリックでめくれるようにする！
      if (this.canControl) {
        shroud.classList.add('is-clickable');
        shroud.setAttribute('role', 'button');
        shroud.setAttribute('title', `クリックして【${rank}ランク】を発表`);
        shroudContent.innerHTML = `
          <div class="mystery-lock-badge">
            <span class="mystery-lock-icon">🔒</span>
            <span class="mystery-lock-text">未発表 (クリックでめくる)</span>
          </div>
        `;
        shroud.addEventListener('click', (e) => {
          e.stopPropagation();
          this.executeStep(rank);
        });
      } else {
        shroudContent.innerHTML = `
          <div class="mystery-lock-badge">
            <span class="mystery-lock-icon">🔒</span>
            <span class="mystery-lock-text">未発表</span>
          </div>
        `;
      }
      shroud.appendChild(shroudContent);

      // 2. めくられた時に表示される実際のアイテムコンテナ
      const items = tierState[rank] || [];
      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'reveal-chips-container';
      chipsContainer.style.display = 'none';

      if (items.length === 0) {
        const emptyNote = document.createElement('span');
        emptyNote.className = 'empty-slot-text';
        emptyNote.textContent = '(該当なし)';
        chipsContainer.appendChild(emptyNote);
      } else {
        items.forEach((itemText, idx) => {
          const imageUrl = itemImages[itemText] || '';
          const chip = createTierItemChip(itemText, {
            imageUrl,
            searchPrefix,
            readonly: true,
            cardMode: hasImages
          });

          // 左右差ありルールの場合は順位バッジを追加
          if (this.payload && this.payload.hasOrder) {
            const orderBadge = document.createElement('span');
            orderBadge.className = 'chip-order-rank-badge';
            orderBadge.textContent = `${idx + 1}位`;
            chip.appendChild(orderBadge);
          }

          chip.classList.add('reveal-pop-item');
          chip.style.animationDelay = `${idx * 0.1}s`;
          chipsContainer.appendChild(chip);
        });
      }

      slot.appendChild(shroud);
      slot.appendChild(chipsContainer);
      row.appendChild(label);
      row.appendChild(slot);
      table.appendChild(row);

      this.rowElements[rank] = {
        row,
        slot,
        shroud,
        chipsContainer,
        itemCount: items.length
      };
    });

    this.boardEl.appendChild(table);
  }

  /**
   * ランク選択ボタン群 (S, A, B, C, D) の描画
   */
  renderRankPickers() {
    if (!this.rankPickersEl) return;
    this.rankPickersEl.innerHTML = '';

    ALL_RANKS.forEach((rank) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `btn btn-rank-pick btn-pick-rank-${rank.toLowerCase()}`;
      btn.dataset.rank = rank;
      btn.textContent = rank === 'S' ? '👑 Sランク' : `${rank}ランク`;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.executeStep(rank);
      });

      this.rankPickersEl.appendChild(btn);
    });
  }

  /**
   * 現在注目中のランク行をハイライト
   */
  highlightActiveRank(targetRank) {
    DEFAULT_ORDER.forEach((rank) => {
      const elData = this.rowElements[rank];
      if (!elData) return;
      if (rank === targetRank && !this.revealedRanks.has(rank)) {
        elData.row.classList.add('is-active-target');
        if (rank === 'S') {
          elData.row.classList.add('is-s-climax');
        }
      } else {
        elData.row.classList.remove('is-active-target');
        if (rank !== 'S') {
          elData.row.classList.remove('is-s-climax');
        }
      }
    });
  }

  /**
   * 次の未発表ランク（推奨順: D, C, B, A, S）を取得
   */
  getNextUnrevealedRank() {
    return DEFAULT_ORDER.find((r) => !this.revealedRanks.has(r)) || null;
  }

  /**
   * 操作者（主役またはホスト）によるランクめくり実行
   */
  executeStep(targetRank = null) {
    if (!this.canControl || this.isFinished) return;

    const rankToOpen = targetRank || this.getNextUnrevealedRank();
    if (!rankToOpen || this.revealedRanks.has(rankToOpen)) return;

    // 自身でめくり実行
    this.revealRank(rankToOpen);

    // P2P同期通知（主役ならホスト経由、ホストなら直接ブロードキャスト）
    if (this.onBroadcastStep) {
      this.onBroadcastStep({ rank: rankToOpen });
    }
  }

  /**
   * 特定のランクをドラマチックにオープン！
   */
  revealRank(rank) {
    if (this.revealedRanks.has(rank)) return;

    this.revealedRanks.add(rank);
    const elData = this.rowElements[rank];

    if (rank === 'S') {
      // Sランク：クライマックス演出！
      if (this.announcerBanner) {
        this.announcerBanner.className = 'reveal-announcer-banner climax-drumroll';
        this.announcerIcon.textContent = '🌟';
        this.announcerText.textContent = `そして残るは頂点……栄えある【最高評価 Sランク】は…！？`;
      }

      // Sランク行の強烈なゴールド発光
      if (elData) {
        elData.row.classList.add('is-s-climax');
      }

      // 1.2秒のタメの後にオープン！
      setTimeout(() => {
        this.openRankSlotVisual(rank);
        if (this.confetti) {
          this.confetti.start(140, 4500);
        }

        if (this.announcerBanner) {
          this.announcerBanner.className = 'reveal-announcer-banner climax-opened';
          this.announcerIcon.textContent = '👑';
          const items = (this.payload && this.payload.roundHostTier && this.payload.roundHostTier['S']) || [];
          const itemNames = items.length > 0 ? `「${items.join('」「')}」` : '(なし)';
          this.announcerText.textContent = `至高の【Sランク】は ${itemNames} ！！！`;
        }

        this.updateControlsUI();
        this.checkAllRevealed();
      }, 1200);

    } else {
      // D, C, B, A ランクのオープン
      this.openRankSlotVisual(rank);

      if (this.announcerBanner) {
        this.announcerBanner.className = 'reveal-announcer-banner step-opened';
        this.announcerIcon.textContent = '✨';
        const items = (this.payload && this.payload.roundHostTier && this.payload.roundHostTier[rank]) || [];
        const itemNames = items.length > 0 ? `「${items.join('」「')}」` : '(該当なし)';
        this.announcerText.textContent = `【${rank}ランク】オープン！ ➔ ${itemNames}`;
      }

      this.updateControlsUI();
      this.checkAllRevealed();
    }
  }

  /**
   * 全てめくられたかチェック
   */
  checkAllRevealed() {
    const isAllDone = ALL_RANKS.every((r) => this.revealedRanks.has(r));
    if (isAllDone) {
      this.finishReveal();
    } else {
      const nextCandidate = this.getNextUnrevealedRank();
      if (nextCandidate) {
        this.highlightActiveRank(nextCandidate);
      }
    }
  }

  /**
   * スロットの伏せカバーを外し、アイテムを表示
   */
  openRankSlotVisual(rank) {
    const elData = this.rowElements[rank];
    if (!elData) return;

    elData.row.classList.remove('is-active-target');
    elData.row.classList.add('is-revealed');

    // 伏せカバーをアニメーションでフェードアウト
    elData.shroud.classList.add('shroud-vanish');
    setTimeout(() => {
      elData.shroud.style.display = 'none';
    }, 280);

    // アイテムコンテナを表示
    elData.chipsContainer.style.display = 'flex';
  }

  /**
   * 全ステップ完了時
   */
  finishReveal() {
    this.isFinished = true;

    // 未めくりランクがあれば全開放
    ALL_RANKS.forEach((rank) => {
      if (!this.revealedRanks.has(rank)) {
        this.openRankSlotVisual(rank);
      }
    });

    if (this.announcerBanner) {
      this.announcerBanner.className = 'reveal-announcer-banner all-finished';
      this.announcerIcon.textContent = '🎉';
      this.announcerText.textContent = 'すべての格付けが出揃いました！結果発表へ進みましょう！';
    }

    if (this.btnNext) {
      this.btnNext.style.display = 'none';
    }

    if (this.finishedCard) {
      this.finishedCard.style.display = 'block';
      this.finishedCard.classList.add('animate-fade-in-up');
    }

    this.updateControlsUI();
  }

  /**
   * スキップ：即座に全開放して結果画面へ進む
   */
  skipToResult() {
    ALL_RANKS.forEach((rank) => {
      this.revealedRanks.add(rank);
      this.openRankSlotVisual(rank);
    });
    this.isFinished = true;

    if (this.onBroadcastFinish && this.canControl) {
      this.onBroadcastFinish();
    }
    this.triggerGoResult();
  }

  /**
   * 結果発表画面への遷移トリガー
   */
  triggerGoResult() {
    this.cleanup();
    if (this.onFinished) {
      this.onFinished(this.payload);
    }
  }

  /**
   * 初回アナウンス
   */
  updateAnnouncerInitial() {
    if (!this.announcerBanner || !this.announcerText) return;
    this.announcerIcon.textContent = '🥁';
    this.announcerText.textContent = '好きなランクを選んで発表できます！まずはどこからめくりますか？';
    this.announcerBanner.className = 'reveal-announcer-banner waiting-step';
  }

  /**
   * 操作ボタンのラベルと状態更新
   */
  updateControlsUI() {
    // ランク選択ボタンの開封状態更新
    if (this.rankPickersEl) {
      const buttons = this.rankPickersEl.querySelectorAll('.btn-rank-pick');
      buttons.forEach((btn) => {
        const rank = btn.dataset.rank;
        if (this.revealedRanks.has(rank)) {
          btn.disabled = true;
          btn.classList.add('is-opened');
          btn.textContent = `✅ ${rank} 開封済`;
        } else {
          btn.disabled = false;
          btn.classList.remove('is-opened');
          btn.textContent = rank === 'S' ? '👑 Sランク' : `${rank}ランク`;
        }
      });
    }

    // 「次をめくる」おすすめボタンの更新
    if (this.btnNext) {
      const nextRank = this.getNextUnrevealedRank();
      if (nextRank && !this.isFinished) {
        this.btnNext.style.display = '';
        this.btnNext.disabled = false;
        if (nextRank === 'S') {
          this.btnNext.textContent = '👑 【Sランク（最高評価）】をめくる';
          this.btnNext.className = 'btn btn-warning btn-reveal-action btn-pulse';
        } else {
          this.btnNext.textContent = `▶ 【${nextRank}ランク】をめくる`;
          this.btnNext.className = 'btn btn-primary btn-reveal-action';
        }
      } else {
        this.btnNext.style.display = 'none';
        this.btnNext.disabled = true;
      }
    }
  }

  /**
   * 外部（P2P同期メッセージ）からのステップ進行
   */
  syncStepFromHost(rank) {
    if (!this.revealedRanks.has(rank)) {
      this.revealRank(rank);
    }
  }

  /**
   * 外部（P2P同期メッセージ）からの結果画面移動
   */
  syncFinishFromHost() {
    this.triggerGoResult();
  }

  /**
   * イベントリスナーのバインド
   */
  bindElements({
    boardEl,
    announcerBanner,
    announcerIcon,
    announcerText,
    hostControlsEl,
    guestControlsEl,
    operatorBadgeEl,
    rankPickersEl,
    hostNoticeEl,
    noticeHostNameEl,
    guestWaitingTextEl,
    btnNext,
    btnSkip,
    finishedCard,
    btnGoResult,
    hostNameEl,
    themeTitleEl,
    ruleBadgeEl,
    roundBadgeEl
  }) {
    this.boardEl = boardEl;
    this.announcerBanner = announcerBanner;
    this.announcerIcon = announcerIcon;
    this.announcerText = announcerText;
    this.hostControlsEl = hostControlsEl;
    this.guestControlsEl = guestControlsEl;
    this.operatorBadgeEl = operatorBadgeEl;
    this.rankPickersEl = rankPickersEl;
    this.hostNoticeEl = hostNoticeEl;
    this.noticeHostNameEl = noticeHostNameEl;
    this.guestWaitingTextEl = guestWaitingTextEl;
    this.btnNext = btnNext;
    this.btnSkip = btnSkip;
    this.finishedCard = finishedCard;
    this.btnGoResult = btnGoResult;
    this.hostNameEl = hostNameEl;
    this.themeTitleEl = themeTitleEl;
    this.ruleBadgeEl = ruleBadgeEl;
    this.roundBadgeEl = roundBadgeEl;

    // 「次をめくる」ボタン
    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => {
        this.executeStep();
      });
    }

    // スキップボタン
    if (this.btnSkip) {
      this.btnSkip.addEventListener('click', () => {
        this.skipToResult();
      });
    }

    // 結果へ進むボタン
    if (this.btnGoResult) {
      this.btnGoResult.addEventListener('click', () => {
        if (this.canControl && this.onBroadcastFinish) {
          this.onBroadcastFinish();
        }
        this.triggerGoResult();
      });
    }
  }

  cleanup() {
    if (this.confetti) {
      this.confetti.stop();
    }
  }
}
