/**
 * 主役のTier表ドラマチックめくり発表演出マネージャー
 * - ホスト手動進行 / ゲスト完全同期 (ホストがめくったらゲストもめくれる)
 * - ゲストはスキップ不可、ホストの進行に従う
 * - 伏せている間は要素数が一切わからないミステリアスカバー
 * - 2ラウンド目以降もボタン状態を確実にリセット
 */

import { TIER_COLORS } from './config.js';
import { createTierItemChip } from './tier-board.js?v=20261004_side_by_side_fix';
import { ConfettiManager } from './confetti.js';

export const REVEAL_RANKS = ['D', 'C', 'B', 'A', 'S'];

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
    this.currentStepIdx = 0; // 0=D, 1=C, 2=B, 3=A, 4=S, 5=AllRevealed
    this.revealedRanks = new Set();
    this.isFinished = false;

    // DOMキャッシュ
    this.boardEl = null;
    this.announcerBanner = null;
    this.announcerIcon = null;
    this.announcerText = null;
    this.hostControlsEl = null;
    this.guestControlsEl = null;
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
   */
  initStage(payload, isHost = false) {
    this.cleanup();
    this.payload = payload;
    this.isHost = Boolean(isHost);
    this.currentStepIdx = 0;
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

    // ★重要: 前ラウンドで完了時に非表示・表示切替された要素を完全にリセット！
    if (this.btnNext) {
      this.btnNext.style.display = '';
      this.btnNext.disabled = false;
      this.btnNext.textContent = '▶ 【Dランク】をめくる';
    }

    if (this.finishedCard) {
      this.finishedCard.style.display = 'none';
      this.finishedCard.classList.remove('animate-fade-in-up');
    }

    // ホスト / ゲストのコントロールバー表示切り替え
    if (this.hostControlsEl) {
      this.hostControlsEl.style.display = this.isHost ? 'flex' : 'none';
    }
    if (this.guestControlsEl) {
      this.guestControlsEl.style.display = this.isHost ? 'none' : 'flex';
    }

    // Tierボードのレンダリング (要素数がわからないシークレットカバー付き)
    this.renderBoard(roundHostTier);

    // 最初のアナウンスセット
    this.updateAnnouncerForCurrentStep();
    this.updateControlsUI();

    // 最初のランク（D）のプレビュー鼓動エフェクト
    this.highlightActiveRank('D');
  }

  /**
   * ボードのHTML構造を描画
   * ★重要: 隠れている間は要素数が一切わからないように単一のシークレットバーを配置！
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
      // ★要素数が絶対にわからないように、アイテム数に関係なく単一のミステリアスパネルを配置
      const shroud = document.createElement('div');
      shroud.className = 'reveal-shroud';

      const shroudContent = document.createElement('div');
      shroudContent.className = 'reveal-shroud-content single-mystery-panel';
      shroudContent.innerHTML = `
        <div class="mystery-lock-badge">
          <span class="mystery-lock-icon">🔒</span>
          <span class="mystery-lock-text">未発表</span>
        </div>
      `;
      shroud.appendChild(shroudContent);

      // 2. めくられた時に表示される実際のアイテムコンテナ
      const items = tierState[rank] || [];
      const chipsContainer = document.createElement('div');
      chipsContainer.className = 'reveal-chips-container';
      chipsContainer.style.display = 'none'; // 初期は非表示

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
   * 現在注目中のランク行をハイライト
   */
  highlightActiveRank(targetRank) {
    REVEAL_RANKS.forEach((rank) => {
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
   * ホストが手動で「次のランク」をめくるボタンを押した時の処理
   */
  hostExecuteNextStep() {
    if (!this.isHost || this.isFinished) return;

    if (this.currentStepIdx < REVEAL_RANKS.length) {
      const targetRank = REVEAL_RANKS[this.currentStepIdx];
      // ホスト自身でめくり実行
      this.revealRank(targetRank);
      // ゲストへ同期通知
      if (this.onBroadcastStep) {
        this.onBroadcastStep({ rank: targetRank, stepIdx: this.currentStepIdx });
      }
    } else {
      this.finishReveal();
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

        this.currentStepIdx++;
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

      this.currentStepIdx++;
      this.updateControlsUI();

      if (this.currentStepIdx < REVEAL_RANKS.length) {
        const nextRank = REVEAL_RANKS[this.currentStepIdx];
        this.highlightActiveRank(nextRank);
      } else {
        this.checkAllRevealed();
      }
    }
  }

  /**
   * 全てめくられたかチェック
   */
  checkAllRevealed() {
    if (this.currentStepIdx >= REVEAL_RANKS.length) {
      this.finishReveal();
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
    REVEAL_RANKS.forEach((rank) => {
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
  }

  /**
   * ホスト用スキップ：即座に結果画面へ進む（ゲストも道連れ同期）
   */
  skipToResult() {
    REVEAL_RANKS.forEach((rank) => {
      this.revealedRanks.add(rank);
      this.openRankSlotVisual(rank);
    });
    this.isFinished = true;

    if (this.onBroadcastFinish && this.isHost) {
      this.onBroadcastFinish();
    }
    this.triggerGoResult();
  }

  /**
   * ホストが「結果発表・スコアを見る ➔」ボタンを押した時
   */
  hostTriggerGoResult() {
    if (this.onBroadcastFinish && this.isHost) {
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
   * アナウンサーの文言更新
   */
  updateAnnouncerForCurrentStep() {
    if (!this.announcerBanner || !this.announcerText) return;

    if (this.currentStepIdx < REVEAL_RANKS.length) {
      const targetRank = REVEAL_RANKS[this.currentStepIdx];
      const msgs = {
        D: 'まずは…最もシビアな評価【Dランク】から発表！',
        C: '続いて…【Cランク】の発表！',
        B: '真ん中の安定ライン…【Bランク】の発表！',
        A: 'ここからは高評価ゾーン！…【Aランク】の発表！',
        S: '残るは頂点……栄えある【最高評価 Sランク】は…！？'
      };
      this.announcerIcon.textContent = targetRank === 'S' ? '🔥' : '🥁';
      this.announcerText.textContent = msgs[targetRank] || `${targetRank}ランクの発表！`;
      this.announcerBanner.className = 'reveal-announcer-banner waiting-step';
    }
  }

  /**
   * 操作ボタンのラベルと状態更新 (次ラウンド時も確実に再表示)
   */
  updateControlsUI() {
    if (this.btnNext) {
      if (this.currentStepIdx < REVEAL_RANKS.length) {
        const nextRank = REVEAL_RANKS[this.currentStepIdx];
        this.btnNext.style.display = '';
        this.btnNext.textContent = `▶ 【${nextRank}ランク】をめくる`;
        this.btnNext.disabled = false;
      } else {
        this.btnNext.style.display = 'none';
        this.btnNext.disabled = true;
      }
    }
  }

  /**
   * 外部（ホストからのP2P同期メッセージ）からのステップ進行
   * ★ホストがめくった瞬間にゲストもめくれる！
   */
  syncStepFromHost(rank) {
    if (!this.revealedRanks.has(rank)) {
      this.revealRank(rank);
    }
  }

  /**
   * 外部（ホストからの結果画面遷移メッセージ）からの画面移動
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
    this.btnNext = btnNext;
    this.btnSkip = btnSkip;
    this.finishedCard = finishedCard;
    this.btnGoResult = btnGoResult;
    this.hostNameEl = hostNameEl;
    this.themeTitleEl = themeTitleEl;
    this.ruleBadgeEl = ruleBadgeEl;
    this.roundBadgeEl = roundBadgeEl;

    // ホストの「次をめくる」ボタン
    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => {
        this.hostExecuteNextStep();
      });
    }

    // ホスト用スキップ (ゲストも一緒に遷移)
    if (this.btnSkip) {
      this.btnSkip.addEventListener('click', () => {
        this.skipToResult();
      });
    }

    // 結果へ進むボタン
    if (this.btnGoResult) {
      this.btnGoResult.addEventListener('click', () => {
        if (this.isHost) {
          this.hostTriggerGoResult();
        } else {
          this.triggerGoResult();
        }
      });
    }
  }

  cleanup() {
    if (this.confetti) {
      this.confetti.stop();
    }
  }
}
