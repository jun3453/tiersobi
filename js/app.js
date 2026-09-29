import { HostPeerManager, GuestPeerManager } from './p2p.js';
import { TierBoard, createComparisonGrid } from './tier-board.js';
import { calculatePlayerScore, buildItemToRankMap } from './scoring.js';
import { THEME_EXAMPLES, MIN_ITEMS, MAX_ITEMS } from './config.js?v=20260930_110themes';

// DOM要素
const screens = {
  connecting: document.getElementById('screen-connecting'),
  lobby: document.getElementById('screen-lobby'),
  playing: document.getElementById('screen-playing'),
  result: document.getElementById('screen-result')
};

const connectionIndicator = document.getElementById('connection-indicator');
const connectionStatusText = document.getElementById('connection-status-text');

// 接続関連
const tabBtnGuest = document.getElementById('tab-btn-guest');
const tabBtnHost = document.getElementById('tab-btn-host');
const panelGuestConnect = document.getElementById('panel-guest-connect');
const panelHostCreate = document.getElementById('panel-host-create');
const inputPlayerName = document.getElementById('input-player-name');
const inputHostId = document.getElementById('input-host-id');
const btnJoinRoom = document.getElementById('btn-join-room');
const inputHostName = document.getElementById('input-host-name');
const btnCreateRoom = document.getElementById('btn-create-room');
const hostRoomInfo = document.getElementById('host-room-info');
const inviteLinkText = document.getElementById('invite-link-text');
const btnCopyInvite = document.getElementById('btn-copy-invite');
const btnHostEnterLobby = document.getElementById('btn-host-enter-lobby');

// ロビー関連
const lobbyPlayerList = document.getElementById('lobby-player-list');
const playerCountEl = document.getElementById('player-count');
const lobbyReadySummary = document.getElementById('lobby-ready-summary');
const hostGameControls = document.getElementById('host-game-controls');
const guestWaitingPanel = document.getElementById('guest-waiting-panel');
const btnStartGame = document.getElementById('btn-start-game');
const hostStartHint = document.getElementById('host-start-hint');

// お題作成フォーム
const checkboxSkipTheme = document.getElementById('checkbox-skip-theme');
const themeInputsContainer = document.getElementById('theme-inputs-container');
const inputMyTheme = document.getElementById('input-my-theme');
const btnRandomExample = document.getElementById('btn-random-example');
const itemInputsList = document.getElementById('item-inputs-list');
const btnAddItemField = document.getElementById('btn-add-item-field');
const btnToggleReady = document.getElementById('btn-toggle-ready');
const btnToggleBulkInput = document.getElementById('btn-toggle-bulk-input');
const bulkInputContainer = document.getElementById('bulk-input-container');
const textareaBulkItems = document.getElementById('textarea-bulk-items');
const btnApplyBulkItems = document.getElementById('btn-apply-bulk-items');

// プレイ画面
const playingRoundBadge = document.getElementById('playing-round-badge');
const playingHostBadge = document.getElementById('playing-host-badge');
const playingThemeTitle = document.getElementById('playing-theme-title');
const playingThemeCreator = document.getElementById('playing-theme-creator');
const playingRoleBanner = document.getElementById('playing-role-banner');
const playingRoleMainText = document.getElementById('playing-role-main-text');
const playingRoleSubText = document.getElementById('playing-role-sub-text');
const poolCountBadge = document.getElementById('pool-count-badge');
const itemPoolEl = document.getElementById('item-pool');

// 左右差ルール関連
const tierOrderRuleBar = document.getElementById('tier-order-rule-bar');
const hostOrderRuleControl = document.getElementById('host-order-rule-control');
const btnRuleNoOrder = document.getElementById('btn-rule-no-order');
const btnRuleHasOrder = document.getElementById('btn-rule-has-order');
const guesserOrderRuleDisplay = document.getElementById('guesser-order-rule-display');
const guesserOrderRuleBadge = document.getElementById('guesser-order-rule-badge');

const tierSlotElements = {
  S: document.getElementById('tier-slot-s'),
  A: document.getElementById('tier-slot-a'),
  B: document.getElementById('tier-slot-b'),
  C: document.getElementById('tier-slot-c'),
  D: document.getElementById('tier-slot-d')
};
const btnSubmitTier = document.getElementById('btn-submit-tier');
const btnEditAgainTier = document.getElementById('btn-edit-again-tier');
const submitStatusMsg = document.getElementById('submit-status-msg');
const submitGuideHint = document.getElementById('submit-guide-hint');
const submissionStatusCard = document.getElementById('submission-status-card');
const submissionCountBadge = document.getElementById('submission-count-badge');
const submissionPlayersList = document.getElementById('submission-players-list');

// 結果画面
const resultRoundTitle = document.getElementById('result-round-title');
const resultRoundSubtitle = document.getElementById('result-round-subtitle');
const hostBonusContainer = document.getElementById('host-bonus-container');
const roundScoresContainer = document.getElementById('round-scores-container');
const comparisonTiersContainer = document.getElementById('comparison-tiers-container');
const cumulativeScoresBody = document.getElementById('cumulative-scores-body');
const resultHostControls = document.getElementById('result-host-controls');
const resultGuestWaiting = document.getElementById('result-guest-waiting');
const btnNextAction = document.getElementById('btn-next-action');

// トーストコンテナ
const toastContainer = document.getElementById('toast-container');

// アプリケーション状態
let currentRole = null; // 'host' | 'guest'
let myPeerId = null;
let myName = '';
let isReady = false;

let hostManager = null;
let guestManager = null;
let tierBoard = null;

// セッション・ラウンド進行データ (ホスト管理)
let sessionRounds = []; // Array<{ round: number, hostPlayerId: string, hostPlayerName: string, theme: string, items: string[] }>
let currentRoundIndex = 0;
let cumulativeScoresMap = new Map(); // Map<peerId, { name: string, totalScore: number }>

// 現在のラウンド情報 (全クライアント共通)
let currentRoundData = null;
let currentRoundSubmittedTiers = new Map(); // Map<peerId, { name: string, tier: any }>
let mySubmittedTier = null;

/**
 * トースト通知
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * 画面切り替え
 */
function switchState(stateName) {
  Object.keys(screens).forEach((key) => {
    if (key === stateName) {
      screens[key].classList.add('active');
    } else {
      screens[key].classList.remove('active');
    }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateConnectionBadge(status, text) {
  connectionStatusText.textContent = text;
  if (status === 'connected') {
    connectionIndicator.classList.add('connected');
  } else {
    connectionIndicator.classList.remove('connected');
  }
}

// ==========================================
// 動的アイテム入力フォームの制御
// ==========================================
function renderItemInputRows(initialValues = []) {
  itemInputsList.innerHTML = '';
  const count = Math.max(initialValues.length, MIN_ITEMS);

  for (let i = 0; i < count; i++) {
    addItemInputRow(initialValues[i] || '');
  }
  updateAddButtonState();
}

function addItemInputRow(value = '') {
  const currentCount = itemInputsList.children.length;
  if (currentCount >= MAX_ITEMS) return;

  const row = document.createElement('div');
  row.className = 'item-input-row';

  const label = document.createElement('span');
  label.className = 'item-index-label';
  label.textContent = `#${currentCount + 1}`;

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = `アイテム ${currentCount + 1}`;
  input.value = value;
  input.maxLength = 20;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-remove-item';
  removeBtn.innerHTML = '✕';
  removeBtn.title = '削除';
  removeBtn.addEventListener('click', () => {
    if (itemInputsList.children.length > MIN_ITEMS) {
      row.remove();
      renumberItemRows();
      updateAddButtonState();
    } else {
      showToast(`アイテムは最低${MIN_ITEMS}個必要です`, 'info');
    }
  });

  row.appendChild(label);
  row.appendChild(input);
  row.appendChild(removeBtn);
  itemInputsList.appendChild(row);

  renumberItemRows();
  updateAddButtonState();
}

function renumberItemRows() {
  const rows = itemInputsList.children;
  for (let i = 0; i < rows.length; i++) {
    const label = rows[i].querySelector('.item-index-label');
    if (label) label.textContent = `#${i + 1}`;
    const removeBtn = rows[i].querySelector('.btn-remove-item');
    if (removeBtn) {
      removeBtn.disabled = rows.length <= MIN_ITEMS;
    }
  }
}

function updateAddButtonState() {
  const currentCount = itemInputsList.children.length;
  btnAddItemField.disabled = currentCount >= MAX_ITEMS;
  btnAddItemField.textContent = currentCount >= MAX_ITEMS
    ? `最大上限 (${MAX_ITEMS}個) に達しました`
    : `＋ アイテムを追加 (${currentCount}/${MAX_ITEMS}個)`;
}

btnAddItemField.addEventListener('click', () => {
  addItemInputRow('');
});

// カンマ・改行での一括入力
btnToggleBulkInput.addEventListener('click', () => {
  const isHidden = bulkInputContainer.style.display === 'none';
  bulkInputContainer.style.display = isHidden ? 'block' : 'none';
  btnToggleBulkInput.textContent = isHidden ? '✕ 一括入力を閉じる' : '📋 カンマや改行で一括入力する';
});

btnApplyBulkItems.addEventListener('click', () => {
  const raw = textareaBulkItems.value.trim();
  if (!raw) {
    showToast('アイテムをカンマまたは改行で入力してください', 'info');
    return;
  }
  const parsed = raw.split(/[,、\n]/).map(i => i.trim()).filter(i => i.length > 0);
  if (parsed.length < MIN_ITEMS) {
    showToast(`アイテムは最低${MIN_ITEMS}個必要です`, 'error');
    return;
  }
  const clamped = parsed.slice(0, MAX_ITEMS);
  renderItemInputRows(clamped);
  showToast(`${clamped.length}個のアイテムを入力枠に反映しました！`, 'success');
  bulkInputContainer.style.display = 'none';
  btnToggleBulkInput.textContent = '📋 カンマや改行で一括入力する';
});

// お題を出さない（スキップ）トグル
checkboxSkipTheme.addEventListener('change', () => {
  const isSkipped = checkboxSkipTheme.checked;
  themeInputsContainer.style.opacity = isSkipped ? '0.4' : '1';
  themeInputsContainer.style.pointerEvents = isSkipped ? 'none' : 'auto';
  inputMyTheme.disabled = isSkipped;
  if (btnRandomExample) btnRandomExample.disabled = isSkipped;
  itemInputsList.querySelectorAll('input').forEach(i => i.disabled = isSkipped);
  itemInputsList.querySelectorAll('button').forEach(b => b.disabled = isSkipped);
  btnAddItemField.disabled = isSkipped;
  btnToggleBulkInput.disabled = isSkipped;

  if (isSkipped) {
    btnToggleReady.textContent = '✅ お題スキップでReady！';
  } else {
    btnToggleReady.textContent = '✅ このお題でReady！';
  }
});

/**
 * 例文から初期フォームをセット
 */
function setupExampleForm(notify = false) {
  // 現在のお題と被らない候補から選出
  const currentTitle = inputMyTheme.value.trim() || inputMyTheme.placeholder.replace(/^例:\s*/, '').trim();
  const candidates = THEME_EXAMPLES.filter(ex => ex.theme !== currentTitle);
  const pool = candidates.length > 0 ? candidates : THEME_EXAMPLES;
  const example = pool[Math.floor(Math.random() * pool.length)];

  inputMyTheme.value = example.theme;
  inputMyTheme.placeholder = `例: ${example.theme}`;
  renderItemInputRows(example.items);

  if (notify) {
    showToast(`お題「${example.theme}」をセットしました！ (全${THEME_EXAMPLES.length}種)`, 'info');
  }
}

// 🎲 他のデフォルトお題をセットボタン
if (btnRandomExample) {
  btnRandomExample.addEventListener('click', () => {
    if (checkboxSkipTheme.checked) return;
    setupExampleForm(true);
  });
}

/**
 * フォーム入力値の検証と取得
 */
function getFormThemeData() {
  if (checkboxSkipTheme.checked) {
    return {
      valid: true,
      themeData: {
        theme: '',
        items: [],
        isSkipped: true
      }
    };
  }

  const theme = inputMyTheme.value.trim() || inputMyTheme.placeholder.replace(/^例:\s*/, '').trim();
  const items = [];
  const rows = itemInputsList.children;

  for (let i = 0; i < rows.length; i++) {
    const input = rows[i].querySelector('input');
    const val = input ? input.value.trim() : '';
    if (val) {
      items.push(val);
    }
  }

  if (!theme || theme.length > 50) {
    return { valid: false, error: 'お題タイトルは1〜50文字以内で入力してください。' };
  }
  if (items.length < MIN_ITEMS || items.length > MAX_ITEMS) {
    return { valid: false, error: `アイテムは${MIN_ITEMS}〜${MAX_ITEMS}個入力してください。` };
  }
  const uniqueItems = Array.from(new Set(items));
  if (uniqueItems.length !== items.length) {
    return { valid: false, error: 'アイテム名が重複しています。' };
  }

  return { valid: true, themeData: { theme, items, isSkipped: false } };
}

// Ready ボタンのトグル
btnToggleReady.addEventListener('click', () => {
  if (!isReady) {
    // Readyにする
    const result = getFormThemeData();
    if (!result.valid) {
      showToast(result.error, 'error');
      return;
    }

    isReady = true;
    btnToggleReady.classList.add('is-ready');
    btnToggleReady.textContent = '↩ Readyを解除して編集する';
    inputMyTheme.disabled = true;
    itemInputsList.querySelectorAll('input').forEach(i => i.disabled = true);
    itemInputsList.querySelectorAll('button').forEach(b => b.disabled = true);
    btnAddItemField.disabled = true;

    if (currentRole === 'host') {
      hostManager.setHostReady(true, result.themeData);
      updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
    } else {
      guestManager.sendReady(true, result.themeData);
    }
    showToast('Ready完了！全員が揃うのをお待ちください。', 'success');
  } else {
    // Ready解除
    isReady = false;
    btnToggleReady.classList.remove('is-ready');
    btnToggleReady.textContent = '✅ このお題でReady！';
    inputMyTheme.disabled = false;
    itemInputsList.querySelectorAll('input').forEach(i => i.disabled = false);
    itemInputsList.querySelectorAll('button').forEach(b => b.disabled = false);
    updateAddButtonState();

    if (currentRole === 'host') {
      hostManager.setHostReady(false, null);
      updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
    } else {
      guestManager.sendReady(false, null);
    }
    showToast('Readyを解除しました。', 'info');
  }
});

// ==========================================
// ロビーUI同期
// ==========================================
function updateLobbyUIFromPlayers(players) {
  lobbyPlayerList.innerHTML = '';
  playerCountEl.textContent = players.length;

  let allReady = true;
  let readyCount = 0;

  players.forEach((p) => {
    if (p.isReady) readyCount++;
    else allReady = false;

    const item = document.createElement('div');
    item.className = 'player-item';

    const isMe = (p.id === myPeerId) || (currentRole === 'host' && p.isHost);
    item.innerHTML = `
      <div class="player-name-wrap">
        ${p.isHost ? '<span class="host-tag">HOST</span>' : ''}
        <strong>${p.name} ${isMe ? '(あなた)' : ''}</strong>
      </div>
      <div>
        ${p.isReady
          ? '<span class="ready-badge is-ready">✅ Ready!</span>'
          : '<span class="ready-badge waiting">⌛ 入力中...</span>'}
      </div>
    `;
    lobbyPlayerList.appendChild(item);
  });

  lobbyReadySummary.textContent = `${readyCount} / ${players.length} 人 Ready`;

  if (currentRole === 'host') {
    btnStartGame.disabled = !allReady;
    if (allReady) {
      hostStartHint.textContent = '🎉 全員Readyになりました！ゲームを開始できます。';
      hostStartHint.style.color = 'var(--success)';
    } else {
      hostStartHint.textContent = '全員がお題を入力してReadyになると開始できます。';
      hostStartHint.style.color = 'var(--text-secondary)';
    }
  }
}

// 左右差ルール状態
let currentRoundHasOrder = false;

function setRuleToggleActive(hasOrder) {
  currentRoundHasOrder = hasOrder;
  if (hasOrder) {
    btnRuleHasOrder.classList.add('active');
    btnRuleNoOrder.classList.remove('active');
  } else {
    btnRuleNoOrder.classList.add('active');
    btnRuleHasOrder.classList.remove('active');
  }
}

function updateGuesserRuleDisplay(hasOrder) {
  currentRoundHasOrder = hasOrder;
  if (hasOrder) {
    guesserOrderRuleBadge.className = 'order-rule-badge badge-has-order';
    guesserOrderRuleBadge.textContent = '⚖️ ルール: 左右差あり (左側ほど上位！)';
  } else {
    guesserOrderRuleBadge.className = 'order-rule-badge badge-no-order';
    guesserOrderRuleBadge.textContent = '⚖️ ルール: 左右差なし (同ランク内は順不同)';
  }
}

function notifyTierRuleChange(hasOrder) {
  setRuleToggleActive(hasOrder);
  showToast(hasOrder ? '左右差ルールを「あり (左ほど上位)」に設定しました' : '左右差ルールを「なし (順不同)」に設定しました', 'info');
  if (currentRole === 'host') {
    hostManager.broadcastTierRule(hasOrder);
  } else if (guestManager) {
    guestManager.sendTierRule(hasOrder);
  }
}

btnRuleNoOrder.addEventListener('click', () => {
  notifyTierRuleChange(false);
});

btnRuleHasOrder.addEventListener('click', () => {
  notifyTierRuleChange(true);
});

/**
 * 配列のランダムシャッフル (Fisher-Yates)
 */
function shuffleArray(arr) {
  const array = [...arr];
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// ==========================================
// ゲームセッション & ラウンド構築 (ホスト専用)
// ==========================================
function startSession() {
  const players = hostManager.getAllPlayersList();
  // 有効なお題（スキップされていないもの）
  const validThemes = hostManager.collectAllSubmittedThemes().filter(t => !t.isSkipped && t.theme && t.items && t.items.length >= MIN_ITEMS);

  // 1. 主役（回答順）をランダムにシャッフル
  const shuffledPlayers = shuffleArray(players);

  // 2. お題プールをランダムにシャッフル
  const shuffledThemes = shuffleArray(validThemes);

  // 不足分を補うためのプリセットお題プール（ランダム）
  const shuffledExamples = shuffleArray(THEME_EXAMPLES).map(ex => ({
    creatorId: 'preset',
    creatorName: '運営',
    theme: ex.theme,
    items: ex.items
  }));

  // 各ラウンドにお題を割り当て（提出お題を優先・不足分はプリセットで穴埋め）
  const assignedThemes = [];
  let themeIdx = 0;
  let exampleIdx = 0;

  for (let i = 0; i < shuffledPlayers.length; i++) {
    if (themeIdx < shuffledThemes.length) {
      assignedThemes.push(shuffledThemes[themeIdx]);
      themeIdx++;
    } else {
      assignedThemes.push(shuffledExamples[exampleIdx % shuffledExamples.length]);
      exampleIdx++;
    }
  }

  // お題の割り当て順もさらにシャッフル
  const finalThemes = shuffleArray(assignedThemes);

  // 各ラウンドの構築
  sessionRounds = [];
  shuffledPlayers.forEach((player, idx) => {
    const chosenTheme = finalThemes[idx];

    sessionRounds.push({
      round: idx + 1,
      totalRounds: shuffledPlayers.length,
      hostPlayerId: player.id,
      hostPlayerName: player.name,
      themeCreatorId: chosenTheme.creatorId,
      themeCreatorName: chosenTheme.creatorName || '運営',
      theme: chosenTheme.theme,
      items: chosenTheme.items
    });
  });

  // 累計スコアの初期化
  cumulativeScoresMap.clear();
  players.forEach(p => {
    cumulativeScoresMap.set(p.id, { name: p.name, totalScore: 0 });
  });

  currentRoundIndex = 0;
  launchRound(currentRoundIndex);
}

function launchRound(index) {
  const roundInfo = sessionRounds[index];
  currentRoundData = roundInfo;
  currentRoundSubmittedTiers.clear();
  mySubmittedTier = null;

  // 全ゲストへ送信
  hostManager.startRound(roundInfo);

  // ホスト自身の画面も開始
  setupAndShowPlayingScreen(roundInfo);
}

/**
 * プレイ画面の提出状況UI更新
 */
function updateSubmissionStatusUI(statusList) {
  if (!statusList || !submissionPlayersList) return;

  submissionPlayersList.innerHTML = '';
  let submittedCount = 0;

  statusList.forEach((p) => {
    if (p.submitted) submittedCount++;

    const chip = document.createElement('div');
    chip.className = `submission-player-chip ${p.submitted ? 'is-submitted' : 'is-thinking'} ${p.isRoundHost ? 'is-round-host' : ''}`;

    const isMe = (p.id === myPeerId) || (currentRole === 'host' && hostManager && p.id === hostManager.myPeerId);
    const hostTag = p.isRoundHost ? '👑 ' : '';
    const nameText = `${hostTag}${p.name}${isMe ? ' (あなた)' : ''}`;

    chip.innerHTML = `
      <span class="status-icon">${p.submitted ? '✅' : '⏳'}</span>
      <span>${nameText}</span>
      <span style="font-size:0.75rem; opacity:0.8;">${p.submitted ? '(提出済)' : '(考え中)'}</span>
    `;
    submissionPlayersList.appendChild(chip);
  });

  if (submissionCountBadge) {
    submissionCountBadge.textContent = `${submittedCount} / ${statusList.length} 人 提出完了`;
    if (submittedCount === statusList.length && statusList.length > 0) {
      submissionCountBadge.classList.add('all-submitted');
    } else {
      submissionCountBadge.classList.remove('all-submitted');
    }
  }
}

// ==========================================
// プレイ画面制御
// ==========================================
async function setupAndShowPlayingScreen(roundInfo) {
  currentRoundData = roundInfo;
  mySubmittedTier = null;
  currentRoundHasOrder = false; // デフォルトは左右差なし

  // ラウンドバナー更新
  playingRoundBadge.textContent = `ROUND ${roundInfo.round} / ${roundInfo.totalRounds}`;
  playingThemeTitle.textContent = roundInfo.theme;
  if (playingThemeCreator) {
    const creatorName = roundInfo.themeCreatorName || '運営';
    const isMe = (roundInfo.themeCreatorId === myPeerId) || 
      (currentRole === 'host' && hostManager && roundInfo.themeCreatorId === hostManager.myPeerId);
    playingThemeCreator.textContent = `💡 出題者: ${creatorName}${isMe ? ' (あなた)' : ''}`;
  }
  poolCountBadge.textContent = `残り ${roundInfo.items.length} 個`;

  const isCurrentRoundHost = (roundInfo.hostPlayerId === myPeerId) || 
    (currentRole === 'host' && roundInfo.hostPlayerId === hostManager.myPeerId);

  if (isCurrentRoundHost) {
    screens.playing.classList.add('is-round-host');
    playingHostBadge.textContent = '👑 あなたが主役';
    playingRoleBanner.className = 'role-action-banner role-host';
    playingRoleMainText.textContent = '👑 あなたが主役です！あなたのティア表を作ってください！';
    playingRoleSubText.textContent = 'あなたが決める格付けが正解になります。本気・直感で配置しましょう！';
    btnSubmitTier.textContent = '👑 正解Tierを決定して送信';

    // 主役用左右差ルール選択UIを表示
    hostOrderRuleControl.style.display = 'flex';
    guesserOrderRuleDisplay.style.display = 'none';
    setRuleToggleActive(false);
  } else {
    screens.playing.classList.remove('is-round-host');
    playingHostBadge.textContent = `👑 主役: ${roundInfo.hostPlayerName}`;
    playingRoleBanner.className = 'role-action-banner role-guesser';
    const safeName = (roundInfo.hostPlayerName || '主役').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    playingRoleMainText.innerHTML = `あなたは<span class="highlight-role">推理役</span>です。<span class="highlight-name">${safeName}</span>の考えるティア表を当てましょう。`;
    playingRoleSubText.textContent = `${safeName} さんの好みを推理して、同じランクに配置しましょう！`;
    btnSubmitTier.textContent = '🎯 予想Tierを決定して送信';

    // 推理役用左右差ルール通知バッジを表示
    hostOrderRuleControl.style.display = 'none';
    guesserOrderRuleDisplay.style.display = 'block';
    updateGuesserRuleDisplay(false);
  }

  // UIリセット
  btnSubmitTier.disabled = true;
  btnSubmitTier.style.display = 'inline-flex';
  btnEditAgainTier.style.display = 'none';
  submitStatusMsg.classList.remove('visible');
  submitGuideHint.style.display = 'block';

  // ホストなら提出ステータスを初期化ブロードキャスト
  if (currentRole === 'host' && hostManager) {
    const initialList = hostManager.broadcastSubmissionStatus(roundInfo.hostPlayerId, false);
    updateSubmissionStatusUI(initialList);
  }

  // TierBoard初期化
  if (!tierBoard) {
    tierBoard = new TierBoard({
      poolContainer: itemPoolEl,
      tierContainers: tierSlotElements,
      onChange: (isAllPlaced) => {
        const remaining = itemPoolEl.querySelectorAll('.tier-item-chip').length;
        poolCountBadge.textContent = `残り ${remaining} 個`;
        btnSubmitTier.disabled = !isAllPlaced;
        submitGuideHint.textContent = isAllPlaced
          ? 'すべてのアイテムを配置しました！送信できます。'
          : 'すべてのアイテムをいずれかのTierに配置すると送信できます。';
        submitGuideHint.style.color = isAllPlaced ? 'var(--success)' : 'var(--text-secondary)';
      }
    });
  }

  await tierBoard.init(roundInfo.items);
  switchState('playing');
}

// Tier提出ボタン
btnSubmitTier.addEventListener('click', () => {
  if (!tierBoard || !tierBoard.isAllPlaced()) {
    showToast('すべてのアイテムを配置してください', 'error');
    return;
  }

  const finalTier = tierBoard.getTierState();
  tierBoard.setLocked(true);
  btnSubmitTier.style.display = 'none';
  submitGuideHint.style.display = 'none';
  submitStatusMsg.classList.add('visible');
  btnEditAgainTier.style.display = 'block';
  mySubmittedTier = finalTier;

  if (currentRole === 'host') {
    currentRoundSubmittedTiers.set(hostManager.myPeerId, {
      name: hostManager.myPlayerName,
      tier: finalTier,
      hasOrder: currentRoundHasOrder
    });
    showToast('Tier配置を確定しました！', 'success');
    const list = hostManager.broadcastSubmissionStatus(currentRoundData.hostPlayerId, true);
    updateSubmissionStatusUI(list);
    checkRoundSubmissionsAndReveal();
  } else {
    guestManager.submitTier(finalTier, currentRoundHasOrder);
    showToast('Tier配置を提出しました！他のプレイヤーを待っています...', 'success');
  }
});

// 再編集ボタン (提出取り消し・ロック解除)
btnEditAgainTier.addEventListener('click', () => {
  if (!tierBoard) return;

  tierBoard.setLocked(false);
  btnSubmitTier.disabled = false;
  btnSubmitTier.style.display = 'inline-flex';
  btnEditAgainTier.style.display = 'none';
  submitStatusMsg.classList.remove('visible');
  submitGuideHint.style.display = 'block';
  submitGuideHint.textContent = '配置を再編集できます。完了したらもう一度送信してください。';
  submitGuideHint.style.color = 'var(--text-secondary)';

  mySubmittedTier = null;

  if (currentRole === 'host') {
    currentRoundSubmittedTiers.delete(hostManager.myPeerId);
    const list = hostManager.broadcastSubmissionStatus(currentRoundData.hostPlayerId, false);
    updateSubmissionStatusUI(list);
    showToast('提出を解除しました。配置を再編集できます。', 'info');
  } else if (guestManager) {
    guestManager.cancelSubmission();
    showToast('提出を解除しました。配置を再編集できます。', 'info');
  }
});

// ==========================================
// ホスト集約 & 採点判定 (フォールトトレランス)
// ==========================================
function checkRoundSubmissionsAndReveal() {
  if (currentRole !== 'host' || !currentRoundData) return;

  const roundHostId = currentRoundData.hostPlayerId;
  const hostSubmitted = mySubmittedTier !== null;

  if (!hostManager.areAllSubmissionsReceived(roundHostId, hostSubmitted)) {
    console.log('[Host] まだ未提出のプレイヤーがいます (hostSubmitted=' + hostSubmitted + ')');
    return;
  }

  console.log('[Host] 全員の提出完了！採点開始');

  try {
    // 主役が決定した左右差ルールを最優先で確定
    let roundHasOrder = Boolean(currentRoundHasOrder);
    if (roundHostId === hostManager.myPeerId) {
      roundHasOrder = Boolean(currentRoundHasOrder);
    } else {
      const hostPlayer = hostManager.players.get(roundHostId);
      if (hostPlayer && typeof hostPlayer.hasOrder === 'boolean') {
        roundHasOrder = hostPlayer.hasOrder;
      }
    }
    currentRoundHasOrder = roundHasOrder;

    // 集約データから主役の正解Tierを特定
    let roundHostTier = null;
    if (roundHostId === hostManager.myPeerId) {
      roundHostTier = mySubmittedTier;
    } else {
      const p = hostManager.players.get(roundHostId);
      if (p && p.tier) roundHostTier = p.tier;
    }

    if (!roundHostTier) {
      console.warn('[Host] 主役のTierが見つかりません。デフォルト生成');
      roundHostTier = { S: [], A: [], B: [], C: [], D: [] };
    }

    // 採点計算（主役以外の予想者全員を採点）
    const roundScores = [];
    const allTiers = [];

    // ホストのTierを追加
    allTiers.push({
      peerId: hostManager.myPeerId,
      playerName: hostManager.myPlayerName,
      isRoundHost: hostManager.myPeerId === roundHostId,
      tier: mySubmittedTier || { S: [], A: [], B: [], C: [], D: [] }
    });

    if (hostManager.myPeerId !== roundHostId && mySubmittedTier) {
      const sc = calculatePlayerScore(
        hostManager.myPeerId,
        hostManager.myPlayerName,
        mySubmittedTier,
        roundHostTier,
        currentRoundData.items || [],
        { hasOrder: roundHasOrder }
      );
      roundScores.push(sc);
      // 累計加算
      const cum = cumulativeScoresMap.get(hostManager.myPeerId) || { name: hostManager.myPlayerName, totalScore: 0 };
      cum.totalScore += sc.score;
      cumulativeScoresMap.set(hostManager.myPeerId, cum);
    }

    // ゲストたちのTierを集約＆採点
    for (const [peerId, p] of hostManager.players.entries()) {
      if (p.conn && !p.conn.open) continue; // 切断されたゲストは除外

      const pTier = p.tier || { S: [], A: [], B: [], C: [], D: [] };
      allTiers.push({
        peerId,
        playerName: p.name,
        isRoundHost: peerId === roundHostId,
        tier: pTier
      });

      if (peerId !== roundHostId) {
        const sc = calculatePlayerScore(
          peerId,
          p.name,
          pTier,
          roundHostTier,
          currentRoundData.items || [],
          { hasOrder: roundHasOrder }
        );
        roundScores.push(sc);
        const cum = cumulativeScoresMap.get(peerId) || { name: p.name, totalScore: 0 };
        cum.totalScore += sc.score;
        cumulativeScoresMap.set(peerId, cum);
      }
    }

    // 主役のTierが万一allTiersに含まれていなければ追加
    const hasHostInAllTiers = allTiers.some(t => t.isRoundHost);
    if (!hasHostInAllTiers) {
      allTiers.unshift({
        peerId: roundHostId,
        playerName: currentRoundData.hostPlayerName || '主役',
        isRoundHost: true,
        tier: roundHostTier
      });
    }

    // 今回のスコアを降順ソート
    roundScores.sort((a, b) => b.score - a.score);

    // 主役への点数付与 (全推理役の平均スコア)
    let avgScore = 0;
    if (roundScores.length > 0) {
      const sum = roundScores.reduce((acc, sc) => acc + (sc.score || 0), 0);
      avgScore = Math.round(sum / roundScores.length);
    }

    const hostBonus = {
      peerId: roundHostId,
      playerName: currentRoundData.hostPlayerName || '主役',
      points: avgScore
    };

    // 累計スコアに主役の平均点を加算
    if (cumulativeScoresMap.has(roundHostId)) {
      const cum = cumulativeScoresMap.get(roundHostId);
      cum.totalScore += avgScore;
      cumulativeScoresMap.set(roundHostId, cum);
    }

    // 累計スコア配列化
    const cumulativeScoresList = Array.from(cumulativeScoresMap.entries()).map(([peerId, data]) => ({
      peerId,
      playerName: data.name,
      totalScore: data.totalScore
    })).sort((a, b) => b.totalScore - a.totalScore);

    const isSessionEnd = currentRoundIndex >= sessionRounds.length - 1;

    const resultPayload = {
      round: currentRoundData.round,
      totalRounds: currentRoundData.totalRounds,
      roundHostId,
      roundHostName: currentRoundData.hostPlayerName,
      roundHostTier,
      themeCreatorId: currentRoundData.themeCreatorId,
      themeCreatorName: currentRoundData.themeCreatorName,
      hostBonus,
      scores: roundScores,
      cumulativeScores: cumulativeScoresList,
      allTiers,
      hasOrder: roundHasOrder,
      isSessionEnd
    };

    console.log('[Host] 採点計算完了、結果発表パケットをブロードキャスト', resultPayload);

    // 全ゲストへブロードキャスト
    hostManager.revealRoundResult(resultPayload);

    // ホスト自身も結果表示
    showResultScreen(resultPayload);
  } catch (err) {
    console.error('[Host] 採点・発表処理中に例外発生:', err);
    showToast(`採点処理エラー: ${err.message || err}`, 'error');
  }
}

// ==========================================
// 結果発表画面
// ==========================================
function showResultScreen(payload) {
  try {
    if (!payload) return;
    if (btnEditAgainTier) btnEditAgainTier.style.display = 'none';
    const isHasOrder = Boolean(payload.hasOrder);
    currentRoundHasOrder = isHasOrder;

    const round = payload.round || 1;
    const totalRounds = payload.totalRounds || 1;
    const roundHostName = payload.roundHostName || '主役';
    const roundHostTier = (payload.roundHostTier && typeof payload.roundHostTier === 'object')
      ? payload.roundHostTier
      : { S: [], A: [], B: [], C: [], D: [] };
    const scores = Array.isArray(payload.scores) ? payload.scores : [];
    const cumulativeScores = Array.isArray(payload.cumulativeScores) ? payload.cumulativeScores : [];
    const allTiers = Array.isArray(payload.allTiers) ? payload.allTiers : [];
    const isSessionEnd = Boolean(payload.isSessionEnd);

    resultRoundTitle.textContent = isSessionEnd
      ? `🏆 全ラウンド終了！最終結果発表！`
      : `🎉 Round ${round} / ${totalRounds} 結果発表！`;
    const ruleText = isHasOrder ? '左右差あり (左ほど上位)' : '左右差なし (順不同)';
    resultRoundSubtitle.innerHTML = `主役（<strong>${roundHostName}</strong>さん）のTierとの一致度 <span class="badge" style="background: rgba(255,255,255,0.1); margin-left: 6px;">${ruleText}</span>`;

    // 主役ボーナスカードの表示
    if (hostBonusContainer) {
      if (payload.hostBonus && typeof payload.hostBonus.points === 'number') {
        hostBonusContainer.style.display = 'flex';
        hostBonusContainer.innerHTML = `
          <div class="host-bonus-left">
            <div class="host-bonus-icon">👑</div>
            <div>
              <div class="host-bonus-label">主役ポイント獲得！</div>
              <div class="host-bonus-name">${payload.hostBonus.playerName} さん</div>
              <div class="host-bonus-reason">みんなの推理平均点（+${payload.hostBonus.points}点）を獲得しました！</div>
            </div>
          </div>
          <div class="host-bonus-points">+${payload.hostBonus.points} 点</div>
        `;
      } else {
        hostBonusContainer.style.display = 'none';
        hostBonusContainer.innerHTML = '';
      }
    }

    // 1. 今回のラウンドスコアランキング
    roundScoresContainer.innerHTML = '';
    if (scores.length === 0) {
      roundScoresContainer.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:12px;">予想参加者はいませんでした。</div>';
    } else {
      scores.forEach((sc, idx) => {
        const card = document.createElement('div');
        card.className = 'score-ranking-item';
        const rankBadgeClass = idx === 0 ? 'rank-1' : idx === 1 ? 'rank-2' : idx === 2 ? 'rank-3' : '';
        const maxScore = sc.maxScore || 1;
        const percent = Math.round(((sc.score || 0) / maxScore) * 100);

        const detailsList = Array.isArray(sc.details) ? sc.details : [];
        const detailsHtml = detailsList.map(d => {
          let ptsClass = 'match-miss';
          let mark = '✕ 0点';
          if (d.points === 20) {
            ptsClass = 'match-exact';
            mark = '⭕ 完全一致 (+20)';
          } else if (d.points === 10) {
            ptsClass = 'match-near';
            mark = '△ 順序ズレ (+10)';
          } else if (d.points === 5) {
            ptsClass = 'match-near';
            mark = '△ 1ズレ (+5)';
          }
          return `
            <div class="score-detail-chip">
              <span><strong>${d.item}</strong> (${d.guestRank})</span>
              <span class="score-detail-pts ${ptsClass}">${mark}</span>
            </div>
          `;
        }).join('');

        card.innerHTML = `
          <div class="score-ranking-header">
            <div class="score-rank-badge ${rankBadgeClass}">${idx + 1}</div>
            <div class="score-player-name">${sc.playerName}</div>
            <div class="score-points">${sc.score || 0} / ${maxScore}点 <span style="font-size:0.8rem; color:var(--text-secondary);">(${percent}%)</span></div>
          </div>
          <div class="score-details-list">
            ${detailsHtml}
          </div>
        `;
        roundScoresContainer.appendChild(card);
      });
    }

    // 2. ★みんなのTier表見比べエリア
    comparisonTiersContainer.innerHTML = '';
    const hostItemMap = buildItemToRankMap(roundHostTier);
    const grid = createComparisonGrid(allTiers, hostItemMap, { hasOrder: isHasOrder, hostTier: roundHostTier });
    comparisonTiersContainer.appendChild(grid);

    // 3. 総合ランキング表
    cumulativeScoresBody.innerHTML = '';
    cumulativeScores.forEach((cs, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${idx + 1}位</strong></td>
        <td>${cs.playerName} ${idx === 0 ? '👑' : ''}</td>
        <td style="text-align: right; font-weight: 800;">${cs.totalScore || 0} 点</td>
      `;
      cumulativeScoresBody.appendChild(tr);
    });

    // 進行コントロール
    if (currentRole === 'host') {
      resultHostControls.style.display = 'block';
      resultGuestWaiting.style.display = 'none';

      if (isSessionEnd) {
        btnNextAction.textContent = '🔄 セッション終了 (ロビーへ戻る)';
        btnNextAction.className = 'btn btn-primary btn-block btn-lg';
      } else {
        btnNextAction.textContent = `次のラウンドへ進む (Round ${round + 1} / ${totalRounds}) ➔`;
        btnNextAction.className = 'btn btn-success btn-block btn-lg';
      }
    } else {
      resultHostControls.style.display = 'none';
      resultGuestWaiting.style.display = 'block';
    }

    switchState('result');
  } catch (err) {
    console.error('[Result] 結果画面描画中に例外発生:', err);
    switchState('result'); // 例外があっても結果画面へ遷移
  }
}

// 次のラウンドまたはロビーへ (ホスト操作)
btnNextAction.addEventListener('click', () => {
  if (currentRole !== 'host') return;

  const isSessionEnd = currentRoundIndex >= sessionRounds.length - 1;
  if (isSessionEnd) {
    // ロビーへ戻る
    hostManager.backToLobby();
    isReady = false;
    btnToggleReady.classList.remove('is-ready');
    btnToggleReady.textContent = '✅ このお題でReady！';
    inputMyTheme.disabled = false;
    itemInputsList.querySelectorAll('input').forEach(i => i.disabled = false);
    itemInputsList.querySelectorAll('button').forEach(b => b.disabled = false);
    updateAddButtonState();
    updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
    switchState('lobby');
  } else {
    // 次のラウンドへ
    currentRoundIndex++;
    launchRound(currentRoundIndex);
  }
});

// ==========================================
// 接続 & 初期化イベントリスナー
// ==========================================

// タブ切り替え
tabBtnGuest.addEventListener('click', () => {
  tabBtnGuest.classList.add('active');
  tabBtnHost.classList.remove('active');
  panelGuestConnect.style.display = 'block';
  panelHostCreate.style.display = 'none';
});

tabBtnHost.addEventListener('click', () => {
  tabBtnHost.classList.add('active');
  tabBtnGuest.classList.remove('active');
  panelHostCreate.style.display = 'block';
  panelGuestConnect.style.display = 'none';
});

// ホスト作成
btnCreateRoom.addEventListener('click', async () => {
  const name = inputHostName.value.trim() || 'ホスト';
  myName = name;
  currentRole = 'host';

  btnCreateRoom.disabled = true;
  btnCreateRoom.textContent = '⏳ ルーム開設中...';

  try {
    hostManager = new HostPeerManager({
      onReady: (peerId) => {
        myPeerId = peerId;
        const inviteUrl = hostManager.getInviteUrl();
        inviteLinkText.textContent = inviteUrl;
        hostRoomInfo.style.display = 'block';
        btnCreateRoom.style.display = 'none';
        updateConnectionBadge('connected', `ホスト: ${peerId.slice(0, 6)}...`);
        showToast('ルームが開設されました！', 'success');
      },
      onPlayerJoin: (peerId, playerName) => {
        showToast(`🎮 ${playerName} さんが参加しました`, 'info');
        updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
      },
      onPlayerLeave: (peerId, playerName) => {
        showToast(`🚪 ${playerName} さんが退出しました`, 'info');
        updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
        checkRoundSubmissionsAndReveal();
      },
      onPlayerReadyChange: () => {
        updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
      },
      onTierRuleUpdate: (hasOrder) => {
        updateGuesserRuleDisplay(hasOrder);
        showToast(hasOrder ? '⚠️ 主役が左右差ルールを「あり (左ほど上位)」に変更しました！' : '主役が左右差ルールを「なし (順不同)」に変更しました', 'info');
      },
      onTierSubmit: (peerId, playerName) => {
        showToast(`📝 ${playerName} さんが回答を提出しました`, 'info');
        const hostSubmitted = mySubmittedTier !== null;
        const list = hostManager.broadcastSubmissionStatus(currentRoundData ? currentRoundData.hostPlayerId : null, hostSubmitted);
        updateSubmissionStatusUI(list);
        checkRoundSubmissionsAndReveal();
      },
      onPlayerUnsubmit: (peerId, playerName) => {
        showToast(`↩ ${playerName} さんが再編集を開始しました`, 'info');
        const hostSubmitted = mySubmittedTier !== null;
        const list = hostManager.broadcastSubmissionStatus(currentRoundData ? currentRoundData.hostPlayerId : null, hostSubmitted);
        updateSubmissionStatusUI(list);
      },
      onError: (err) => {
        showToast(`通信エラー: ${err.message || err}`, 'error');
      }
    });

    await hostManager.start(name);
  } catch (err) {
    console.error(err);
    showToast('PeerJSの起動に失敗しました。', 'error');
    btnCreateRoom.disabled = false;
    btnCreateRoom.textContent = '👑 ルームを開設する';
  }
});

btnCopyInvite.addEventListener('click', async () => {
  const url = inviteLinkText.textContent;
  if (!url || url.includes('生成中')) return;

  try {
    await navigator.clipboard.writeText(url);
    btnCopyInvite.textContent = '✅ コピー済';
    showToast('招待リンクをコピーしました！', 'success');
    setTimeout(() => { btnCopyInvite.textContent = '📋 コピー'; }, 2000);
  } catch (err) {
    const tempInput = document.createElement('input');
    tempInput.value = url;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast('招待リンクをコピーしました', 'success');
  }
});

btnHostEnterLobby.addEventListener('click', () => {
  hostGameControls.style.display = 'block';
  guestWaitingPanel.style.display = 'none';
  setupExampleForm();
  updateLobbyUIFromPlayers(hostManager.getAllPlayersList());
  switchState('lobby');
});

// ゲスト参加
btnJoinRoom.addEventListener('click', async () => {
  const name = inputPlayerName.value.trim();
  const hostId = inputHostId.value.trim();

  if (!name) {
    showToast('あなたの名前を入力してください', 'error');
    inputPlayerName.focus();
    return;
  }
  if (!hostId) {
    showToast('ホストのルームIDを入力してください', 'error');
    inputHostId.focus();
    return;
  }

  myName = name;
  currentRole = 'guest';

  btnJoinRoom.disabled = true;
  btnJoinRoom.textContent = '⏳ 接続中...';

  try {
    guestManager = new GuestPeerManager({
      onConnected: (peerId) => {
        myPeerId = peerId;
        updateConnectionBadge('connected', `接続中: ${name}`);
        showToast('ホストに接続しました！', 'success');
        hostGameControls.style.display = 'none';
        guestWaitingPanel.style.display = 'block';
        setupExampleForm();
        switchState('lobby');
      },
      onLobbyStateUpdate: (players) => {
        updateLobbyUIFromPlayers(players);
      },
      onRoundStart: (roundInfo) => {
        showToast(`🎮 Round ${roundInfo.round} が開始されました！`, 'success');
        setupAndShowPlayingScreen(roundInfo);
      },
      onTierRuleUpdate: (hasOrder) => {
        updateGuesserRuleDisplay(hasOrder);
        showToast(hasOrder ? '⚠️ 主役が左右差ルールを「あり (左ほど上位)」に変更しました！' : '主役が左右差ルールを「なし (順不同)」に変更しました', 'info');
      },
      onSubmissionStatusUpdate: (statusList) => {
        updateSubmissionStatusUI(statusList);
      },
      onRoundResultReveal: (payload) => {
        showToast('🎉 結果が発表されました！', 'success');
        showResultScreen(payload);
      },
      onBackToLobby: () => {
        showToast('ロビーへ戻りました', 'info');
        isReady = false;
        btnToggleReady.classList.remove('is-ready');
        btnToggleReady.textContent = '✅ このお題でReady！';
        inputMyTheme.disabled = false;
        itemInputsList.querySelectorAll('input').forEach(i => i.disabled = false);
        itemInputsList.querySelectorAll('button').forEach(b => b.disabled = false);
        updateAddButtonState();
        switchState('lobby');
      },
      onHostDisconnected: () => {
        alert('ホストが退出したため、接続が切断されました。');
        window.location.reload();
      },
      onError: (err) => {
        showToast(`通信エラー: ${err.message || err}`, 'error');
        btnJoinRoom.disabled = false;
        btnJoinRoom.textContent = '🎮 ルームに参加する';
      }
    });

    await guestManager.connect(hostId, name);
  } catch (err) {
    console.error(err);
    showToast('ホストへの接続に失敗しました。', 'error');
    btnJoinRoom.disabled = false;
    btnJoinRoom.textContent = '🎮 ルームに参加する';
  }
});

// ホスト: ゲームスタート
btnStartGame.addEventListener('click', () => {
  if (currentRole !== 'host' || !hostManager) return;
  startSession();
});

// 初期化
function main() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('room');
  if (roomId) {
    inputHostId.value = roomId;
    tabBtnGuest.click();
    inputPlayerName.focus();
    showToast('招待URLが検出されました。名前を入力して参加してください！', 'info');
  }
}

main();
