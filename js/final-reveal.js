/**
 * 最終総合順位ドラマチック発表演出マネージャー
 * - 最下位から1位（総合優勝）へ順番にめくりあがる
 * - ホスト手動進行 / ゲスト完全リアルタイム同期
 * - ゲストはスキップ不可、ホストの進行に従う
 * - 1位（総合優勝者）のクライマックス演出＆紙吹雪
 */

import { ConfettiManager } from './confetti.js';

export class FinalRevealManager {
  constructor({
    container,
    confettiCanvas,
    onFinished,
    onBroadcastStep
  }) {
    this.container = container;
    this.confetti = confettiCanvas ? new ConfettiManager(confettiCanvas) : null;
    this.onFinished = onFinished;
    this.onBroadcastStep = onBroadcastStep;

    this.standings = []; // Array<{ peerId, playerName, totalScore, rank }>
    this.steps = []; // ユニークな順位の降順配列 (例: [4, 3, 2, 1])
    this.currentStepIdx = 0;
    this.revealedRanks = new Set();
    this.isFinished = false;
    this.isHost = false;

    // DOMキャッシュ
    this.listEl = null;
    this.announcerBanner = null;
    this.announcerIcon = null;
    this.announcerText = null;
    this.hostControlsEl = null;
    this.guestControlsEl = null;
    this.btnNext = null;
    this.btnSkip = null;
    this.finishedCard = null;
    this.btnBackLobby = null;
    this.totalRoundsEl = null;
    this.winnerMsgEl = null;
    this.rowElements = {}; // rank => Array<{ row, shroud, infoContainer }>
  }

  /**
   * ステージ初期化
   */
  initStage(cumulativeScores, totalRounds = 1, isHost = false) {
    this.cleanup();
    this.isHost = Boolean(isHost);
    this.currentStepIdx = 0;
    this.revealedRanks = new Set();
    this.isFinished = false;

    if (this.totalRoundsEl) {
      this.totalRoundsEl.textContent = `全${totalRounds}ラウンド終了`;
    }

    // 順位データの計算 (同点の場合は同順位)
    const sorted = [...(cumulativeScores || [])].sort((a, b) => (b.totalScore || 0) - (a.totalScore || 0));
    let currentRank = 1;
    this.standings = sorted.map((p, idx) => {
      if (idx > 0 && p.totalScore < sorted[idx - 1].totalScore) {
        currentRank = idx + 1;
      }
      return {
        ...p,
        rank: currentRank
      };
    });

    // 発表順序ステップ (最下位から1位へ)
    const uniqueRanks = Array.from(new Set(this.standings.map(s => s.rank))).sort((a, b) => b - a);
    this.steps = uniqueRanks;

    // 前回のDOM状態をリセット
    if (this.btnNext) {
      this.btnNext.style.display = '';
      this.btnNext.disabled = false;
    }
    if (this.finishedCard) {
      this.finishedCard.style.display = 'none';
      this.finishedCard.classList.remove('animate-fade-in-up');
    }

    // ホスト / ゲストコントロール切り替え
    if (this.hostControlsEl) {
      this.hostControlsEl.style.display = this.isHost ? 'flex' : 'none';
    }
    if (this.guestControlsEl) {
      this.guestControlsEl.style.display = this.isHost ? 'none' : 'flex';
    }

    // ランキング表のレンダリング (伏せ状態)
    this.renderStandings();

    // 最初のアナウンス & コントロール更新
    this.updateAnnouncerForCurrentStep();
    this.updateControlsUI();

    // 最初の発表対象順位をハイライト
    if (this.steps.length > 0) {
      this.highlightActiveRank(this.steps[0]);
    }
  }

  /**
   * ランキングリストのレンダリング
   */
  renderStandings() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    this.rowElements = {};

    this.standings.forEach((player) => {
      const rank = player.rank;
      const row = document.createElement('div');
      row.className = `final-rank-row rank-level-${rank}`;
      row.dataset.rank = rank;

      // 1. 順位バッジ (1位〜3位はメダル装飾)
      const badge = document.createElement('div');
      badge.className = `final-rank-badge rank-badge-${rank}`;
      if (rank === 1) {
        badge.innerHTML = '👑 1位';
      } else if (rank === 2) {
        badge.innerHTML = '🥈 2位';
      } else if (rank === 3) {
        badge.innerHTML = '🥉 3位';
      } else {
        badge.innerHTML = `${rank}位`;
      }

      // 2. スロット (プレイヤー名 + スコア)
      const slot = document.createElement('div');
      slot.className = 'final-rank-slot';

      // 伏せカバー
      const shroud = document.createElement('div');
      shroud.className = 'reveal-shroud';
      shroud.innerHTML = `
        <div class="reveal-shroud-content single-mystery-panel">
          <div class="mystery-lock-badge">
            <span class="mystery-lock-icon">🔒</span>
            <span class="mystery-lock-text">未発表</span>
          </div>
        </div>
      `;

      // オープン後の情報コンテナ
      const infoContainer = document.createElement('div');
      infoContainer.className = 'final-player-info';
      infoContainer.style.display = 'none';

      const nameEl = document.createElement('div');
      nameEl.className = 'final-player-name';
      nameEl.textContent = player.playerName || 'プレイヤー';

      const scoreEl = document.createElement('div');
      scoreEl.className = 'final-player-score';
      scoreEl.innerHTML = `<span class="score-num">${player.totalScore || 0}</span> <span class="score-unit">点</span>`;

      infoContainer.appendChild(nameEl);
      infoContainer.appendChild(scoreEl);

      slot.appendChild(shroud);
      slot.appendChild(infoContainer);

      row.appendChild(badge);
      row.appendChild(slot);
      this.listEl.appendChild(row);

      if (!this.rowElements[rank]) {
        this.rowElements[rank] = [];
      }
      this.rowElements[rank].push({ row, shroud, infoContainer });
    });
  }

  /**
   * 現在注目中の順位行をハイライト
   */
  highlightActiveRank(targetRank) {
    Object.keys(this.rowElements).forEach((rStr) => {
      const r = Number(rStr);
      const rows = this.rowElements[r] || [];
      rows.forEach(({ row }) => {
        if (r === targetRank && !this.revealedRanks.has(r)) {
          row.classList.add('is-active-target');
          if (r === 1) {
            row.classList.add('is-first-place-climax');
          }
        } else {
          row.classList.remove('is-active-target');
          if (r !== 1) {
            row.classList.remove('is-first-place-climax');
          }
        }
      });
    });
  }

  /**
   * ホストが手動で「次の順位を発表」を押した時
   */
  hostExecuteNextStep() {
    if (!this.isHost || this.isFinished) return;

    if (this.currentStepIdx < this.steps.length) {
      const targetRank = this.steps[this.currentStepIdx];
      this.revealRank(targetRank);
      if (this.onBroadcastStep) {
        this.onBroadcastStep({ rank: targetRank, stepIdx: this.currentStepIdx });
      }
    } else {
      this.finishReveal();
    }
  }

  /**
   * 特定の順位をオープン！
   */
  revealRank(rank) {
    if (this.revealedRanks.has(rank)) return;

    this.revealedRanks.add(rank);
    const rows = this.rowElements[rank] || [];

    if (rank === 1) {
      // 第1位：総合優勝クライマックス！
      if (this.announcerBanner) {
        this.announcerBanner.className = 'reveal-announcer-banner climax-drumroll';
        this.announcerIcon.textContent = '🌟';
        this.announcerText.textContent = `そして栄えある【総合優勝・第1位】は……！？`;
      }

      rows.forEach(({ row }) => row.classList.add('is-first-place-climax'));

      // 1.2秒のタメの後にドカーンとオープン！
      setTimeout(() => {
        this.openRankSlotVisual(rank);
        if (this.confetti) {
          this.confetti.start(160, 5000);
        }

        const winners = this.standings.filter(s => s.rank === 1);
        const winnerNames = winners.map(w => w.playerName).join('・');
        const winnerScore = winners[0] ? winners[0].totalScore : 0;

        if (this.announcerBanner) {
          this.announcerBanner.className = 'reveal-announcer-banner climax-opened';
          this.announcerIcon.textContent = '🏆';
          this.announcerText.textContent = `🎉 総合優勝は 【${winnerNames}】 さん (${winnerScore}点) です！！`;
        }

        if (this.winnerMsgEl) {
          this.winnerMsgEl.textContent = `👑 総合優勝: ${winnerNames} さん (${winnerScore}点)！おめでとうございます！`;
        }

        this.currentStepIdx++;
        this.updateControlsUI();
        this.finishReveal();
      }, 1200);

    } else {
      // 2位以下のオープン
      this.openRankSlotVisual(rank);

      const players = this.standings.filter(s => s.rank === rank);
      const names = players.map(p => `${p.playerName} (${p.totalScore}点)`).join('、');

      if (this.announcerBanner) {
        this.announcerBanner.className = 'reveal-announcer-banner step-opened';
        this.announcerIcon.textContent = rank <= 3 ? '🥉' : '✨';
        this.announcerText.textContent = `【第${rank}位】発表！ ➔ ${names}`;
      }

      this.currentStepIdx++;
      this.updateControlsUI();

      if (this.currentStepIdx < this.steps.length) {
        const nextRank = this.steps[this.currentStepIdx];
        this.highlightActiveRank(nextRank);
      } else {
        this.finishReveal();
      }
    }
  }

  /**
   * 該当順位行の伏せカバーを外して表示
   */
  openRankSlotVisual(rank) {
    const rows = this.rowElements[rank] || [];
    rows.forEach(({ row, shroud, infoContainer }) => {
      row.classList.remove('is-active-target');
      row.classList.add('is-revealed');
      shroud.classList.add('shroud-vanish');
      setTimeout(() => {
        shroud.style.display = 'none';
      }, 280);
      infoContainer.style.display = 'flex';
    });
  }

  /**
   * 全順位発表完了
   */
  finishReveal() {
    this.isFinished = true;

    // 未発表があれば全開放
    this.steps.forEach(r => {
      if (!this.revealedRanks.has(r)) {
        this.openRankSlotVisual(r);
      }
    });

    if (this.btnNext) {
      this.btnNext.style.display = 'none';
    }

    if (this.finishedCard) {
      this.finishedCard.style.display = 'block';
      this.finishedCard.classList.add('animate-fade-in-up');
    }
  }

  /**
   * 一括スキップ
   */
  skipToAll() {
    this.steps.forEach(r => {
      this.revealedRanks.add(r);
      this.openRankSlotVisual(r);
    });
    this.finishReveal();
  }

  /**
   * 操作ボタンのラベル更新
   */
  updateControlsUI() {
    if (this.btnNext) {
      if (this.currentStepIdx < this.steps.length) {
        const nextRank = this.steps[this.currentStepIdx];
        const label = nextRank === 1 ? '👑 【第1位（優勝）】を発表！' : `▶ 【第${nextRank}位】を発表`;
        this.btnNext.style.display = '';
        this.btnNext.textContent = label;
        this.btnNext.disabled = false;
        if (nextRank === 1) {
          this.btnNext.className = 'btn btn-warning btn-reveal-action btn-pulse';
        } else {
          this.btnNext.className = 'btn btn-primary btn-reveal-action';
        }
      } else {
        this.btnNext.style.display = 'none';
        this.btnNext.disabled = true;
      }
    }
  }

  /**
   * ゲスト同期：ホストがめくった順位を開く
   */
  syncStepFromHost(rank) {
    if (!this.revealedRanks.has(rank)) {
      this.revealRank(rank);
    }
  }

  /**
   * アナウンサーの文言更新
   */
  updateAnnouncerForCurrentStep() {
    if (!this.announcerBanner || !this.announcerText) return;

    if (this.currentStepIdx < this.steps.length) {
      const targetRank = this.steps[this.currentStepIdx];
      let msg = '';
      if (targetRank === 1) {
        msg = '残るは頂点……栄えある【総合優勝・第1位】は…！？';
      } else if (targetRank === 2) {
        msg = '準優勝！【第2位】の発表！';
      } else if (targetRank === 3) {
        msg = '表彰台！【第3位】の発表！';
      } else {
        msg = `まずは…【第${targetRank}位】から発表！`;
      }
      this.announcerIcon.textContent = targetRank === 1 ? '🔥' : '🥁';
      this.announcerText.textContent = msg;
      this.announcerBanner.className = 'reveal-announcer-banner waiting-step';
    }
  }

  /**
   * DOM要素バインド
   */
  bindElements({
    listEl,
    announcerBanner,
    announcerIcon,
    announcerText,
    hostControlsEl,
    guestControlsEl,
    btnNext,
    btnSkip,
    finishedCard,
    btnBackLobby,
    totalRoundsEl,
    winnerMsgEl
  }) {
    this.listEl = listEl;
    this.announcerBanner = announcerBanner;
    this.announcerIcon = announcerIcon;
    this.announcerText = announcerText;
    this.hostControlsEl = hostControlsEl;
    this.guestControlsEl = guestControlsEl;
    this.btnNext = btnNext;
    this.btnSkip = btnSkip;
    this.finishedCard = finishedCard;
    this.btnBackLobby = btnBackLobby;
    this.totalRoundsEl = totalRoundsEl;
    this.winnerMsgEl = winnerMsgEl;

    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => {
        this.hostExecuteNextStep();
      });
    }

    if (this.btnSkip) {
      this.btnSkip.addEventListener('click', () => {
        this.skipToAll();
      });
    }

    if (this.btnBackLobby) {
      this.btnBackLobby.addEventListener('click', () => {
        if (this.onFinished) {
          this.onFinished();
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
