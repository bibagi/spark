// Spark Client — Минималистичный монохромный WebRTC клиент через PeerJS
const ROOM_PREFIX = 'spark-room-v1-';

// Состояние
let peer = null;
let localStream = null;
let screenStream = null;
let isAudioEnabled = true;
let isVideoEnabled = true;
let isScreenSharing = false;

let myPeerId = '';
let currentRoomId = '';
let currentUsername = '';

// Активные соединения: peerId -> { call, conn, username, stream }
const activePeers = new Map();

// Элементы DOM
const lobbyScreen = document.getElementById('lobby-screen');
const roomScreen = document.getElementById('room-screen');
const joinForm = document.getElementById('join-form');
const usernameInput = document.getElementById('username-input');
const roomInput = document.getElementById('room-input');
const randomRoomBtn = document.getElementById('random-room-btn');
const lobbyVideoPreview = document.getElementById('lobby-video-preview');
const lobbyAvatarFallback = document.getElementById('lobby-avatar-fallback');
const lobbyToggleMic = document.getElementById('lobby-toggle-mic');
const lobbyToggleCam = document.getElementById('lobby-toggle-cam');

const currentRoomName = document.getElementById('current-room-name');
const copyLinkBtn = document.getElementById('copy-link-btn');
const copyBtnText = document.getElementById('copy-btn-text');
const toggleChatPanelBtn = document.getElementById('toggle-chat-panel-btn');
const chatUnreadBadge = document.getElementById('chat-unread-badge');
const chatPanel = document.getElementById('chat-panel');
const usersCountLabel = document.getElementById('users-count-label');

const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localVideoCard = document.getElementById('local-video-card');
const localAvatarFallback = document.getElementById('local-avatar-fallback');
const localAvatarLetter = document.getElementById('local-avatar-letter');
const localParticipantName = document.getElementById('local-participant-name');
const localMicIndicator = document.getElementById('local-mic-indicator');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const reactionsContainer = document.getElementById('reactions-container');

const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const toggleScreenBtn = document.getElementById('toggle-screen-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

let unreadCount = 0;

// ==================== ЛОББИ И ИНИЦИАЛИЗАЦИЯ ====================

const urlParams = new URLSearchParams(window.location.search);
const roomParam = urlParams.get('room');
if (roomParam) {
  roomInput.value = roomParam;
} else {
  generateRandomRoom();
}

function generateRandomRoom() {
  const words = ['spark', 'focus', 'node', 'mesh', 'flow', 'space', 'orbit', 'axis'];
  const num = Math.floor(100 + Math.random() * 900);
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  roomInput.value = `${w1}-${w2}-${num}`;
}

randomRoomBtn.addEventListener('click', generateRandomRoom);

async function initLobbyPreview() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    lobbyVideoPreview.srcObject = localStream;
  } catch (err) {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      isVideoEnabled = false;
      updateVideoStateUI();
    } catch (e) {
      isVideoEnabled = false;
      isAudioEnabled = false;
      updateVideoStateUI();
    }
  }
}
initLobbyPreview();

lobbyToggleMic.addEventListener('click', () => {
  isAudioEnabled = !isAudioEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
  }
  lobbyToggleMic.classList.toggle('muted', !isAudioEnabled);
});

lobbyToggleCam.addEventListener('click', () => {
  isVideoEnabled = !isVideoEnabled;
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
  }
  lobbyToggleCam.classList.toggle('muted', !isVideoEnabled);
  updateVideoStateUI();
});

function updateVideoStateUI() {
  if (isVideoEnabled) {
    lobbyVideoPreview.style.display = 'block';
    lobbyAvatarFallback.style.display = 'none';
  } else {
    lobbyVideoPreview.style.display = 'none';
    lobbyAvatarFallback.style.display = 'flex';
  }
}

// ==================== ВХОД В КОМНАТУ ====================

joinForm.addEventListener('submit', (e) => {
  e.preventDefault();
  currentUsername = usernameInput.value.trim();
  currentRoomId = roomInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');

  if (!currentUsername || !currentRoomId) return;

  const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?room=${currentRoomId}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  lobbyScreen.classList.remove('active');
  roomScreen.classList.add('active');

  currentRoomName.textContent = currentRoomId;
  localParticipantName.textContent = `${currentUsername} (Вы)`;
  localAvatarLetter.textContent = currentUsername.slice(0, 2).toUpperCase();

  localVideo.srcObject = localStream;
  if (!isVideoEnabled) {
    localVideo.style.display = 'none';
    localAvatarFallback.style.display = 'flex';
  }
  localMicIndicator.style.display = isAudioEnabled ? 'none' : 'inline-block';

  initPeerConnection();
});

function initPeerConnection() {
  const randomSuffix = Math.random().toString(36).substring(2, 9);
  myPeerId = `${ROOM_PREFIX}${currentRoomId}-${randomSuffix}`;

  peer = new Peer(myPeerId, {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', () => {
    addSystemMessage(`Вы вошли в ${currentRoomId}`);
    discoverAndConnectPeers();
  });

  peer.on('call', (call) => {
    call.answer(localStream);

    call.on('stream', (remoteStream) => {
      handleRemoteStream(call.peer, remoteStream);
    });

    call.on('close', () => {
      handlePeerDisconnect(call.peer);
    });

    if (!activePeers.has(call.peer)) {
      activePeers.set(call.peer, { call, conn: null, username: 'Участник', stream: null });
    } else {
      activePeers.get(call.peer).call = call;
    }
  });

  peer.on('connection', (conn) => {
    setupDataConnection(conn);
  });
}

function discoverAndConnectPeers() {
  announcePresence();
}

function tryConnectToPeer(targetPeerId) {
  if (targetPeerId === myPeerId || activePeers.has(targetPeerId)) return;

  const conn = peer.connect(targetPeerId, {
    metadata: { username: currentUsername }
  });

  setupDataConnection(conn);

  if (localStream) {
    const call = peer.call(targetPeerId, localStream, {
      metadata: { username: currentUsername }
    });

    call.on('stream', (remoteStream) => {
      handleRemoteStream(targetPeerId, remoteStream);
    });

    call.on('close', () => {
      handlePeerDisconnect(targetPeerId);
    });

    activePeers.set(targetPeerId, { call, conn, username: 'Участник', stream: null });
  }
}

function setupDataConnection(conn) {
  conn.on('open', () => {
    const peerId = conn.peer;
    const existing = activePeers.get(peerId) || {};
    existing.conn = conn;
    activePeers.set(peerId, existing);

    conn.send({
      type: 'handshake',
      username: currentUsername,
      audio: isAudioEnabled,
      video: isVideoEnabled
    });

    if (!existing.call && localStream) {
      const call = peer.call(peerId, localStream, {
        metadata: { username: currentUsername }
      });
      call.on('stream', (remoteStream) => {
        handleRemoteStream(peerId, remoteStream);
      });
      existing.call = call;
    }

    updateUsersCount();
  });

  conn.on('data', (data) => {
    handleIncomingData(conn.peer, data);
  });

  conn.on('close', () => {
    handlePeerDisconnect(conn.peer);
  });
}

function handleIncomingData(senderId, data) {
  if (!data) return;

  if (data.type === 'handshake') {
    const peerInfo = activePeers.get(senderId) || {};
    peerInfo.username = data.username || 'Участник';
    activePeers.set(senderId, peerInfo);

    addSystemMessage(`${peerInfo.username} в сети`);
    updatePeerCardInfo(senderId, peerInfo.username);
    updateUsersCount();

    activePeers.forEach((_, otherId) => {
      if (otherId !== senderId && otherId !== myPeerId) {
        connSend(senderId, { type: 'peer-hint', peerId: otherId });
      }
    });
  } else if (data.type === 'peer-hint') {
    if (data.peerId && data.peerId !== myPeerId && !activePeers.has(data.peerId)) {
      tryConnectToPeer(data.peerId);
    }
  } else if (data.type === 'chat') {
    renderChatMessage({
      sender: data.sender,
      text: data.text,
      time: data.time,
      isMine: false
    });

    if (chatPanel.classList.contains('closed')) {
      unreadCount++;
      chatUnreadBadge.textContent = unreadCount;
      chatUnreadBadge.style.display = 'inline-block';
    }
  } else if (data.type === 'media-state') {
    updateRemoteMediaUI(senderId, data);
  }
}

function connSend(targetPeerId, data) {
  const p = activePeers.get(targetPeerId);
  if (p && p.conn && p.conn.open) {
    p.conn.send(data);
  }
}

function broadcastData(data) {
  activePeers.forEach((peerObj) => {
    if (peerObj.conn && peerObj.conn.open) {
      peerObj.conn.send(data);
    }
  });
}

function announcePresence() {
  try {
    const channel = new BroadcastChannel(`spark_${currentRoomId}`);
    channel.postMessage({ type: 'hello', peerId: myPeerId, username: currentUsername });

    channel.onmessage = (event) => {
      const { type, peerId } = event.data;
      if (type === 'hello' && peerId !== myPeerId && !activePeers.has(peerId)) {
        tryConnectToPeer(peerId);
        channel.postMessage({ type: 'welcome', peerId: myPeerId, username: currentUsername });
      } else if (type === 'welcome' && peerId !== myPeerId && !activePeers.has(peerId)) {
        tryConnectToPeer(peerId);
      }
    };
  } catch (e) {}
}

// ==================== ВИДЕО И МЕДИА ====================

function handleRemoteStream(peerId, stream) {
  let peerInfo = activePeers.get(peerId);
  if (!peerInfo) {
    peerInfo = { call: null, conn: null, username: 'Участник', stream };
    activePeers.set(peerId, peerInfo);
  } else {
    peerInfo.stream = stream;
  }

  addOrUpdateRemoteVideoCard(peerId, peerInfo.username, stream);
  updateUsersCount();
}

function handlePeerDisconnect(peerId) {
  const info = activePeers.get(peerId);
  if (info) {
    addSystemMessage(`${info.username || 'Участник'} вышел`);
    if (info.call) info.call.close();
    if (info.conn) info.conn.close();
  }
  activePeers.delete(peerId);
  removeVideoCard(peerId);
  updateUsersCount();
}

function addOrUpdateRemoteVideoCard(peerId, username, stream) {
  let card = document.getElementById(`card-${peerId}`);

  if (!card) {
    card = document.createElement('div');
    card.id = `card-${peerId}`;
    card.className = 'video-card';

    const displayName = username || 'Участник';
    const initials = displayName.slice(0, 2).toUpperCase();

    card.innerHTML = `
      <video autoplay playsinline></video>
      <div class="avatar-fallback" style="display: none;">
        <span>${initials}</span>
      </div>
      <div class="participant-badge">
        <span class="user-name">${displayName}</span>
        <div class="participant-indicators">
          <span class="indicator mic-off" style="display: none;">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="1" y1="1" x2="23" y2="23"></line>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </span>
        </div>
      </div>
    `;

    videoGrid.appendChild(card);
    updateGridLayout();
  }

  const videoElement = card.querySelector('video');
  videoElement.srcObject = stream;
}

function updatePeerCardInfo(peerId, username) {
  const card = document.getElementById(`card-${peerId}`);
  if (card) {
    const nameEl = card.querySelector('.user-name');
    const fallbackLetter = card.querySelector('.avatar-fallback span');
    if (nameEl) nameEl.textContent = username;
    if (fallbackLetter && username) fallbackLetter.textContent = username.slice(0, 2).toUpperCase();
  }
}

function removeVideoCard(peerId) {
  const card = document.getElementById(`card-${peerId}`);
  if (card) {
    card.remove();
    updateGridLayout();
  }
}

function updateRemoteMediaUI(peerId, { audio, video, screen }) {
  const card = document.getElementById(`card-${peerId}`);
  if (!card) return;

  const vid = card.querySelector('video');
  const fallback = card.querySelector('.avatar-fallback');
  const micIndicator = card.querySelector('.indicator.mic-off');

  if (typeof video === 'boolean') {
    if (video || screen) {
      vid.style.display = 'block';
      fallback.style.display = 'none';
    } else {
      vid.style.display = 'none';
      fallback.style.display = 'flex';
    }
  }

  if (typeof audio === 'boolean') {
    micIndicator.style.display = audio ? 'none' : 'inline-block';
  }

  if (screen) {
    card.classList.add('screen-share');
  } else {
    card.classList.remove('screen-share');
  }
}

function updateGridLayout() {
  const cards = videoGrid.querySelectorAll('.video-card');
  if (cards.length <= 1) {
    videoGrid.className = 'video-grid single-user';
  } else {
    videoGrid.className = 'video-grid';
  }
}

function updateUsersCount() {
  const count = activePeers.size + 1;
  usersCountLabel.textContent = `${count} ${pluralizeUsers(count)}`;
}

function pluralizeUsers(n) {
  if (n % 10 === 1 && n % 100 !== 11) return 'участник';
  if (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) return 'участника';
  return 'участников';
}

// ==================== КНОПКИ ЗВОНКА ====================

toggleMicBtn.addEventListener('click', () => {
  isAudioEnabled = !isAudioEnabled;
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
  }
  toggleMicBtn.classList.toggle('muted', !isAudioEnabled);
  localMicIndicator.style.display = isAudioEnabled ? 'none' : 'inline-block';

  broadcastData({ type: 'media-state', audio: isAudioEnabled });
});

toggleCamBtn.addEventListener('click', () => {
  isVideoEnabled = !isVideoEnabled;
  if (localStream) {
    localStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);
  }
  toggleCamBtn.classList.toggle('off', !isVideoEnabled);

  if (isVideoEnabled) {
    localVideo.style.display = 'block';
    localAvatarFallback.style.display = 'none';
  } else {
    localVideo.style.display = 'none';
    localAvatarFallback.style.display = 'flex';
  }

  broadcastData({ type: 'media-state', video: isVideoEnabled });
});

toggleScreenBtn.addEventListener('click', async () => {
  if (!isScreenSharing) {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      const screenVideoTrack = screenStream.getVideoTracks()[0];

      replaceVideoTrack(screenVideoTrack);

      localVideo.srcObject = screenStream;
      localVideoCard.classList.add('screen-share');
      toggleScreenBtn.classList.add('active');
      isScreenSharing = true;

      broadcastData({ type: 'media-state', screen: true });

      screenVideoTrack.onended = () => {
        stopScreenShare();
      };
    } catch (err) {
      console.warn('Демонстрация отменена:', err);
    }
  } else {
    stopScreenShare();
  }
});

function stopScreenShare() {
  if (!isScreenSharing) return;

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  const camVideoTrack = localStream ? localStream.getVideoTracks()[0] : null;
  if (camVideoTrack) {
    replaceVideoTrack(camVideoTrack);
  }

  localVideo.srcObject = localStream;
  localVideoCard.classList.remove('screen-share');
  toggleScreenBtn.classList.remove('active');
  isScreenSharing = false;

  broadcastData({ type: 'media-state', screen: false, video: isVideoEnabled });
}

function replaceVideoTrack(newTrack) {
  activePeers.forEach((peerObj) => {
    if (peerObj.call && peerObj.call.peerConnection) {
      const sender = peerObj.call.peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
      if (sender) {
        sender.replaceTrack(newTrack);
      }
    }
  });
}

leaveRoomBtn.addEventListener('click', () => {
  if (confirm('Покинуть звонок?')) {
    if (peer) peer.destroy();
    window.location.href = window.location.pathname;
  }
});

copyLinkBtn.addEventListener('click', async () => {
  const inviteUrl = window.location.href;
  try {
    await navigator.clipboard.writeText(inviteUrl);
    copyBtnText.textContent = 'Скопировано';
    setTimeout(() => {
      copyBtnText.textContent = 'Ссылка';
    }, 2000);
  } catch (err) {
    prompt('Ссылка на комнату:', inviteUrl);
  }
});

// ==================== ЧАТ И ССЫЛКИ ====================

toggleChatPanelBtn.addEventListener('click', () => {
  chatPanel.classList.toggle('closed');
  const isOpen = !chatPanel.classList.contains('closed');
  toggleChatPanelBtn.classList.toggle('active', isOpen);
  if (isOpen) {
    unreadCount = 0;
    chatUnreadBadge.style.display = 'none';
  }
});

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;

  const msgData = {
    sender: currentUsername,
    text: text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMine: true
  };

  renderChatMessage(msgData);
  broadcastData({ type: 'chat', ...msgData });

  chatInput.value = '';
});

function addSystemMessage(text) {
  const msgDiv = document.createElement('div');
  msgDiv.className = 'chat-message system';
  msgDiv.textContent = text;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function parseLinks(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  let matches = text.match(urlRegex);
  let html = escapeHtml(text);

  if (matches) {
    matches.forEach(url => {
      const safeUrl = escapeHtml(url);
      html = html.replace(safeUrl, `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`);
    });
  }

  return { html, firstUrl: matches ? matches[0] : null };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderChatMessage(msg) {
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-message ${msg.isMine ? 'mine' : ''}`;

  const parsed = parseLinks(msg.text);

  let previewHtml = '';
  if (parsed.firstUrl) {
    try {
      const u = new URL(parsed.firstUrl);
      previewHtml = `
        <div class="link-preview-box">
          <div class="link-preview-icon">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
            </svg>
          </div>
          <div class="link-preview-info">
            <span class="link-preview-host">${escapeHtml(u.hostname)}</span>
            <span class="link-preview-url">${escapeHtml(parsed.firstUrl)}</span>
          </div>
        </div>
      `;
    } catch (e) {}
  }

  msgDiv.innerHTML = `
    <div class="message-meta">
      <span class="sender">${escapeHtml(msg.sender)}</span>
      <span class="time">${msg.time}</span>
    </div>
    <div class="message-bubble">
      ${parsed.html}
      ${previewHtml}
    </div>
  `;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
