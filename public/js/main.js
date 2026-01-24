// [Conteúdo de main.pdf com localStorage isolado por sala]
let socket = null;
let isAdminMode = false;
let currentRoom = '';
let cardType = '';
let playerCards = [];
let roomsDrawnNumbers = [];
let gameEnded = false;
let playerName = '';
let currentStage = 'linha1';
let roomsState = {};

const SOCKET_URL = 'https://bingo-online-production.up.railway.app';
socket = io(SOCKET_URL, { transports: ['websocket'], reconnection: true, reconnectionAttempts: Infinity });

// --- Funções de Estado do Jogador (com roomType) ---
function loadGameState(name, roomType) {
  try {
    const key = `bingo_player_${name}_${roomType}`;
    const saved = localStorage.getItem(key);
    if (!saved) return null;
    const data = JSON.parse(saved);
    if (typeof data.chips !== 'number' || data.chips < 0) data.chips = 10000;
    if (!Array.isArray(data.cards90)) data.cards90 = [];
    if (!Array.isArray(data.cards75)) data.cards75 = [];
    return data;
  } catch (e) {
    console.warn('Erro ao carregar estado. Limpando.');
    localStorage.removeItem(`bingo_player_${name}_${roomType}`);
    return null;
  }
}

function saveGameState(name, roomType, chips, cards75, cards90) {
  try {
    const key = `bingo_player_${name}_${roomType}`;
    localStorage.setItem(key, JSON.stringify({ chips, cards75, cards90 }));
  } catch (e) {
    console.warn('Não foi possível salvar o estado do jogo:', e);
  }
}

// --- Demais funções permanecem iguais, mas chamam load/save com roomType ---
// Exemplo em joinRoom:
window.joinRoom = function(roomType) {
  let name = playerNameInput.value.trim();
  name = name.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').substring(0, 15).trim() || 'Anônimo';
  if (name === 'Anônimo' || name.length < 2) {
    alert('Nome inválido. Use apenas letras (2-15 caracteres).');
    return;
  }
  playerName = name;
  const savedState = loadGameState(name, roomType); // ← aqui
  const savedCards75 = savedState ? savedState.cards75 : null;
  const savedCards90 = savedState ? savedState.cards90 : null;
  const savedChips = savedState ? savedState.chips : null;
  socket.emit('join-room', { playerName: name, roomType, savedChips, savedCards75, savedCards90 });
};

// Em room-state:
socket.on('room-state', (data) => {
  roomsState = data;
  document.getElementById('player-name-display').textContent = data.players[socket.id]?.name || '?';
  roomsDrawnNumbers = data.drawnNumbers || [];
  ballsCountDisplay.textContent = roomsDrawnNumbers.length;
  updateHistory(data.drawnNumbers || []);
  if (data.lastNumber) document.getElementById('last-number').textContent = data.lastNumber;
  updateControlButtons(data.currentStage || 'linha1');
  const player = data.players[socket.id];
  if (player) saveGameState(playerName, currentRoom, player.chips, player.cards75, player.cards90); // ← aqui
  refreshAllChipDisplays();
});

// Em cards-received:
socket.on('cards-received', (data) => {
  const newCards = data.cards.map(cardObj => ({ card: cardObj.card, originalIndex: playerCards.length }));
  playerCards = playerCards.concat(newCards);
  const currentState = loadGameState(playerName, currentRoom) || {}; // ← aqui
  if (data.cardType === '75') {
    currentState.cards75 = currentState.cards75 || [];
    data.cards.forEach(c => currentState.cards75.push(c.card));
  } else {
    currentState.cards90 = currentState.cards90 || [];
    data.cards.forEach(c => currentState.cards90.push(c.card));
  }
  saveGameState(playerName, currentRoom, currentState.chips || 10000, currentState.cards75, currentState.cards90); // ← aqui
  requestAnimationFrame(() => {
    renderCards();
    roomsDrawnNumbers.forEach(num => markDrawnNumbers(num));
  });
});

// Em room-reset:
socket.on('room-reset', () => {
  roomsDrawnNumbers = [];
  playerCards = [];
  gameEnded = false;
  document.getElementById('cards-container').innerHTML = '';
  document.getElementById('last-number').textContent = '-';
  document.getElementById('balls-count').textContent = '0';
  document.getElementById('history').innerHTML = '';
  document.getElementById('chat-messages').innerHTML = '';
  localStorage.removeItem(`bingo_player_${playerName}_${currentRoom}`); // ← aqui
  renderCards();
  updateControlButtons('linha1');
  roomsState = {};
  refreshAllChipDisplays();
  const chipsBg = document.getElementById('chips-background');
  if (chipsBg) chipsBg.style.display = 'none';
});
