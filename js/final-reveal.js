/**
 * 最終総合順位ドラマチック発表演出マネージャー
 * - ホストは好きな順番で順位（1位、2位、3位...）を発表可能！
 * - おすすめ順（最下位から順に発表）のボタンも完備
 * - ランキング一覧の未発表行を直接クリックして発表することも可能！
 * - ゲスト完全リアルタイム同期
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
    this.uniqueRanksAsc = []; // ユニークな順位の昇順配列 (例: [1, 2, 3, 4])
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
    this.rankPickersEl = null;
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

    // ユニークな順位のリスト（降順：最下位から、昇順：1位から）
    const uniqueRanks = Array.from(new Set(this.standings.map((s) => s.rank)));
    this.steps = [...uniqueRanks].sort((a, b) => b - a);
    this.uniqueRanksAsc = [...uniqueRanks].sort((a, b) => a - b);

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

    // 順位選択ボタン群の生成
    this.renderRankPickers();

    // 最初のアナウンス & コントロール更新
    this.updateAnnouncerInitial();
    this.updateControlsUI();

    // 最下位順位のプレビューハイライト
    const lowestRank = this.getNextUnrevealedRank();
    if (lowestRank !== null) {
      this.highlightActiveRank(lowestRank);
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

      // ホストは直接クリックでその順位を発表可能！
      if (this.isHost) {
        shroud.classList.add('is-clickable');
        shroud.setAttribute('role', 'button');
        shroud.setAttribute('title', `クリックして【第${rank}位】を発表`);
        shroud.innerHTML = `
          <div class="reveal-shroud-content single-mystery-panel">
            <div class="mystery-lock-badge">
              <span class="mystery-lock-icon">🔒</span>
              <span class="mystery-lock-text">未発表 (クリックで発表)</span>
            </div>
          </div>
        `;
        shroud.addEventListener('click', (e) => {
          e.stopPropagation();
          this.executeStep(rank);
        });
      } else {
        shroud.innerHTML = `
          <div class="reveal-shroud-content single-mystery-panel">
            <div class="mystery-lock-badge">
              <span class="mystery-lock-icon">🔒</span>
              <span class="mystery-lock-text">未発表</span>
            </div>
          </div>
        `;
      }

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
   * 順位選択ボタン群 (1位, 2位, 3位, 4位...) の描画
   */
  renderRankPickers() {
    if (!this.rankPickersEl) return;
    this.rankPickersEl.innerHTML = '';

    this.uniqueRanksAsc.forEach((rank) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      let pickClass = 'btn-pick-final-other';
      let label = `${rank}位`;
      if (rank === 1) {
        pickClass = 'btn-pick-final-1';
        label = '👑 1位 (優勝)';
      } else if (rank === 2) {
        pickClass = 'btn-pick-final-2';
        label = '🥈 2位';
      } else if (rank === 3) {
        pickClass = 'btn-pick-final-3';
        label = '🥉 3位';
      }

      btn.className = `btn btn-rank-pick ${pickClass}`;
      btn.dataset.rank = rank;
      btn.textContent = label;

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.executeStep(rank);
      });

      this.rankPickersEl.appendChild(btn);
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
   * 次の未発表順位（推奨順: 最下位から順）を取得
   */
  getNextUnrevealedRank() {
    return this.steps.find((r) => !this.revealedRanks.has(r)) ?? null;
  }

  /**
   * ホストによる順位発表実行
   */
  executeStep(targetRank = null) {
    if (!this.isHost || this.isFinished) return;

    const rankToOpen = targetRank !== null ? targetRank : this.getNextUnrevealedRank();
    if (rankToOpen === null || this.revealedRanks.has(rankToOpen)) return;

    this.revealRank(rankToOpen);

    if (this.onBroadcastStep) {
      this.onBroadcastStep({ rank: rankToOpen });
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

        const winners = this.standings.filter((s) => s.rank === 1);
        const winnerNames = winners.map((w) => w.playerName).join('・');
        const winnerScore = winners[0] ? winners[0].totalScore : 0;

        if (this.announcerBanner) {
          this.announcerBanner.className = 'reveal-announcer-banner climax-opened';
          this.announcerIcon.textContent = '🏆';
          this.announcerText.textContent = `🎉 総合優勝は 【${winnerNames}】 さん (${winnerScore}点) です！！`;
        }

        if (this.winnerMsgEl) {
          this.winnerMsgEl.textContent = `👑 総合優勝: ${winnerNames} さん (${winnerScore}点)！おめでとうございます！`;
        }

        this.updateControlsUI();
        this.checkAllRevealed();
      }, 1200);

    } else {
      // 2位以下のオープン
      this.openRankSlotVisual(rank);

      const players = this.standings.filter((s) => s.rank === rank);
      const names = players.map((p) => `${p.playerName} (${p.totalScore}点)`).join('、');

      if (this.announcerBanner) {
        this.announcerBanner.className = 'reveal-announcer-banner step-opened';
        this.announcerIcon.textContent = rank <= 3 ? '🥉' : '✨';
        this.announcerText.textContent = `【第${rank}位】発表！ ➔ ${names}`;
      }

      this.updateControlsUI();
      this.checkAllRevealed();
    }
  }

  /**
   * 全順位発表されたかチェック
   */
  checkAllRevealed() {
    const isAllDone = this.steps.every((r) => this.revealedRanks.has(r));
    if (isAllDone) {
      this.finishReveal();
    } else {
      const nextCandidate = this.getNextUnrevealedRank();
      if (nextCandidate !== null) {
        this.highlightActiveRank(nextCandidate);
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
    this.steps.forEach((r) => {
      if (!this.revealedRanks.has(r)) {
        this.openRankSlotVisual(r);
      }
    });

    if (this.announcerBanner) {
      this.announcerBanner.className = 'reveal-announcer-banner all-finished';
      this.announcerIcon.textContent = '🎉';
      this.announcerText.textContent = '全順位の発表が完了しました！セッション終了へ進みましょう！';
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
   * 一括スキップ
   */
  skipToAll() {
    this.steps.forEach((r) => {
      this.revealedRanks.add(r);
      this.openRankSlotVisual(r);
    });
    this.finishReveal();
  }

  /**
   * 初回アナウンス
   */
  updateAnnouncerInitial() {
    if (!this.announcerBanner || !this.announcerText) return;
    this.announcerIcon.textContent = '🥁';
    this.announcerText.textContent = '好きな順位を選んで発表できます！最下位から順に発表することも可能です。';
    this.announcerBanner.className = 'reveal-announcer-banner waiting-step';
  }

  /**
   * 操作ボタンのラベルと状態更新
   */
  updateControlsUI() {
    // 順位ボタンの状態更新
    if (this.rankPickersEl) {
      const buttons = this.rankPickersEl.querySelectorAll('.btn-rank-pick');
      buttons.forEach((btn) => {
        const rank = Number(btn.dataset.rank);
        if (this.revealedRanks.has(rank)) {
          btn.disabled = true;
          btn.classList.add('is-opened');
          btn.textContent = `✅ ${rank}位 発表済`;
        } else {
          btn.disabled = false;
          btn.classList.remove('is-opened');
          if (rank === 1) {
            btn.textContent = '👑 1位 (優勝)';
          } else if (rank === 2) {
            btn.textContent = '🥈 2位';
          } else if (rank === 3) {
            btn.textContent = '🥉 3位';
          } else {
            btn.textContent = `${rank}位`;
          }
        }
      });
    }

    // 「次の順位を発表」おすすめボタン
    if (this.btnNext) {
      const nextRank = this.getNextUnrevealedRank();
      if (nextRank !== null && !this.isFinished) {
        this.btnNext.style.display = '';
        this.btnNext.disabled = false;
        if (nextRank === 1) {
          this.btnNext.textContent = '👑 【第1位（優勝）】を発表！';
          this.btnNext.className = 'btn btn-warning btn-reveal-action btn-pulse';
        } else {
          this.btnNext.textContent = `▶ 【第${nextRank}位】を発表`;
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
   * DOM要素バインド
   */
  bindElements({
    listEl,
    announcerBanner,
    announcerIcon,
    announcerText,
    hostControlsEl,
    guestControlsEl,
    rankPickersEl,
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
    this.rankPickersEl = rankPickersEl;
    this.btnNext = btnNext;
    this.btnSkip = btnSkip;
    this.finishedCard = finishedCard;
    this.btnBackLobby = btnBackLobby;
    this.totalRoundsEl = totalRoundsEl;
    this.winnerMsgEl = winnerMsgEl;

    if (this.btnNext) {
      this.btnNext.addEventListener('click', () => {
        this.executeStep();
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
