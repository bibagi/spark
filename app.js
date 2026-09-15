// ==================== КОНФИГУРАЦИЯ SUPABASE ====================
// Бесплатный облачный бэкенд для комнат, проверки паролей и WebRTC сигналов
const SUPABASE_URL = 'https://dgkpcynowgewoqvtbmkb.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRna3BjeW5vd2dld29xdnRibWtiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0NzA4NzMsImV4cCI6MjEwNTA0Njg3M30.2yJ8-0NCbAv7sMFb3phXFsMVkb8FH7YEzWZtmQ2z1ww';

// Инициализация Supabase клиента (используем имя supabaseClient, чтобы не конфликтовать с глобальным window.supabase из CDN)
let supabaseClient = null;
try {
  if (window.supabase && SUPABASE_URL && !SUPABASE_ANON_KEY.includes('demo_key')) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase успешно подключен');
  }
} catch (e) {
  console.warn('Supabase не сконфигурирован, работаем в автономном режиме');
}

const ROOM_PREFIX = 'spark-room-v1-';

// Ключи в LocalStorage
const STORAGE_KEYS = {
  USERNAME: 'spark_user_name',
  AVATAR: 'spark_user_avatar',
  SELECTED_MIC: 'spark_device_mic',
  SELECTED_CAM: 'spark_device_cam',
  SELECTED_SPEAKER: 'spark_device_speaker',
  LAST_ROOM: 'spark_last_room',
  ROOM_HISTORY: 'spark_room_history',
  SAVED_CHATS: 'spark_saved_chats_v1',
  MIC_GAIN: 'spark_mic_gain'
};

// Состояния приложения
let peer = null;
let localStream = null;
let screenStream = null;
let isAudioEnabled = true;
let isVideoEnabled = true;
let isScreenSharing = false;

let myPeerId = '';
let currentRoomId = '';
let currentUsername = '';
let currentAvatar = ''; // base64 или url

// Устройства и громкость
let selectedMicId = localStorage.getItem(STORAGE_KEYS.SELECTED_MIC) || '';
let selectedCamId = localStorage.getItem(STORAGE_KEYS.SELECTED_CAM) || '';
let selectedSpeakerId = localStorage.getItem(STORAGE_KEYS.SELECTED_SPEAKER) || '';
let micGainValue = parseFloat(localStorage.getItem(STORAGE_KEYS.MIC_GAIN) || '1.0');

// Voice Activity Detection (VAD) & Web Audio Gain
let audioContext = null;
let localSourceNode = null;
let localGainNode = null;
let localDestinationNode = null;
let processedLocalStream = null;
let localAnalyser = null;
let localDataArray = null;
let vadInterval = null;

// Активные соединения: peerId -> { call, conn, username, avatar, stream, analyser, dataArray }
const activePeers = new Map();

// DOM элементы
const toastContainer = document.getElementById('toast-container');
const lobbyScreen = document.getElementById('lobby-screen');
const roomScreen = document.getElementById('room-screen');
const usernameInput = document.getElementById('username-input');
const usernameWrapper = document.getElementById('username-wrapper');
const usernameError = document.getElementById('username-error');

// Вкладки и формы
const tabCreateBtn = document.getElementById('tab-create-btn');
const tabJoinBtn = document.getElementById('tab-join-btn');
const createRoomForm = document.getElementById('create-room-form');
const joinCodeForm = document.getElementById('join-code-form');

const createRoomInput = document.getElementById('create-room-input');
const createRoomPassword = document.getElementById('create-room-password');
const createRoomWrapper = document.getElementById('create-room-wrapper');

const joinCodeInput = document.getElementById('join-code-input');
const joinCodePassword = document.getElementById('join-code-password');
const joinCodeWrapper = document.getElementById('join-code-wrapper');
const joinPasswordWrapper = document.getElementById('join-password-wrapper');

const randomRoomBtn = document.getElementById('random-room-btn');
const avatarPreviewBtn = document.getElementById('avatar-preview-btn');
const avatarFileInput = document.getElementById('avatar-file-input');
const avatarPlaceholderIcon = document.getElementById('avatar-placeholder-icon');
const avatarPreviewImg = document.getElementById('avatar-preview-img');

const lobbyVideoPreview = document.getElementById('lobby-video-preview');
const lobbyAvatarFallback = document.getElementById('lobby-avatar-fallback');
const lobbyAvatarImg = document.getElementById('lobby-avatar-img');
const lobbyAvatarIcon = document.getElementById('lobby-avatar-icon');
const lobbyToggleMic = document.getElementById('lobby-toggle-mic');
const lobbyToggleCam = document.getElementById('lobby-toggle-cam');
const lobbyOpenSettingsBtn = document.getElementById('lobby-open-settings-btn');

const currentRoomName = document.getElementById('current-room-name');
const currentRoomCode = document.getElementById('current-room-code');
const copyCodeBtn = document.getElementById('copy-code-btn');
const copyCodeBtnText = document.getElementById('copy-code-btn-text');
const copyLinkBtn = document.getElementById('copy-link-btn');
const copyBtnText = document.getElementById('copy-btn-text');
const roomSettingsBtn = document.getElementById('room-settings-btn');
const toggleChatPanelBtn = document.getElementById('toggle-chat-panel-btn');
const chatUnreadBadge = document.getElementById('chat-unread-badge');
const chatPanel = document.getElementById('chat-panel');
const usersCountLabel = document.getElementById('users-count-label');

const videoGrid = document.getElementById('video-grid');
const localVideo = document.getElementById('local-video');
const localVideoCard = document.getElementById('local-video-card');
const localAvatarFallback = document.getElementById('local-avatar-fallback');
const localAvatarImgRoom = document.getElementById('local-avatar-img-room');
const localAvatarLetter = document.getElementById('local-avatar-letter');
const localParticipantName = document.getElementById('local-participant-name');
const localMicIndicator = document.getElementById('local-mic-indicator');

const chatMessages = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCamBtn = document.getElementById('toggle-cam-btn');
const toggleScreenBtn = document.getElementById('toggle-screen-btn');
const leaveRoomBtn = document.getElementById('leave-room-btn');

// Модалка настроек и подтверждения выхода
const deviceSettingsModal = document.getElementById('device-settings-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalSaveBtn = document.getElementById('modal-save-btn');
const micSelect = document.getElementById('mic-select');
const cameraSelect = document.getElementById('camera-select');
const speakerSelect = document.getElementById('speaker-select');
const micTestBarFill = document.getElementById('mic-test-bar-fill');
const micGainSlider = document.getElementById('mic-gain-slider');
const micGainVal = document.getElementById('mic-gain-val');

const leaveConfirmModal = document.getElementById('leave-confirm-modal');
const cancelLeaveBtn = document.getElementById('cancel-leave-btn');
const confirmLeaveBtn = document.getElementById('confirm-leave-btn');

// Модалка очистки истории
const clearHistoryModal = document.getElementById('clear-history-modal');
const cancelClearHistoryBtn = document.getElementById('cancel-clear-history-btn');
const confirmClearHistoryBtn = document.getElementById('confirm-clear-history-btn');

// История комнат и онлайн список
const historyList = document.getElementById('history-list');
const activeRoomsList = document.getElementById('active-rooms-list');
const refreshRoomsBtn = document.getElementById('refresh-rooms-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');

// Пароль текущей комнаты (если установлен хостом)
let currentRoomPassword = '';
let isHost = false;

let unreadCount = 0;

// ==================== КАСТОМНЫЕ УВЕДОМЛЕНИЯ И ОШИБКИ ====================

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'custom-toast';
  toast.innerHTML = `
    <div class="toast-icon">
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="12"></line>
        <line x1="12" y1="16" x2="12.01" y2="16"></line>
      </svg>
    </div>
    <span>${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

function clearFieldErrors() {
  if (usernameWrapper) usernameWrapper.classList.remove('error');
  if (createRoomWrapper) createRoomWrapper.classList.remove('error');
  if (joinCodeWrapper) joinCodeWrapper.classList.remove('error');
  if (joinPasswordWrapper) joinPasswordWrapper.classList.remove('error');
}

// ==================== ИНИЦИАЛИЗАЦИЯ И ВОССТАНОВЛЕНИЕ ДАННЫХ ====================

// Восстановление ника, аватарки и истории комнат
function restoreUserData() {
  const savedName = localStorage.getItem(STORAGE_KEYS.USERNAME);
  if (savedName) {
    usernameInput.value = savedName;
    currentUsername = savedName;
  }

  const savedAvatar = localStorage.getItem(STORAGE_KEYS.AVATAR);
  if (savedAvatar) {
    currentAvatar = savedAvatar;
    applyAvatarToUI(savedAvatar);
  }

  // Восстановление усиления микрофона
  const percent = Math.round(micGainValue * 100);
  if (micGainSlider && micGainVal) {
    micGainSlider.value = percent;
    micGainVal.textContent = `${percent}%`;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  const codeParam = urlParams.get('code');
  if (codeParam) {
    switchTab('join');
    joinCodeInput.value = codeParam;
  } else if (roomParam) {
    createRoomInput.value = roomParam;
  } else {
    const lastRoom = localStorage.getItem(STORAGE_KEYS.LAST_ROOM);
    if (lastRoom) {
      createRoomInput.value = lastRoom;
    } else {
      generateRandomRoom();
    }
  }

  renderRoomHistory();
}

// Переключение вкладок лобби
function switchTab(tab) {
  if (tab === 'create') {
    tabCreateBtn.classList.add('active');
    tabJoinBtn.classList.remove('active');
    createRoomForm.style.display = 'flex';
    joinCodeForm.style.display = 'none';
  } else {
    tabJoinBtn.classList.add('active');
    tabCreateBtn.classList.remove('active');
    joinCodeForm.style.display = 'flex';
    createRoomForm.style.display = 'none';
  }
}

tabCreateBtn.addEventListener('click', () => switchTab('create'));
tabJoinBtn.addEventListener('click', () => switchTab('join'));

// ==================== ОНЛАЙН БАЗА КОМНАТ (SUPABASE / REALTIME) ====================

// Регистрация комнаты в базе данных
async function dbRegisterRoom(code, name, hasPassword, hostUser) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('spark_rooms').upsert({
      code: code.toUpperCase(),
      name: name,
      has_password: Boolean(hasPassword),
      password: currentRoomPassword || '',
      host_name: hostUser,
      created_at: new Date().toISOString(),
      active: true
    }, { onConflict: 'code' });
  } catch (err) {
    console.warn('DB Register error:', err);
  }
}

// Проверка существования комнаты и пароля в базе
async function dbValidateRoom(code, enteredPassword) {
  if (!supabaseClient) {
    // В режиме без БД (fallback) возвращаем true
    return { valid: true };
  }

  try {
    const { data, error } = await supabaseClient
      .from('spark_rooms')
      .select('*')
      .eq('code', code.toUpperCase())
      .single();

    if (error || !data) {
      return { valid: false, reason: 'Комната с таким кодом не найдена. Проверьте код.' };
    }

    if (data.has_password && data.password) {
      if (data.password !== enteredPassword) {
        return { valid: false, reason: 'Неверный пароль комнаты.' };
      }
    }

    return { valid: true, room: data };
  } catch (err) {
    console.warn('DB Validate error:', err);
    return { valid: true };
  }
}

// Загрузка списка комнат онлайн из БД
async function fetchOnlineRooms() {
  if (!activeRoomsList) return;

  if (!supabaseClient) {
    activeRoomsList.innerHTML = `
      <div class="history-item" style="cursor: default; opacity: 0.85;">
        <div class="history-item-info">
          <span class="history-room-name">Режим прямого P2P</span>
          <span class="history-item-meta">Создайте комнату слева или введите код хоста</span>
        </div>
      </div>
    `;
    return;
  }

  try {
    const { data, error } = await supabaseClient
      .from('spark_rooms')
      .select('*')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(15);

    if (error || !data || data.length === 0) {
      activeRoomsList.innerHTML = `<div class="history-empty">Сейчас нет активных комнат. Будьте первым!</div>`;
      return;
    }

    activeRoomsList.innerHTML = '';
    data.forEach(room => {
      const el = document.createElement('div');
      el.className = 'history-item';
      const lockIcon = room.has_password ? '🔒 ' : '';

      el.innerHTML = `
        <div class="history-item-info">
          <span class="history-room-name">${lockIcon}${escapeHtml(room.name || room.code)}</span>
          <span class="history-item-meta">Код: <b>${escapeHtml(room.code)}</b> • Хост: ${escapeHtml(room.host_name || 'Хост')}</span>
        </div>
        <div class="history-join-icon">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      `;

      el.addEventListener('click', () => {
        switchTab('join');
        joinCodeInput.value = room.code;
        clearFieldErrors();
        joinCodeForm.scrollIntoView({ behavior: 'smooth' });
      });

      activeRoomsList.appendChild(el);
    });
  } catch (err) {
    activeRoomsList.innerHTML = `<div class="history-empty">Ошибка загрузки комнат</div>`;
  }
}

if (refreshRoomsBtn) {
  refreshRoomsBtn.addEventListener('click', () => {
    fetchOnlineRooms();
    showToast('Список комнат обновлен');
  });
}

// Удаление / деактивация комнаты при выходе хоста
async function dbDeactivateRoom(code) {
  if (!supabaseClient || !isHost) return;
  try {
    await supabaseClient.from('spark_rooms').update({ active: false }).eq('code', code.toUpperCase());
  } catch (e) {}
}

// ==================== ИСТОРИЯ КОМНАТ И СОХРАНЕНИЕ ЧАТА ====================

function getRoomHistory() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.ROOM_HISTORY) || '[]');
  } catch (e) {
    return [];
  }
}

function saveRoomToHistory(roomId) {
  let history = getRoomHistory();
  // Удаляем дубликат и ставим наверх
  history = history.filter(item => item.roomId !== roomId);
  history.unshift({
    roomId,
    timestamp: Date.now()
  });
  // Ограничиваем последними 25 комнатами
  if (history.length > 25) history = history.slice(0, 25);
  localStorage.setItem(STORAGE_KEYS.ROOM_HISTORY, JSON.stringify(history));
  renderRoomHistory();
}

function renderRoomHistory() {
  if (!historyList) return;
  const history = getRoomHistory();

  if (history.length === 0) {
    historyList.innerHTML = `<div class="history-empty">История комнат пока пуста</div>`;
    return;
  }

  historyList.innerHTML = '';
  history.forEach(item => {
    const el = document.createElement('div');
    el.className = 'history-item';
    const dateStr = new Date(item.timestamp).toLocaleDateString([], { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    
    // Считаем количество сохраненных сообщений для комнаты
    const chats = getSavedRoomMessages(item.roomId);
    const msgCountText = chats.length > 0 ? `${chats.length} сообщ.` : 'без сообщений';

    el.innerHTML = `
      <div class="history-item-info">
        <span class="history-room-name">${escapeHtml(item.roomId)}</span>
        <span class="history-item-meta">${dateStr} • ${msgCountText}</span>
      </div>
      <div class="history-join-icon">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="5" y1="12" x2="19" y2="12"></line>
          <polyline points="12 5 19 12 12 19"></polyline>
        </svg>
      </div>
    `;

    el.addEventListener('click', () => {
      switchTab('create');
      createRoomInput.value = item.roomId;
      clearFieldErrors();
      createRoomForm.scrollIntoView({ behavior: 'smooth' });
    });

    historyList.appendChild(el);
  });
}

// Кастомное модальное окно очистки истории
clearHistoryBtn.addEventListener('click', () => {
  clearHistoryModal.classList.add('active');
});

cancelClearHistoryBtn.addEventListener('click', () => {
  clearHistoryModal.classList.remove('active');
});

clearHistoryModal.addEventListener('click', (e) => {
  if (e.target === clearHistoryModal) {
    clearHistoryModal.classList.remove('active');
  }
});

confirmClearHistoryBtn.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEYS.ROOM_HISTORY);
  renderRoomHistory();
  clearHistoryModal.classList.remove('active');
  showToast('История комнат очищена');
});

function getSavedRoomMessages(roomId) {
  try {
    const allChats = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_CHATS) || '{}');
    return allChats[roomId] || [];
  } catch (e) {
    return [];
  }
}

function saveMessageToRoomHistory(roomId, msg) {
  try {
    const allChats = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_CHATS) || '{}');
    if (!allChats[roomId]) allChats[roomId] = [];
    allChats[roomId].push(msg);
    if (allChats[roomId].length > 100) allChats[roomId] = allChats[roomId].slice(-100);
    localStorage.setItem(STORAGE_KEYS.SAVED_CHATS, JSON.stringify(allChats));
  } catch (e) {}
}

function applyAvatarToUI(avatarData) {
  if (avatarData) {
    avatarPreviewImg.src = avatarData;
    avatarPreviewImg.style.display = 'block';
    avatarPlaceholderIcon.style.display = 'none';

    lobbyAvatarImg.src = avatarData;
    lobbyAvatarImg.style.display = 'block';
    lobbyAvatarIcon.style.display = 'none';

    localAvatarImgRoom.src = avatarData;
    localAvatarImgRoom.style.display = 'block';
    localAvatarLetter.style.display = 'none';
  } else {
    avatarPreviewImg.style.display = 'none';
    avatarPlaceholderIcon.style.display = 'block';

    lobbyAvatarImg.style.display = 'none';
    lobbyAvatarIcon.style.display = 'block';

    localAvatarImgRoom.style.display = 'none';
    localAvatarLetter.style.display = 'block';
  }
}

// Загрузка аватарки с диска
function handleAvatarUpload(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Пожалуйста, выберите файл изображения');
    return;
  }
  if (file.size > 2 * 1024 * 1024) {
    showToast('Размер изображения не должен превышать 2 МБ');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentAvatar = e.target.result;
    localStorage.setItem(STORAGE_KEYS.AVATAR, currentAvatar);
    applyAvatarToUI(currentAvatar);
    showToast('Аватар успешно сохранен');

    // Если уже в комнате — транслируем обновление пирам
    if (peer && !peer.destroyed) {
      broadcastData({ type: 'profile-update', avatar: currentAvatar, username: currentUsername });
    }
  };
  reader.readAsDataURL(file);
}

avatarPreviewBtn.addEventListener('click', () => avatarFileInput.click());
avatarFileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleAvatarUpload(e.target.files[0]);
  }
});

usernameInput.addEventListener('input', () => {
  usernameWrapper.classList.remove('error');
  currentUsername = usernameInput.value.trim();
  localStorage.setItem(STORAGE_KEYS.USERNAME, currentUsername);
});

createRoomInput.addEventListener('input', () => {
  if (createRoomWrapper) createRoomWrapper.classList.remove('error');
});

joinCodeInput.addEventListener('input', () => {
  if (joinCodeWrapper) joinCodeWrapper.classList.remove('error');
});

joinCodePassword.addEventListener('input', () => {
  if (joinPasswordWrapper) joinPasswordWrapper.classList.remove('error');
});

function generateRandomRoom() {
  const words = ['spark', 'focus', 'node', 'mesh', 'flow', 'space', 'orbit', 'axis'];
  const num = Math.floor(100 + Math.random() * 900);
  const w1 = words[Math.floor(Math.random() * words.length)];
  const w2 = words[Math.floor(Math.random() * words.length)];
  createRoomInput.value = `${w1}-${w2}-${num}`;
}

randomRoomBtn.addEventListener('click', generateRandomRoom);

// ==================== МЕДИА УСТРОЙСТВА И VAD ====================

async function getMediaStream() {
  const audioConstraints = selectedMicId ? { deviceId: { exact: selectedMicId } } : true;
  const videoConstraints = selectedCamId ? { deviceId: { exact: selectedCamId } } : true;

  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints
    });
  } catch (err) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (e) {
      return null;
    }
  }
}

async function initLobbyPreview() {
  localStream = await getMediaStream();

  if (localStream) {
    lobbyVideoPreview.srcObject = localStream;
    if (localStream.getVideoTracks().length === 0) {
      isVideoEnabled = false;
      updateVideoStateUI();
    }
    setupLocalVAD(localStream);
  } else {
    isVideoEnabled = false;
    isAudioEnabled = false;
    updateVideoStateUI();
  }

  // Обновляем список доступных устройств
  await populateDeviceSelectors();
}

function updateVideoStateUI() {
  if (isVideoEnabled) {
    lobbyVideoPreview.style.display = 'block';
    lobbyAvatarFallback.style.display = 'none';
  } else {
    lobbyVideoPreview.style.display = 'none';
    lobbyAvatarFallback.style.display = 'flex';
  }
}

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

// Настройка детекции голоса и усиления микрофона (GainNode)
function setupLocalVAD(stream) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    if (localSourceNode) {
      try { localSourceNode.disconnect(); } catch (e) {}
    }

    localSourceNode = audioContext.createMediaStreamSource(stream);
    localGainNode = audioContext.createGain();
    localGainNode.gain.value = micGainValue;

    localDestinationNode = audioContext.createMediaStreamDestination();
    localAnalyser = audioContext.createAnalyser();
    localAnalyser.fftSize = 512;
    localAnalyser.smoothingTimeConstant = 0.4;

    // Цепочка: source -> gain -> destination (для отправки в PeerJS)
    //         gain -> analyser (для детекции речи VAD и громкости)
    localSourceNode.connect(localGainNode);
    localGainNode.connect(localDestinationNode);
    localGainNode.connect(localAnalyser);

    processedLocalStream = localDestinationNode.stream;
    localDataArray = new Uint8Array(localAnalyser.frequencyBinCount);

    if (vadInterval) clearInterval(vadInterval);
    vadInterval = setInterval(checkVoiceActivity, 80);
  } catch (err) {
    console.warn('VAD инициализация недоступна:', err);
  }
}

// Управление слайдером усиления микрофона
if (micGainSlider) {
  micGainSlider.addEventListener('input', (e) => {
    const val = parseInt(e.target.value, 10);
    micGainValue = val / 100;
    localStorage.setItem(STORAGE_KEYS.MIC_GAIN, micGainValue.toString());
    if (micGainVal) micGainVal.textContent = `${val}%`;
    if (localGainNode) {
      localGainNode.gain.value = micGainValue;
    }
  });
}

function checkVoiceActivity() {
  // Проверка локального голоса
  if (localAnalyser && isAudioEnabled) {
    localAnalyser.getByteFrequencyData(localDataArray);
    let sum = 0;
    for (let i = 0; i < localDataArray.length; i++) {
      sum += localDataArray[i];
    }
    const average = sum / localDataArray.length;

    // Шкала в модалке настроек микрофона
    if (deviceSettingsModal.classList.contains('active') && micTestBarFill) {
      micTestBarFill.style.width = `${Math.min(100, average * 2.5)}%`;
    }

    const isSpeaking = average > 18;
    localVideoCard.classList.toggle('speaking', isSpeaking);
  } else {
    localVideoCard.classList.remove('speaking');
    if (micTestBarFill) micTestBarFill.style.width = '0%';
  }

  // Проверка удаленных пиров
  activePeers.forEach((peerObj, peerId) => {
    if (peerObj.analyser && peerObj.dataArray) {
      peerObj.analyser.getByteFrequencyData(peerObj.dataArray);
      let sum = 0;
      for (let i = 0; i < peerObj.dataArray.length; i++) {
        sum += peerObj.dataArray[i];
      }
      const avg = sum / peerObj.dataArray.length;
      const isPeerSpeaking = avg > 18;

      const card = document.getElementById(`card-${peerId}`);
      if (card) {
        card.classList.toggle('speaking', isPeerSpeaking);
      }
    }
  });
}

// Возвращает аудио/видео поток для отправки пирам (с учетом усиления микрофона)
function getStreamToSend() {
  if (!localStream) return null;
  const audioTrack = (processedLocalStream && processedLocalStream.getAudioTracks().length > 0)
    ? processedLocalStream.getAudioTracks()[0]
    : localStream.getAudioTracks()[0];
  
  const videoTrack = localStream.getVideoTracks()[0];

  const tracks = [];
  if (audioTrack) tracks.push(audioTrack);
  if (videoTrack) tracks.push(videoTrack);

  return new MediaStream(tracks);
}

// Настройка VAD и регулятора громкости для удаленного потока собеседника
function setupRemoteVAD(peerId, stream, videoElement) {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (stream.getAudioTracks().length === 0) return;

    const source = audioContext.createMediaStreamSource(stream);
    const gainNode = audioContext.createGain();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.4;

    source.connect(gainNode);
    gainNode.connect(analyser);

    const peerInfo = activePeers.get(peerId);
    if (peerInfo) {
      peerInfo.analyser = analyser;
      peerInfo.gainNode = gainNode;
      peerInfo.dataArray = new Uint8Array(analyser.frequencyBinCount);
      peerInfo.videoElement = videoElement;
    }
  } catch (e) {
    console.warn('Remote VAD setup error:', e);
  }
}

// ==================== ВЫБОР УСТРОЙСТВ (ВВОД/ВЫВОД) ====================

async function populateDeviceSelectors() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return;

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();

    micSelect.innerHTML = '';
    cameraSelect.innerHTML = '';
    speakerSelect.innerHTML = '';

    devices.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;

      if (device.kind === 'audioinput') {
        option.text = device.label || `Микрофон ${micSelect.length + 1}`;
        if (device.deviceId === selectedMicId) option.selected = true;
        micSelect.appendChild(option);
      } else if (device.kind === 'videoinput') {
        option.text = device.label || `Камера ${cameraSelect.length + 1}`;
        if (device.deviceId === selectedCamId) option.selected = true;
        cameraSelect.appendChild(option);
      } else if (device.kind === 'audiooutput') {
        option.text = device.label || `Динамики ${speakerSelect.length + 1}`;
        if (device.deviceId === selectedSpeakerId) option.selected = true;
        speakerSelect.appendChild(option);
      }
    });

    if (speakerSelect.length === 0) {
      const opt = document.createElement('option');
      opt.text = 'По умолчанию (системные динамики)';
      speakerSelect.appendChild(opt);
    }
  } catch (err) {
    console.warn('Ошибка при получении списка устройств:', err);
  }
}

// Переключение устройств в потоке
async function switchDevices(newMicId, newCamId, newSpeakerId) {
  selectedMicId = newMicId;
  selectedCamId = newCamId;
  selectedSpeakerId = newSpeakerId;

  localStorage.setItem(STORAGE_KEYS.SELECTED_MIC, selectedMicId);
  localStorage.setItem(STORAGE_KEYS.SELECTED_CAM, selectedCamId);
  localStorage.setItem(STORAGE_KEYS.SELECTED_SPEAKER, selectedSpeakerId);

  // Обновляем локальный стрим
  if (localStream) {
    localStream.getTracks().forEach(t => t.stop());
  }

  localStream = await getMediaStream();
  if (localStream) {
    localStream.getAudioTracks().forEach(t => t.enabled = isAudioEnabled);
    localStream.getVideoTracks().forEach(t => t.enabled = isVideoEnabled);

    lobbyVideoPreview.srcObject = localStream;
    localVideo.srcObject = localStream;

    setupLocalVAD(localStream);

    // Заменяем треки в активных PeerConnection
    const newAudioTrack = localStream.getAudioTracks()[0];
    const newVideoTrack = localStream.getVideoTracks()[0];

    activePeers.forEach((peerObj) => {
      if (peerObj.call && peerObj.call.peerConnection) {
        const senders = peerObj.call.peerConnection.getSenders();
        if (newAudioTrack) {
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) audioSender.replaceTrack(newAudioTrack);
        }
        if (newVideoTrack && !isScreenSharing) {
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) videoSender.replaceTrack(newVideoTrack);
        }
      }
    });
  }

  // Применяем аудиовыход к видеоэлементам (setSinkId)
  applySpeakerOutput(newSpeakerId);
}

function applySpeakerOutput(speakerId) {
  if (!speakerId) return;
  const videos = document.querySelectorAll('video');
  videos.forEach(v => {
    if (typeof v.setSinkId === 'function') {
      v.setSinkId(speakerId).catch(err => console.warn('setSinkId error:', err));
    }
  });
}

// Модалка открытия настроек
lobbyOpenSettingsBtn.addEventListener('click', openDeviceModal);
roomSettingsBtn.addEventListener('click', openDeviceModal);
modalCloseBtn.addEventListener('click', closeDeviceModal);
deviceSettingsModal.addEventListener('click', (e) => {
  if (e.target === deviceSettingsModal) closeDeviceModal();
});

function openDeviceModal() {
  populateDeviceSelectors();
  deviceSettingsModal.classList.add('active');
}

function closeDeviceModal() {
  deviceSettingsModal.classList.remove('active');
}

modalSaveBtn.addEventListener('click', async () => {
  await switchDevices(micSelect.value, cameraSelect.value, speakerSelect.value);
  closeDeviceModal();
  showToast('Настройки устройств обновлены');
});

// ==================== СОЗДАНИЕ И ПОДКЛЮЧЕНИЕ К КОМНАТЕ ====================

// Форма 1: Создание комнаты хостом
createRoomForm.addEventListener('submit', (e) => {
  e.preventDefault();
  clearFieldErrors();

  const usernameVal = usernameInput.value.trim();
  const roomVal = createRoomInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const passVal = createRoomPassword.value.trim();

  let hasError = false;
  if (!usernameVal) {
    usernameWrapper.classList.add('error');
    hasError = true;
  }
  if (!roomVal) {
    createRoomWrapper.classList.add('error');
    hasError = true;
  }

  if (hasError) {
    showToast('Заполните обязательные поля');
    return;
  }

  isHost = true;
  currentUsername = usernameVal;
  currentRoomId = roomVal;
  currentRoomPassword = passVal;

  console.log('Создаем комнату:', currentRoomId, 'хост:', currentUsername);
  startRoomSession();
});

// Форма 2: Подключение по коду комнаты
joinCodeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearFieldErrors();

  const usernameVal = usernameInput.value.trim();
  const codeVal = joinCodeInput.value.trim().toUpperCase().replace(/\s+/g, '');
  const passVal = joinCodePassword.value.trim();

  let hasError = false;
  if (!usernameVal) {
    usernameWrapper.classList.add('error');
    hasError = true;
  }
  if (!codeVal) {
    joinCodeWrapper.classList.add('error');
    hasError = true;
  }

  if (hasError) {
    showToast('Введите код комнаты хоста');
    return;
  }

  // Проверяем валидность комнаты через базу Supabase
  const validation = await dbValidateRoom(codeVal, passVal);
  if (!validation.valid) {
    showToast(validation.reason || 'Комната не найдена');
    if (validation.reason && validation.reason.includes('пароль')) {
      joinPasswordWrapper.classList.add('error');
    } else {
      joinCodeWrapper.classList.add('error');
    }
    return;
  }

  isHost = false;
  currentUsername = usernameVal;
  currentRoomId = codeVal.toLowerCase();
  currentRoomPassword = passVal;

  startRoomSession();
});

function startRoomSession() {
  localStorage.setItem(STORAGE_KEYS.USERNAME, currentUsername);
  localStorage.setItem(STORAGE_KEYS.LAST_ROOM, currentRoomId);
  saveRoomToHistory(currentRoomId);

  const newUrl = `${window.location.protocol}//${window.location.host}${window.location.pathname}?code=${encodeURIComponent(currentRoomId)}`;
  window.history.pushState({ path: newUrl }, '', newUrl);

  lobbyScreen.classList.remove('active');
  roomScreen.classList.add('active');

  currentRoomName.textContent = currentRoomId;
  currentRoomCode.textContent = currentRoomId.toUpperCase();
  localParticipantName.textContent = `${currentUsername} (Вы)`;
  localAvatarLetter.textContent = currentUsername.slice(0, 2).toUpperCase();

  localVideo.srcObject = localStream;
  if (!isVideoEnabled) {
    localVideo.style.display = 'none';
    localAvatarFallback.style.display = 'flex';
  }
  localMicIndicator.style.display = isAudioEnabled ? 'none' : 'inline-block';

  // Загружаем сохраненную историю чата для этой комнаты
  loadSavedRoomChat(currentRoomId);

  // Регистрируем комнату в БД если мы хост (асинхронно, не блокируя UI)
  if (isHost) {
    dbRegisterRoom(currentRoomId, currentRoomName.textContent, Boolean(currentRoomPassword), currentUsername)
      .catch(err => console.warn('Регистрация в БД не удалась, продолжаем P2P:', err));
  }

  initPeerConnection();
}

// ==================== PEERJS И СИГНАЛИНГ ====================

function createPeerInstance(peerId) {
  // Набор проверенных публичных PeerJS серверов
  return new Peer(peerId, {
    debug: 1,
    host: '0.peerjs.com',
    port: 443,
    path: '/',
    secure: true,
    pingInterval: 5000,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ]
    }
  });
}

function initPeerConnection() {
  if (peer && !peer.destroyed) {
    peer.destroy();
  }

  // Короткие, чистые ID без спецсимволов: spk_<комната>_<случайный_код>
  const cleanRoom = currentRoomId.replace(/[^a-zA-Z0-9]/g, '');
  if (isHost) {
    myPeerId = `spk_${cleanRoom}_host`;
  } else {
    const randomSuffix = Math.random().toString(36).substring(2, 7);
    myPeerId = `spk_${cleanRoom}_${randomSuffix}`;
  }

  try {
    peer = createPeerInstance(myPeerId);
  } catch (err) {
    console.error('Ошибка инициализации Peer:', err);
    peer = new Peer(myPeerId);
  }

  peer.on('open', (id) => {
    console.log('⚡ Spark Peer ID готов:', id);
    addSystemMessage(`Вы вошли в ${currentRoomId.toUpperCase()}`);

    if (isHost) {
      announcePresence();
    } else {
      const cleanRoom = currentRoomId.replace(/[^a-zA-Z0-9]/g, '');
      const hostPeerId = `spk_${cleanRoom}_host`;
      // Небольшая задержка перед подключением, чтобы сокет успел стабилизироваться
      setTimeout(() => {
        tryConnectToPeer(hostPeerId);
      }, 500);
      announcePresence();
    }
  });

  peer.on('call', (call) => {
    const streamToSend = getStreamToSend();
    call.answer(streamToSend);

    call.on('stream', (remoteStream) => {
      handleRemoteStream(call.peer, remoteStream);
    });

    call.on('close', () => {
      handlePeerDisconnect(call.peer);
    });

    if (!activePeers.has(call.peer)) {
      activePeers.set(call.peer, { call, conn: null, username: 'Участник', avatar: '', stream: null });
    } else {
      activePeers.get(call.peer).call = call;
    }
  });

  peer.on('connection', (conn) => {
    setupDataConnection(conn);
  });

  peer.on('disconnected', () => {
    console.warn('PeerJS отключился, переподключаемся...');
    if (peer && !peer.destroyed) {
      try { peer.reconnect(); } catch (e) {}
    }
  });

  peer.on('error', (err) => {
    console.warn('PeerJS статус:', err.type, err);
    if (err.type === 'unavailable-id') {
      if (isHost) {
        isHost = false;
        const cleanRoom = currentRoomId.replace(/[^a-zA-Z0-9]/g, '');
        const randomSuffix = Math.random().toString(36).substring(2, 7);
        myPeerId = `spk_${cleanRoom}_${randomSuffix}`;
        if (peer) peer.destroy();
        setTimeout(initPeerConnection, 400);
      }
    } else if (err.type === 'network' || err.type === 'server-error') {
      // Автоматическое восстановление соединения при обрыве сети
      setTimeout(() => {
        if (peer && peer.disconnected && !peer.destroyed) {
          try { peer.reconnect(); } catch (e) {}
        }
      }, 2000);
    } else if (err.type === 'peer-unavailable') {
      showToast('Хост комнаты не найден. Проверьте код комнаты.');
    }
  });
}

function tryConnectToPeer(targetPeerId) {
  if (targetPeerId === myPeerId || activePeers.has(targetPeerId)) return;

  console.log('Подключаемся к пиру:', targetPeerId);
  const conn = peer.connect(targetPeerId, {
    reliable: true,
    metadata: { username: currentUsername, avatar: currentAvatar }
  });

  setupDataConnection(conn);

  const streamToSend = getStreamToSend();
  if (streamToSend) {
    const call = peer.call(targetPeerId, streamToSend, {
      metadata: { username: currentUsername, avatar: currentAvatar }
    });

    if (call) {
      call.on('stream', (remoteStream) => {
        handleRemoteStream(targetPeerId, remoteStream);
      });

      call.on('close', () => {
        handlePeerDisconnect(targetPeerId);
      });

      activePeers.set(targetPeerId, { call, conn, username: 'Участник', avatar: '', stream: null });
    }
  }
}

function setupDataConnection(conn) {
  conn.on('open', () => {
    const peerId = conn.peer;
    const existing = activePeers.get(peerId) || {};
    existing.conn = conn;
    activePeers.set(peerId, existing);

    // Отправляем профиль: ник, аватар, пароль (если подключается гость к хосту)
    conn.send({
      type: 'handshake',
      username: currentUsername,
      avatar: currentAvatar,
      audio: isAudioEnabled,
      video: isVideoEnabled,
      screen: isScreenSharing,
      isHost: isHost,
      password: currentRoomPassword
    });

    const streamToSend = getStreamToSend();
    if (!existing.call && streamToSend) {
      const call = peer.call(peerId, streamToSend, {
        metadata: { username: currentUsername, avatar: currentAvatar }
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
    // Если мы хост и у нас установлен пароль — сверяем
    if (isHost && currentRoomPassword) {
      if (data.password !== currentRoomPassword) {
        connSend(senderId, { type: 'auth-failed', reason: 'Неверный пароль комнаты' });
        setTimeout(() => {
          handlePeerDisconnect(senderId);
        }, 500);
        return;
      }
    }

    const peerInfo = activePeers.get(senderId) || {};
    peerInfo.username = data.username || 'Участник';
    peerInfo.avatar = data.avatar || '';
    activePeers.set(senderId, peerInfo);

    addSystemMessage(`${peerInfo.username} в сети`);
    updatePeerCardInfo(senderId, peerInfo.username, peerInfo.avatar);
    updateUsersCount();

    activePeers.forEach((_, otherId) => {
      if (otherId !== senderId && otherId !== myPeerId) {
        connSend(senderId, { type: 'peer-hint', peerId: otherId });
      }
    });
  } else if (data.type === 'auth-failed') {
    showToast(data.reason || 'Ошибка авторизации');
    setTimeout(() => {
      if (peer) peer.destroy();
      window.location.href = window.location.pathname;
    }, 1500);
  } else if (data.type === 'profile-update') {
    const peerInfo = activePeers.get(senderId);
    if (peerInfo) {
      peerInfo.username = data.username || peerInfo.username;
      peerInfo.avatar = data.avatar || peerInfo.avatar;
      updatePeerCardInfo(senderId, peerInfo.username, peerInfo.avatar);
    }
  } else if (data.type === 'peer-hint') {
    if (data.peerId && data.peerId !== myPeerId && !activePeers.has(data.peerId)) {
      tryConnectToPeer(data.peerId);
    }
  } else if (data.type === 'chat') {
    const peerInfo = activePeers.get(senderId);
    if (peerInfo) {
      peerInfo.username = data.username || peerInfo.username;
      peerInfo.avatar = data.avatar || peerInfo.avatar;
      updatePeerCardInfo(senderId, peerInfo.username, peerInfo.avatar);
    }
  } else if (data.type === 'peer-hint') {
    if (data.peerId && data.peerId !== myPeerId && !activePeers.has(data.peerId)) {
      tryConnectToPeer(data.peerId);
    }
  } else if (data.type === 'chat') {
    const incomingMsg = {
      sender: data.sender,
      avatar: data.avatar,
      text: data.text,
      time: data.time,
      isMine: false
    };
    renderChatMessage(incomingMsg);
    saveMessageToRoomHistory(currentRoomId, incomingMsg);

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

// ==================== РЕНДЕР КАРТОЧЕК И ПОТОКОВ ====================

function handleRemoteStream(peerId, stream) {
  let peerInfo = activePeers.get(peerId);
  if (!peerInfo) {
    peerInfo = { call: null, conn: null, username: 'Участник', avatar: '', stream };
    activePeers.set(peerId, peerInfo);
  } else {
    peerInfo.stream = stream;
  }

  const card = addOrUpdateRemoteVideoCard(peerId, peerInfo.username, peerInfo.avatar, stream);
  const videoEl = card ? card.querySelector('video') : null;
  setupRemoteVAD(peerId, stream, videoEl);
  applySpeakerOutput(selectedSpeakerId);
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

function addOrUpdateRemoteVideoCard(peerId, username, avatar, stream) {
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
        <img class="remote-avatar-img" src="" alt="Avatar" style="display: none;" />
        <span class="initials">${initials}</span>
      </div>
      <div class="participant-badge">
        <div class="speaking-waves">
          <span></span><span></span><span></span>
        </div>
        <span class="user-name">${displayName}</span>
        <div class="peer-volume-control" title="Громкость участника">
          <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
          <input type="range" class="peer-volume-slider" min="0" max="150" value="100" />
        </div>
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

    // Обработчик регулятора громкости конкретного собеседника
    const volumeSlider = card.querySelector('.peer-volume-slider');
    const videoEl = card.querySelector('video');
    volumeSlider.addEventListener('input', (e) => {
      const vol = parseInt(e.target.value, 10) / 100;
      if (videoEl) videoEl.volume = Math.min(1, vol);
      const p = activePeers.get(peerId);
      if (p && p.gainNode) {
        p.gainNode.gain.value = vol;
      }
    });

    videoGrid.appendChild(card);
    updateGridLayout();
  }

  updatePeerCardInfo(peerId, username, avatar);

  const videoElement = card.querySelector('video');
  videoElement.srcObject = stream;
  return card;
}

function updatePeerCardInfo(peerId, username, avatar) {
  const card = document.getElementById(`card-${peerId}`);
  if (!card) return;

  const nameEl = card.querySelector('.user-name');
  const imgEl = card.querySelector('.remote-avatar-img');
  const initialsEl = card.querySelector('.initials');

  if (nameEl && username) nameEl.textContent = username;

  if (avatar) {
    if (imgEl) {
      imgEl.src = avatar;
      imgEl.style.display = 'block';
    }
    if (initialsEl) initialsEl.style.display = 'none';
  } else if (username) {
    if (imgEl) imgEl.style.display = 'none';
    if (initialsEl) {
      initialsEl.textContent = username.slice(0, 2).toUpperCase();
      initialsEl.style.display = 'block';
    }
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

  if (screen) {
    card.classList.add('screen-share');
    vid.style.display = 'block';
    if (fallback) fallback.style.display = 'none';
  } else {
    card.classList.remove('screen-share');
    if (typeof video === 'boolean') {
      if (video) {
        vid.style.display = 'block';
        if (fallback) fallback.style.display = 'none';
      } else {
        vid.style.display = 'none';
        if (fallback) fallback.style.display = 'flex';
      }
    }
  }

  if (typeof audio === 'boolean') {
    micIndicator.style.display = audio ? 'none' : 'inline-block';
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

// ==================== УПРАВЛЕНИЕ ЗВОНКОМ ====================

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
      localVideo.style.display = 'block';
      localAvatarFallback.style.display = 'none';
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
  if (!isVideoEnabled) {
    localVideo.style.display = 'none';
    localAvatarFallback.style.display = 'flex';
  } else {
    localVideo.style.display = 'block';
    localAvatarFallback.style.display = 'none';
  }

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

// Кастомное модальное окно подтверждения выхода
leaveRoomBtn.addEventListener('click', () => {
  leaveConfirmModal.classList.add('active');
});

cancelLeaveBtn.addEventListener('click', () => {
  leaveConfirmModal.classList.remove('active');
});

leaveConfirmModal.addEventListener('click', (e) => {
  if (e.target === leaveConfirmModal) {
    leaveConfirmModal.classList.remove('active');
  }
});

confirmLeaveBtn.addEventListener('click', async () => {
  if (isHost) {
    await dbDeactivateRoom(currentRoomId);
  }
  if (peer) peer.destroy();
  window.location.href = window.location.pathname;
});

// Копирование кода комнаты
copyCodeBtn.addEventListener('click', async () => {
  const code = currentRoomId.toUpperCase();
  try {
    await navigator.clipboard.writeText(code);
    copyCodeBtnText.textContent = 'Скопирован!';
    setTimeout(() => {
      copyCodeBtnText.textContent = 'Код';
    }, 2000);
  } catch (err) {
    prompt('Код комнаты:', code);
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

// ==================== ЧАТ И СООБЩЕНИЯ ====================

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
    avatar: currentAvatar,
    text: text,
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    isMine: true
  };

  renderChatMessage(msgData);
  saveMessageToRoomHistory(currentRoomId, msgData);
  broadcastData({ type: 'chat', ...msgData });

  chatInput.value = '';
});

// Загрузка сохраненного чата при входе в комнату
function loadSavedRoomChat(roomId) {
  chatMessages.innerHTML = '';
  const saved = getSavedRoomMessages(roomId);
  if (saved.length > 0) {
    addSystemMessage(`История чата (${saved.length} сообщений)`);
    saved.forEach(msg => {
      renderChatMessage(msg);
    });
  }
}

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

  let avatarHtml = '';
  if (msg.avatar) {
    avatarHtml = `<img src="${msg.avatar}" alt="Avatar" />`;
  } else {
    avatarHtml = `<span>${(msg.sender || 'U').slice(0, 2).toUpperCase()}</span>`;
  }

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
    <div class="chat-user-avatar">${avatarHtml}</div>
    <div class="message-content-box">
      <div class="message-meta">
        <span class="sender">${escapeHtml(msg.sender)}</span>
        <span class="time">${msg.time}</span>
      </div>
      <div class="message-bubble">
        ${parsed.html}
        ${previewHtml}
      </div>
    </div>
  `;

  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Запуск при старте
restoreUserData();
initLobbyPreview();
fetchOnlineRooms();
