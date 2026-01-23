// ✅ Variáveis globais
let socket = null;
let isAdminMode = false;
let currentRoom = '';
let cardType = '';
let playerCards = [];
let roomsDrawnNumbers = [];
let gameEnded = false;
let playerName = '';
let currentStage = 'linha1';

// ✅ CONEXÃO
const SOCKET_URL = 'https://bingo-online-production.up.railway.app';
socket = io(SOCKET_URL, {
transports: ['websocket'],
reconnection: true,
reconnectionAttempts: Infinity
});

// ✅ Funções de Administração
function toggleAdminMode() {
const controls = document.getElementById('admin-controls');
controls.style.display = isAdminMode ? 'none' : 'block';
isAdminMode = !isAdminMode;
}

function showAdminMessage(message, type = 'info') {
const msgElement = document.getElementById('admin-message');
msgElement.textContent = message;
msgElement.style.display = 'block';
msgElement.style.background = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
setTimeout(() => msgElement.style.display = 'none', 5000);
}

function sendAdminCommand() {
const playerName = document.getElementById('admin-player-name').value;
const amount = parseInt(document.getElementById('admin-amount').value);
const password = document.getElementById('admin-password').value;
if (!playerName || isNaN(amount) || !password) {
alert('Preencha todos os campos.');
return;
}
socket.emit('admin-add-chips', { playerName, amount, adminPassword: password });
document.getElementById('admin-player-name').value = '';
document.getElementById('admin-amount').value = '';
document.getElementById('admin-password').value = '';
}

let clickCount = 0;
let clickTimer = null;
document.getElementById('player-name').addEventListener('click', function() {
clickCount++;
if (clickTimer) clearTimeout(clickTimer);
clickTimer = setTimeout(() => clickCount = 0, 500);
if (clickCount === 5) {
toggleAdminMode();
clickCount = 0;
clearTimeout(clickTimer);
}
});

// ✅ Funções de Estado do Jogador
function loadGameState(name) {
try {
const saved = localStorage.getItem(`bingo_player_${name}`);
if (!saved) return null;
const data = JSON.parse(saved);
if (typeof data.chips !== 'number' || data.chips < 0) data.chips = 10000;
if (!Array.isArray(data.cards90)) data.cards90 = [];
if (!Array.isArray(data.cards75)) data.cards75 = [];
return data;
} catch (e) {
console.warn('Erro ao carregar estado. Limpando.');
localStorage.removeItem(`bingo_player_${name}`);
return null;
}
}

function saveGameState(name, chips, cards75, cards90) {
try {
localStorage.setItem(`bingo_player_${name}`, JSON.stringify({ chips, cards75, cards90 }));
} catch (e) {
console.warn('Não foi possível salvar o estado do jogo:', e);
}
}

// ✅ Atualização de interface
function updateControlButtons(stage) {
if (!stage) return;
currentStage = stage;
document.getElementById('main-controls').className = `controls stage-${stage}`;
}

// ✅ Restante principal
document.addEventListener('DOMContentLoaded', () => {
function initAudio() {
if (!audioContext) {
const AudioContext = window.AudioContext || window.webkitAudioContext;
if (AudioContext) {
audioContext = new AudioContext();
}
}
document.body.removeEventListener('click', initAudio);
document.body.removeEventListener('touchstart', initAudio);
}
document.body.addEventListener('click', initAudio);
document.body.addEventListener('touchstart', initAudio);

const playerNameInput = document.getElementById('player-name');
const loginScreen = document.getElementById('login-screen');
const gameArea = document.getElementById('game-area');
const potDisplay = document.getElementById('pot-display');
const jackpotDisplay = document.getElementById('jackpot-display');
const ballsCountDisplay = document.getElementById('balls-count');

window.joinRoom = function(roomType) {
let name = playerNameInput.value.trim();
name = name.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').substring(0, 15).trim() || 'Anônimo';
if (name === 'Anônimo' || name.length < 2) {
alert('Nome inválido. Use apenas letras (2-15 caracteres).');
return;
}
playerName = name;
const savedState = loadGameState(name);
const savedCards75 = savedState ? savedState.cards75 : null;
const savedCards90 = savedState ? savedState.cards90 : null;
const savedChips = savedState ? savedState.chips : null;
socket.emit('join-room', { playerName: name, roomType, savedChips, savedCards75, savedCards90 });
};

// ✅ Socket Listeners
socket.on('room-welcome', (data) => {
currentRoom = data.roomId;
cardType = currentRoom === 'bingo75' ? '75' : '90';
loginScreen.style.display = 'none';
gameArea.style.display = 'block';
document.getElementById('room-title').textContent = `Sala: ${data.roomName}`;
gameEnded = data.gameCompleted || false;
updateControlButtons(data.currentStage || 'linha1');
});

socket.on('room-state', (data) => {
document.getElementById('player-name-display').textContent = data.players[socket.id]?.name || '?';
const chips = data.players[socket.id]?.chips || 10000;
document.getElementById('chips-display').textContent = chips.toLocaleString('pt-BR');
roomsDrawnNumbers = data.drawnNumbers || [];
ballsCountDisplay.textContent = roomsDrawnNumbers.length;
updateHistory(data.drawnNumbers || []);
if (data.lastNumber) document.getElementById('last-number').textContent = data.lastNumber;
updateControlButtons(data.currentStage || 'linha1');
const player = data.players[socket.id];
if (player) saveGameState(playerName, player.chips, player.cards75, player.cards90);
});

socket.on('pot-update', (data) => {
potDisplay.textContent = `Pote: R$ ${data.pot.toLocaleString('pt-BR')}`;
jackpotDisplay.textContent = `Jackpot: R$ ${data.jackpot.toLocaleString('pt-BR')}`;
});

socket.on('player-list', (data) => {
const withoutList = document.getElementById('without-chips-list').querySelector('ul');
const withList = document.getElementById('with-chips-list').querySelector('ul');
withoutList.innerHTML = '';
withList.innerHTML = '';
document.getElementById('no-chips-count').textContent = data.withoutChips.length;
document.getElementById('with-chips-count').textContent = data.withChips.length;
data.withoutChips.forEach(p => {
const li = document.createElement('li');
li.textContent = p.name;
li.classList.add('x-out');
withoutList.appendChild(li);
});
data.withChips.forEach(p => {
const li = document.createElement('li');
li.innerHTML = `<span>${p.name}</span><span>R$ ${p.chips.toLocaleString('pt-BR')}</span>`;
if (p.currentWins > 0) li.classList.add('winner');
withList.appendChild(li);
});
});

socket.on('ranking-update', (ranking) => {
const rankingList = document.getElementById('ranking-list');
rankingList.innerHTML = '';
ranking.forEach(player => {
const li = document.createElement('li');
li.innerHTML = `
<div class="ranking-position">${player.position}º</div>
<div class="ranking-name">${player.name}</div>
<div class="ranking-chips">R$ ${player.chips.toLocaleString('pt-BR')}</div>
`;
rankingList.appendChild(li);
});
});

socket.on('update-player', (data) => {
document.getElementById('chips-display').textContent = data.chips.toLocaleString('pt-BR');
const currentState = loadGameState(playerName) || {};
saveGameState(playerName, data.chips, currentState.cards75 || [], currentState.cards90 || []);
});

// ✅ Receber mensagens do chat
socket.on('chat-message', (data) => {
addChatMessage(data.message, data.sender, data.isBot, data.sender === "Sistema");
});

socket.on('cards-received', (data) => {
const newCards = data.cards.map(cardObj => ({
card: cardObj.card,
originalIndex: playerCards.length
}));
playerCards = playerCards.concat(newCards);
const currentState = loadGameState(playerName) || {};
if (data.cardType === '75') {
currentState.cards75 = currentState.cards75 || [];
data.cards.forEach(c => currentState.cards75.push(c.card));
} else {
currentState.cards90 = currentState.cards90 || [];
data.cards.forEach(c => currentState.cards90.push(c.card));
}
saveGameState(playerName, currentState.chips || 10000, currentState.cards75, currentState.cards90);
requestAnimationFrame(() => {
renderCards();
roomsDrawnNumbers.forEach(num => markDrawnNumbers(num));
});
});

socket.on('number-drawn', (data) => {
document.getElementById('last-number').textContent = data.number;
roomsDrawnNumbers = data.drawnNumbers;
ballsCountDisplay.textContent = roomsDrawnNumbers.length;
updateHistory(data.drawnNumbers);
markDrawnNumbers(data.number);
renderCards();
playSound('sorteio', data.number);
speak(data.number.toString());
});

socket.on('player-won', (data) => {
if (data.winners[0].winType === 'linha1') {
playSound('linha1');
speak(`Linha 1 ganha por ${data.winnerNames}!`);
checkAchievements('linha1', 0);
showLineVictory(data.totalPrize, data.winnerNames);
} else if (data.winners[0].winType === 'linha2') {
playSound('linha2');
speak(`Linhas completas por ${data.winnerNames}!`);
checkAchievements('linha2', 0);
showLine2Victory(data.totalPrize, data.winnerNames);
} else if (data.winners[0].winType === 'bingo') {
playSound('bingo');
speak(`Bingo feito por ${data.winnerNames}!`);
checkAchievements('bingo', 0, data.ballsCount);
showBingoVictory(data.totalPrize, data.winnerNames);
}
if (data.newStage) updateControlButtons(data.newStage);
if (data.winners[0].winType === 'bingo') gameEnded = true;
});

socket.on('jackpot-won', (data) => {
showJackpotVictory(data.jackpotAmount, data.winnerNames, data.ballsCount);
});

socket.on('show-restart-button', () => { gameEnded = true; });
socket.on('game-over', () => { gameEnded = true; });
socket.on('room-reset', () => {
roomsDrawnNumbers = [];
playerCards = [];
gameEnded = false;
document.getElementById('cards-container').innerHTML = '';
document.getElementById('last-number').textContent = '-';
document.getElementById('balls-count').textContent = '0';
document.getElementById('history').innerHTML = '';
document.getElementById('chat-messages').innerHTML = '';
localStorage.removeItem(`bingo_player_${playerName}`);
renderCards();
updateControlButtons('linha1');
});
socket.on('error', (msg) => showAdminMessage(msg, 'error'));
socket.on('message', (msg) => showAdminMessage(msg, 'success'));

// ✅ Eventos de compra e controles
document.getElementById('buy-btn').addEventListener('click', () => {
if (gameEnded) {
alert('O jogo terminou. Clique em "Reiniciar Jogo".');
return;
}
const count = parseInt(document.getElementById('card-count').value) || 1;
if (count < 1 || count > 10) {
alert('Digite um valor entre 1 e 10.');
return;
}
socket.emit('buy-cards', { count, cardType });
});

document.getElementById('start-btn').addEventListener('click', () => {
if (gameEnded) return;
socket.emit('start-draw');
});

document.getElementById('line1-btn').addEventListener('click', () => {
if (gameEnded) return;
socket.emit('claim-win', { winType: 'linha1' });
});

document.getElementById('line2-btn').addEventListener('click', () => {
if (gameEnded) return;
socket.emit('claim-win', { winType: 'linha2' });
});

document.getElementById('bingo-btn').addEventListener('click', () => {
if (gameEnded) return;
socket.emit('claim-win', { winType: 'bingo' });
});

document.getElementById('restart-btn').addEventListener('click', () => {
if (confirm('Deseja reiniciar o jogo?')) {
socket.emit('restart-game');
}
});

window.addEventListener('beforeunload', (e) => {
if (currentRoom && !gameEnded) {
e.preventDefault();
e.returnValue = '';
return '';
}
});

// ✅ Funções auxiliares
function updateHistory(numbers) {
const hist = document.getElementById('history');
hist.innerHTML = '';
[...numbers].reverse().forEach(num => {
const span = document.createElement('span');
span.className = 'ball';
span.textContent = num;
hist.appendChild(span);
});
}

function markDrawnNumbers(number) {
const numStr = String(number);
document.querySelectorAll(`.cell[data-num="${numStr}"]`).forEach(cell => {
cell.classList.add('marked');
});
}

function renderCards() {
const container = document.getElementById('cards-container');
container.innerHTML = '';
const validCards = playerCards.filter(item =>
item && item.card &&
((cardType === '75' && item.card.length === 25) ||
(cardType === '90' && item.card.length === 3 && item.card.every(row => Array.isArray(row) && row.length === 9)))
);
const sortedCards = [...validCards].sort((a, b) => {
const ballsA = getBallsLeftForCurrentStage(a.card, roomsDrawnNumbers, currentStage);
const ballsB = getBallsLeftForCurrentStage(b.card, roomsDrawnNumbers, currentStage);
return ballsA - ballsB;
});
sortedCards.forEach((item, idx) => {
item.index = idx;
});
sortedCards.forEach(item => {
const wrapper = document.createElement('div');
wrapper.className = 'card-wrapper';
const ballsLeftForStage = getBallsLeftForCurrentStage(item.card, roomsDrawnNumbers, currentStage);
if (ballsLeftForStage === 1) {
wrapper.classList.add('near-win');
}
wrapper.innerHTML = `<div class="card-title">Cartela ${item.index + 1}</div>`;
const grid = document.createElement('div');
grid.className = cardType === '75' ? 'grid-75' : 'grid-90';
if (cardType === '90') {
const markedInRow = [0, 0, 0];
for (let r = 0; r < 3; r++) {
for (let c = 0; c < 9; c++) {
const num = item.card[r][c];
if (num !== null && roomsDrawnNumbers.includes(num)) {
markedInRow[r]++;
}
}
}
const completedLines = [];
if (markedInRow[0] >= 5) completedLines.push(0);
if (markedInRow[1] >= 5) completedLines.push(1);
if (markedInRow[2] >= 5) completedLines.push(2);
const bingo = completedLines.length >= 3;
for (let r = 0; r < 3; r++) {
for (let c = 0; c < 9; c++) {
const cell = document.createElement('div');
cell.className = 'cell';
const val = item.card[r][c];
if (val !== null) {
cell.textContent = val.toString();
cell.dataset.num = val.toString();
if (roomsDrawnNumbers.includes(val)) {
cell.classList.add('marked');
}
if (bingo) {
// será tratado no wrapper
} else if (completedLines.length >= 2) {
if (completedLines[0] === r) {
cell.style.backgroundColor = '#27ae60';
cell.style.color = 'white';
} else if (completedLines.includes(r)) {
cell.style.backgroundColor = '#8e44ad';
cell.style.color = 'white';
}
} else if (completedLines.length >= 1 && completedLines[0] === r) {
cell.style.backgroundColor = '#27ae60';
cell.style.color = 'white';
}
} else {
cell.classList.add('empty');
}
grid.appendChild(cell);
}
}
if (bingo) {
wrapper.className = 'card-wrapper bingo-complete';
const overlay = document.createElement('div');
overlay.className = 'bingo-overlay';
overlay.textContent = 'BINGO!';
wrapper.appendChild(overlay);
}
} else {
for (let i = 0; i < 25; i++) {
const cell = document.createElement('div');
cell.className = 'cell';
if (item.card[i] === 'FREE') {
cell.textContent = '★';
cell.classList.add('free');
} else {
cell.textContent = item.card[i].toString();
cell.dataset.num = item.card[i].toString();
if (roomsDrawnNumbers.includes(item.card[i])) {
cell.classList.add('marked');
}
}
grid.appendChild(cell);
}
}
wrapper.appendChild(grid);
container.appendChild(wrapper);
});
if (cardType === '90' && sortedCards.length > 0 && validationWorker) {
const cardsToValidate = sortedCards.slice(0, 100).map(item => item.card);
validationWorker.postMessage({ cards: cardsToValidate, drawnNumbers: roomsDrawnNumbers });
validationWorker.onmessage = (e) => {
const results = e.data;
const wrappers = container.querySelectorAll('.card-wrapper');
results.forEach((res, idx) => {
if (idx < wrappers.length) {
const wrapper = wrappers[idx];
if (!res.valid) {
wrapper.style.opacity = '0.6';
wrapper.title = 'Cartela inválida (≠15 números)';
}
}
});
};
}
});
