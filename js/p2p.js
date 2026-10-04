/**
 * P2P 通信管理 (PeerJS v1.5.x)
 */

export const PACKET_TYPES = {
  GUEST_JOIN: 'GUEST_JOIN',
  LOBBY_STATE: 'LOBBY_STATE',
  PLAYER_READY: 'PLAYER_READY',
  START_ROUND: 'START_ROUND',
  UPDATE_TIER_RULE: 'UPDATE_TIER_RULE',
  SUBMIT_TIER: 'SUBMIT_TIER',
  CANCEL_SUBMISSION: 'CANCEL_SUBMISSION',
  SUBMISSION_STATUS: 'SUBMISSION_STATUS',
  REVEAL_ROUND_RESULT: 'REVEAL_ROUND_RESULT',
  BACK_TO_LOBBY: 'BACK_TO_LOBBY',
  KICK_PLAYER: 'KICK_PLAYER',
  SKIP_ROUND: 'SKIP_ROUND'
};

export async function ensurePeerJS() {
  if (window.Peer) return window.Peer;

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
    script.onload = () => resolve(window.Peer);
    script.onerror = () => reject(new Error('PeerJSの読み込みに失敗しました'));
    document.head.appendChild(script);
  });
}

/**
 * ホスト側P2Pマネージャー
 */
export class HostPeerManager {
  constructor({
    onReady,
    onPlayerJoin,
    onPlayerLeave,
    onPlayerReadyChange,
    onTierRuleUpdate,
    onTierSubmit,
    onPlayerUnsubmit,
    onError
  }) {
    this.onReady = onReady;
    this.onPlayerJoin = onPlayerJoin;
    this.onPlayerLeave = onPlayerLeave;
    this.onPlayerReadyChange = onPlayerReadyChange;
    this.onTierRuleUpdate = onTierRuleUpdate;
    this.onTierSubmit = onTierSubmit;
    this.onPlayerUnsubmit = onPlayerUnsubmit;
    this.onError = onError;

    this.peer = null;
    this.myPeerId = null;
    this.myPlayerName = 'ホスト';
    this.myReady = false;
    this.myThemeData = null; // { theme: string, items: string[] }
    this.myCumulativeScore = 0;

    // Map<peerId, { name: string, conn: any, isReady: boolean, themeData: any, submitted: boolean, tier: any, cumulativeScore: number } >
    this.players = new Map();
  }

  async start(hostPlayerName) {
    this.myPlayerName = hostPlayerName;
    await ensurePeerJS();

    this.peer = new window.Peer();

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      console.log('[Host] Peer ready. ID:', id);
      if (this.onReady) this.onReady(id);
    });

    this.peer.on('connection', (conn) => {
      this.handleIncomingConnection(conn);
    });

    this.peer.on('error', (err) => {
      console.error('[Host] Peer error:', err);
      if (this.onError) this.onError(err);
    });
  }

  handleIncomingConnection(conn) {
    const peerId = conn.peer;

    conn.on('open', () => {
      console.log('[Host] ゲスト接続確立:', peerId);
    });

    conn.on('data', (data) => {
      try {
        const packet = typeof data === 'string' ? JSON.parse(data) : data;
        this.handlePacket(peerId, conn, packet);
      } catch (e) {
        console.error('[Host] パケットパースエラー:', e, data);
      }
    });

    const handleDisconnect = () => {
      console.log('[Host] ゲスト切断検知:', peerId);
      const player = this.players.get(peerId);
      this.players.delete(peerId);
      this.broadcastLobbyState();
      if (this.onPlayerLeave) {
        this.onPlayerLeave(peerId, player ? player.name : 'Unknown');
      }
    };

    conn.on('close', handleDisconnect);
    conn.on('error', (err) => {
      console.warn('[Host] 接続エラー検知:', peerId, err);
      handleDisconnect();
    });
  }

  handlePacket(peerId, conn, packet) {
    if (!packet || !packet.type) return;

    switch (packet.type) {
      case PACKET_TYPES.GUEST_JOIN: {
        const name = (packet.payload && packet.payload.name) ? packet.payload.name.trim() : 'ゲスト';
        this.players.set(peerId, {
          name,
          conn,
          isReady: false,
          themeData: null,
          submitted: false,
          tier: null,
          cumulativeScore: 0
        });
        console.log(`[Host] プレイヤー参加: ${name} (${peerId})`);
        this.broadcastLobbyState();
        if (this.onPlayerJoin) this.onPlayerJoin(peerId, name);
        break;
      }

      case PACKET_TYPES.PLAYER_READY: {
        const player = this.players.get(peerId);
        if (player) {
          player.isReady = Boolean(packet.payload.isReady);
          player.themeData = packet.payload.themeData || null;
          console.log(`[Host] Ready更新: ${player.name} -> ${player.isReady}`);
          this.broadcastLobbyState();
          if (this.onPlayerReadyChange) this.onPlayerReadyChange(peerId, player.isReady);
        }
        break;
      }

      case PACKET_TYPES.UPDATE_TIER_RULE: {
        const hasOrder = Boolean(packet.payload && packet.payload.hasOrder);
        console.log(`[Host] 左右差ルール更新受信: hasOrder=${hasOrder}`);
        // 他の全ゲストへ中継
        this.broadcast(PACKET_TYPES.UPDATE_TIER_RULE, { hasOrder });
        if (this.onTierRuleUpdate) this.onTierRuleUpdate(hasOrder);
        break;
      }

      case PACKET_TYPES.SUBMIT_TIER: {
        const player = this.players.get(peerId);
        if (player) {
          player.submitted = true;
          player.tier = packet.payload ? packet.payload.tier : null;
          if (packet.payload && typeof packet.payload.hasOrder === 'boolean') {
            player.hasOrder = packet.payload.hasOrder;
          }
          console.log(`[Host] Tier提出受信: ${player.name} (${peerId}), hasOrder=${player.hasOrder}`);
          if (this.onTierSubmit) this.onTierSubmit(peerId, player.name, player.tier, player.hasOrder);
        }
        break;
      }

      case PACKET_TYPES.CANCEL_SUBMISSION: {
        const player = this.players.get(peerId);
        if (player) {
          player.submitted = false;
          player.tier = null;
          console.log(`[Host] Tier提出取り消し受信: ${player.name} (${peerId})`);
          if (this.onPlayerUnsubmit) this.onPlayerUnsubmit(peerId, player.name);
        }
        break;
      }
    }
  }

  /**
   * 左右差ルールを全ゲストにブロードキャスト
   */
  broadcastTierRule(hasOrder) {
    this.broadcast(PACKET_TYPES.UPDATE_TIER_RULE, { hasOrder });
  }

  /**
   * 全プレイヤーの提出ステータスリストを取得
   */
  getSubmissionStatusList(roundHostId, hostSubmitted) {
    const list = [
      {
        id: this.myPeerId,
        name: this.myPlayerName,
        submitted: Boolean(hostSubmitted),
        isRoundHost: this.myPeerId === roundHostId,
        isHost: true,
        isDisconnected: false
      }
    ];
    for (const [peerId, p] of this.players.entries()) {
      const isDisconnected = Boolean(p.conn && !p.conn.open);
      list.push({
        id: peerId,
        name: p.name,
        submitted: Boolean(p.submitted),
        isRoundHost: peerId === roundHostId,
        isHost: false,
        isDisconnected
      });
    }
    return list;
  }

  /**
   * 全プレイヤーの提出ステータスを全ゲストにブロードキャスト
   */
  broadcastSubmissionStatus(roundHostId, hostSubmitted) {
    const list = this.getSubmissionStatusList(roundHostId, hostSubmitted);
    this.broadcast(PACKET_TYPES.SUBMISSION_STATUS, { statusList: list });
    return list;
  }

  /**
   * ホスト自身のReady状態を更新
   */
  setHostReady(isReady, themeData) {
    this.myReady = isReady;
    this.myThemeData = themeData;
    this.broadcastLobbyState();
  }

  /**
   * 現在の全プレイヤー（ホスト含む）の情報を取得
   */
  getAllPlayersList() {
    const list = [
      {
        id: this.myPeerId,
        name: this.myPlayerName,
        isReady: this.myReady,
        isHost: true
      }
    ];
    for (const [peerId, p] of this.players.entries()) {
      list.push({
        id: peerId,
        name: p.name,
        isReady: p.isReady,
        isHost: false
      });
    }
    return list;
  }

  /**
   * 全員がReady状態か判定
   */
  isEveryoneReady() {
    if (!this.myReady) return false;
    if (this.players.size === 0) {
      // 1人でも動作確認可能にする（テストや1人遊びにも対応）
      return true;
    }
    for (const p of this.players.values()) {
      if (!p.isReady) return false;
    }
    return true;
  }

  /**
   * 全員から集まったお題リストを取得
   */
  collectAllSubmittedThemes() {
    const themes = [];
    if (this.myThemeData && this.myThemeData.theme) {
      themes.push({
        creatorId: this.myPeerId,
        creatorName: this.myPlayerName,
        ...this.myThemeData
      });
    }
    for (const [peerId, p] of this.players.entries()) {
      if (p.themeData && p.themeData.theme) {
        themes.push({
          creatorId: peerId,
          creatorName: p.name,
          ...p.themeData
        });
      }
    }
    return themes;
  }

  /**
   * ロビーの参加者・Ready状況を全員に同期ブロードキャスト
   */
  broadcastLobbyState() {
    const list = this.getAllPlayersList();
    this.broadcast(PACKET_TYPES.LOBBY_STATE, { players: list });
  }

  broadcast(type, payload = null) {
    const packet = JSON.stringify({ type, payload });
    for (const [peerId, player] of this.players.entries()) {
      if (player.conn && player.conn.open) {
        try {
          player.conn.send(packet);
        } catch (e) {
          console.warn(`[Host] 送信失敗 (${peerId}):`, e);
        }
      }
    }
  }

  /**
   * ラウンド開始を全ゲストに通知
   */
  startRound(roundInfo) {
    // 提出状態をリセット
    for (const player of this.players.values()) {
      player.submitted = false;
      player.tier = null;
      player.hasOrder = false;
    }
    this.broadcast(PACKET_TYPES.START_ROUND, roundInfo);
  }

  /**
   * ラウンド結果発表を全ゲストに通知
   */
  revealRoundResult(resultPayload) {
    this.broadcast(PACKET_TYPES.REVEAL_ROUND_RESULT, resultPayload);
  }

  /**
   * ロビー復帰を全ゲストに通知
   */
  backToLobby() {
    this.myReady = false;
    this.myCumulativeScore = 0;
    for (const player of this.players.values()) {
      player.isReady = false;
      player.submitted = false;
      player.tier = null;
      player.cumulativeScore = 0;
    }
    this.broadcast(PACKET_TYPES.BACK_TO_LOBBY, null);
    this.broadcastLobbyState();
  }

  /**
   * ホストによる特定プレイヤーのキック
   */
  kickPlayer(peerId, reason = 'ホストによりキックされました') {
    const player = this.players.get(peerId);
    if (!player) return null;

    console.log(`[Host] プレイヤーをキック: ${player.name} (${peerId})`);
    if (player.conn && player.conn.open) {
      try {
        player.conn.send(JSON.stringify({
          type: PACKET_TYPES.KICK_PLAYER,
          payload: { reason }
        }));
      } catch (e) {
        console.warn(`[Host] キック通知送信失敗 (${peerId}):`, e);
      }
      setTimeout(() => {
        try {
          player.conn.close();
        } catch (e) {}
      }, 100);
    }

    const kickedName = player.name;
    this.players.delete(peerId);
    this.broadcastLobbyState();
    return { peerId, name: kickedName };
  }

  /**
   * ラウンドスキップを全ゲストに通知
   */
  skipRound(payload) {
    this.broadcast(PACKET_TYPES.SKIP_ROUND, payload);
  }

  /**
   * 今回のラウンドで提出すべき全プレイヤーが提出完了したか
   */
  areAllSubmissionsReceived(roundHostId, hostSubmitted) {
    // ホスト自身の提出チェック (もしホストが主役または予想者として未提出ならfalse)
    if (!hostSubmitted) return false;

    // 接続中の全ゲストの提出チェック (切断済み接続は除外)
    for (const [peerId, p] of this.players.entries()) {
      if (p.conn && !p.conn.open) {
        console.warn(`[Host] プレイヤー ${p.name} (${peerId}) は切断中のため提出チェック対象外`);
        continue;
      }
      if (!p.submitted) return false;
    }
    return true;
  }

  getInviteUrl() {
    if (!this.myPeerId) return '';
    return `${window.location.origin}${window.location.pathname}?room=${this.myPeerId}`;
  }

  destroy() {
    if (this.peer) this.peer.destroy();
  }
}

/**
 * ゲスト側P2Pマネージャー
 */
export class GuestPeerManager {
  constructor({
    onConnected,
    onLobbyStateUpdate,
    onRoundStart,
    onTierRuleUpdate,
    onSubmissionStatusUpdate,
    onRoundResultReveal,
    onBackToLobby,
    onHostDisconnected,
    onKicked,
    onSkipRound,
    onError
  }) {
    this.onConnected = onConnected;
    this.onLobbyStateUpdate = onLobbyStateUpdate;
    this.onRoundStart = onRoundStart;
    this.onTierRuleUpdate = onTierRuleUpdate;
    this.onSubmissionStatusUpdate = onSubmissionStatusUpdate;
    this.onRoundResultReveal = onRoundResultReveal;
    this.onBackToLobby = onBackToLobby;
    this.onHostDisconnected = onHostDisconnected;
    this.onKicked = onKicked;
    this.onSkipRound = onSkipRound;
    this.onError = onError;

    this.peer = null;
    this.conn = null;
    this.myPeerId = null;
    this.playerName = '';
    this.hostPeerId = '';
  }

  async connect(hostId, playerName) {
    await ensurePeerJS();
    this.hostPeerId = hostId.trim();
    this.playerName = playerName.trim() || 'ゲスト';

    this.peer = new window.Peer();

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      console.log('[Guest] Peer ready. ID:', id, 'Connecting to host:', this.hostPeerId);
      this.conn = this.peer.connect(this.hostPeerId, { reliable: true });

      this.conn.on('open', () => {
        console.log('[Guest] ホストへ接続成功');
        this.send(PACKET_TYPES.GUEST_JOIN, { name: this.playerName });
        if (this.onConnected) this.onConnected(id);
      });

      this.conn.on('data', (data) => {
        try {
          const packet = typeof data === 'string' ? JSON.parse(data) : data;
          this.handlePacket(packet);
        } catch (e) {
          console.error('[Guest] パケットパースエラー:', e, data);
        }
      });

      this.conn.on('close', () => {
        console.warn('[Guest] ホスト切断検知');
        if (this.onHostDisconnected) this.onHostDisconnected();
      });

      this.conn.on('error', (err) => {
        console.error('[Guest] 通信エラー:', err);
        if (this.onError) this.onError(err);
      });
    });

    this.peer.on('error', (err) => {
      console.error('[Guest] Peer error:', err);
      if (this.onError) this.onError(err);
    });
  }

  handlePacket(packet) {
    if (!packet || !packet.type) return;

    switch (packet.type) {
      case PACKET_TYPES.LOBBY_STATE:
        if (this.onLobbyStateUpdate) this.onLobbyStateUpdate(packet.payload.players);
        break;

      case PACKET_TYPES.START_ROUND:
        if (this.onRoundStart) this.onRoundStart(packet.payload);
        break;

      case PACKET_TYPES.UPDATE_TIER_RULE:
        if (this.onTierRuleUpdate) this.onTierRuleUpdate(Boolean(packet.payload && packet.payload.hasOrder));
        break;

      case PACKET_TYPES.SUBMISSION_STATUS:
        if (this.onSubmissionStatusUpdate) this.onSubmissionStatusUpdate(packet.payload.statusList);
        break;

      case PACKET_TYPES.REVEAL_ROUND_RESULT:
        if (this.onRoundResultReveal) this.onRoundResultReveal(packet.payload);
        break;

      case PACKET_TYPES.BACK_TO_LOBBY:
        if (this.onBackToLobby) this.onBackToLobby();
        break;

      case PACKET_TYPES.KICK_PLAYER:
        if (this.onKicked) this.onKicked(packet.payload);
        break;

      case PACKET_TYPES.SKIP_ROUND:
        if (this.onSkipRound) this.onSkipRound(packet.payload);
        break;
    }
  }

  send(type, payload = null) {
    if (this.conn && this.conn.open) {
      this.conn.send(JSON.stringify({ type, payload }));
    }
  }

  sendReady(isReady, themeData) {
    this.send(PACKET_TYPES.PLAYER_READY, { isReady, themeData });
  }

  sendTierRule(hasOrder) {
    this.send(PACKET_TYPES.UPDATE_TIER_RULE, { hasOrder });
  }

  submitTier(tierState, hasOrder = false) {
    if (!this.conn || !this.conn.open) {
      console.error('[Guest] 送信失敗: ホストとの接続が切断されています');
      if (this.onError) this.onError(new Error('ホストとの接続が切断されています。画面を再読み込みしてください。'));
      return false;
    }
    this.send(PACKET_TYPES.SUBMIT_TIER, { tier: tierState, hasOrder: Boolean(hasOrder) });
    return true;
  }

  cancelSubmission() {
    if (!this.conn || !this.conn.open) {
      console.error('[Guest] 送信失敗: ホストとの接続が切断されています');
      return false;
    }
    this.send(PACKET_TYPES.CANCEL_SUBMISSION, null);
    return true;
  }

  destroy() {
    if (this.conn) this.conn.close();
    if (this.peer) this.peer.destroy();
  }
}
