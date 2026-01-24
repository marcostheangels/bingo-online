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
let roomsState = {}; // ← Estado global da sala

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

document.addEventListener('DOMContentLoaded', () => {
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

// ✅ Atualização de interface com cores forçadas e reset automático
function updateControlButtons(stage) {
  if (!stage) return;
  currentStage = stage;
  document.getElementById('main-controls').className = `controls stage-${stage}`;
  const stageText = document.getElementById('stage-text');
  const nearLine1 = document.getElementById('near-line1');
  const nearLine2 = document.getElementById('near-line2');

  // Função para aplicar cor com !important
  function setTextColor(el, color) {
    if (el) {
      el.style.setProperty('color', color, 'important');
      el.style.fontWeight = 'bold';
    }
  }

  if (stageText) {
    if (stage === 'linha1') {
      stageText.textContent = 'Linha 1';
      setTextColor(stageText, '#66bb6a'); // verde
    } else if (stage === 'linha2') {
      stageText.textContent = 'Linha 2';
      setTextColor(stageText, '#ab47bc'); // roxo
      if (nearLine1) nearLine1.textContent = '0';
    } else if (stage === 'bingo') {
      stageText.textContent = 'BINGO!';
      setTextColor(stageText, '#ffd700'); // dourado
      if (nearLine2) nearLine2.textContent = '0';
    }
  }

  // Cores nos botões reais (opcional)
  const line2Btn = document.getElementById('line2-btn');
  const bingoBtn = document.getElementById('bingo-btn');
  if (line2Btn) line2Btn.style.backgroundColor = '';
  if (bingoBtn) bingoBtn.style.backgroundColor = '';
  if (stage === 'linha2' && line2Btn) line2Btn.style.backgroundColor = '#ab47bc';
  if (stage === 'bingo' && bingoBtn) bingoBtn.style.backgroundColor = '#ffd700';
}

// ✅ Função centralizada para atualizar TUDO relacionado a chips
function refreshAllChipDisplays() {
  const player = socket.id ? roomsState?.players?.[socket.id] : null;
  if (player) {
    document.getElementById('chips-display').textContent = player.chips.toLocaleString('pt-BR');
  }
  if (roomsState?.pot != null) {
    document.getElementById('pot-display').textContent = `Pote: R$ ${roomsState.pot.toLocaleString('pt-BR')}`;
  }
  if (roomsState?.jackpot != null) {
    document.getElementById('jackpot-display').textContent = `Jackpot: R$ ${roomsState.jackpot.toLocaleString('pt-BR')}`;
  }
  if (roomsState?.players) {
    const playersArray = Object.entries(roomsState.players).map(([id, p]) => ({ id, ...p }));
    const withoutChips = playersArray.filter(p => p.chips <= 0);
    const withChips = playersArray.filter(p => p.chips > 0).sort((a, b) => b.chips - a.chips);
    document.getElementById('no-chips-count').textContent = withoutChips.length;
    document.getElementById('with-chips-count').textContent = withChips.length;

    const withoutList = document.getElementById('without-chips-list').querySelector('ul');
    const withList = document.getElementById('with-chips-list').querySelector('ul');
    withoutList.innerHTML = '';
    withList.innerHTML = '';

    withoutChips.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p.name;
      li.classList.add('x-out');
      withoutList.appendChild(li);
    });

    withChips.forEach(p => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${p.name}</span><span>R$ ${p.chips.toLocaleString('pt-BR')}</span>`;
      if (p.currentWins > 0) li.classList.add('winner');
      withList.appendChild(li);
    });
  }
  if (roomsState?.players) {
    const ranked = Object.entries(roomsState.players)
      .map(([id, p]) => ({ id, name: p.name, chips: p.chips, isBot: p.isBot }))
      .sort((a, b) => b.chips - a.chips)
      .map((p, i) => ({ ...p, position: i + 1 }));
    const rankingList = document.getElementById('ranking-list');
    rankingList.innerHTML = '';
    ranked.forEach(player => {
      const li = document.createElement('li');
      let trophy = '';
      let bgColor = '';
      let textColor = 'white';
      if (player.position === 1) {
        trophy = '🥇';
        bgColor = '#FFD700';
        textColor = '#1a1a2e';
      } else if (player.position === 2) {
        trophy = '🥈';
        bgColor = '#C0C0C0';
        textColor = '#1a1a2e';
      } else if (player.position === 3) {
        trophy = '🥉';
        bgColor = '#CD7F32';
        textColor = '#1a1a2e';
      }
      li.innerHTML = `
        <div class="ranking-position">${player.position}º</div>
        <div class="ranking-name">${trophy} ${player.name}</div>
        <div class="ranking-chips">R$ ${player.chips.toLocaleString('pt-BR')}</div>
      `;
      if (bgColor) {
        li.style.background = `${bgColor}20`;
        li.style.borderLeft = `5px solid ${bgColor}`;
        li.style.color = textColor;
      }
      rankingList.appendChild(li);
    });
  }
}

// ✅ FUNDO DINÂMICO DE FICHAS NA SALA
function startChipsBackground() {
  const container = document.getElementById('chips-background');
  if (!container || currentRoom !== 'bingo90') {
    if (container) container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.innerHTML = ''; // Limpa chips antigos
  const colors = ['#e63946', '#ffd700', '#1d3557', '#52b788', '#333333'];
  const interval = setInterval(() => {
    const chip = document.createElement('div');
    chip.className = 'chip-bg';
    const size = Math.random() * (70 - 30) + 30;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const startPos = Math.random() * 100;
    const duration = Math.random() * (12 - 6) + 6;
    const rotation = Math.random() * 360;

    chip.style.width = `${size}px`;
    chip.style.height = `${size}px`;
    chip.style.backgroundColor = color;
    chip.style.left = `${startPos}%`;
    chip.style.bottom = `-100px`;
    chip.style.opacity = Math.random() * (0.7 - 0.3) + 0.3;

    container.appendChild(chip);

    const animation = chip.animate([
      { transform: `translateY(0) rotate(${rotation}deg)`, opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { transform: `translateY(-120vh) rotate(${rotation + 720}deg)`, opacity: 0 }
    ], {
      duration: duration * 1000,
      easing: 'linear'
    });

    animation.onfinish = () => chip.remove();
  }, 500);
  window.chipsBackgroundInterval = interval;
}

// ✅ Restante principal
document.addEventListener('DOMContentLoaded', () => {
  const playerNameInput = document.getElementById('player-name');
  const loginScreen = document.getElementById('login-screen');
  const gameArea = document.getElementById('game-area');
  const potDisplay = document.getElementById('pot-display');
  const jackpotDisplay = document.getElementById('jackpot-display');
  const ballsCountDisplay = document.getElementById('balls-count');
  const lastNumberDisplay = document.getElementById('last-number');

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

  document.getElementById('join-bingo75').addEventListener('click', () => joinRoom('bingo75'));
  document.getElementById('join-bingo90').addEventListener('click', () => joinRoom('bingo90'));
  document.getElementById('set-10-cards').addEventListener('click', () => {
    document.getElementById('card-count').value = 10;
  });
  document.getElementById('send-admin-command').addEventListener('click', sendAdminCommand);

  socket.on('room-welcome', (data) => {
    currentRoom = data.roomId;
    cardType = currentRoom === 'bingo75' ? '75' : '90';
    loginScreen.style.display = 'none';
    gameArea.style.display = 'block';
    document.getElementById('room-title').textContent = `Sala: ${data.roomName}`;
    gameEnded = data.gameCompleted || false;
    updateControlButtons(data.currentStage || 'linha1');
    // ✅ ATIVA FUNDO DINÂMICO APÓS ENTRAR NA SALA
    setTimeout(() => startChipsBackground(), 100);
  });

  socket.on('room-state', (data) => {
    roomsState = data;
    document.getElementById('player-name-display').textContent = data.players[socket.id]?.name || '?';
    roomsDrawnNumbers = data.drawnNumbers || [];
    ballsCountDisplay.textContent = roomsDrawnNumbers.length;
    updateHistory(data.drawnNumbers || []);
    if (data.lastNumber) document.getElementById('last-number').textContent = data.lastNumber;
    updateControlButtons(data.currentStage || 'linha1');
    const player = data.players[socket.id];
    if (player) saveGameState(playerName, player.chips, player.cards75, player.cards90);
    refreshAllChipDisplays();
  });

  // ✅ Receber "cartelas na boa"
  socket.on('near-win-stats', (stats) => {
    const nearLine1 = document.getElementById('near-line1');
    const nearLine2 = document.getElementById('near-line2');
    const nearBingo = document.getElementById('near-bingo');
    if (currentStage === 'linha1') {
      if (nearLine1) nearLine1.textContent = stats.line1 || 0;
      if (nearLine2) nearLine2.textContent = stats.line2 || 0;
    } else if (currentStage === 'linha2') {
      if (nearLine2) nearLine2.textContent = stats.line2 || 0;
    }
    if (nearBingo) nearBingo.textContent = stats.bingo || 0;
  });

  socket.on('pot-update', (data) => {
    if (!roomsState) roomsState = {};
    roomsState.pot = data.pot;
    roomsState.jackpot = data.jackpot;
    refreshAllChipDisplays();
  });

  socket.on('player-list', (data) => {
    refreshAllChipDisplays();
  });

  socket.on('update-player', (data) => {
    if (roomsState?.players?.[socket.id]) {
      roomsState.players[socket.id].chips = data.chips;
    }
    refreshAllChipDisplays();
  });

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
    // Atualiza bolas restantes para jackpot
    const remainingForJackpot = Math.max(0, 60 - roomsDrawnNumbers.length);
    document.getElementById('jackpot-remaining').textContent = `Bolas restantes para Jackpot: ${remainingForJackpot}`;
  });

  socket.on('player-won', (data) => {
  const winType = data.winners[0]?.winType;
  const isJackpot = data.wonJackpot;

  if (winType === 'linha1') {
    playSound('linha1');
    speak(`Linha 1 ganha por ${data.winnerNames}!`);
    showLineVictory(data.totalPrize, data.winnerNames);
  } else if (winType === 'linha2') {
    playSound('linha2');
    speak(`Linha 2 ganha por ${data.winnerNames}!`);
    showLine2Victory(data.totalPrize, data.winnerNames);
  } else if (winType === 'linha3') {
    playSound('linha3');
    speak(`Linha Diagonal ganha por ${data.winnerNames}!`);
    showLine3Victory(data.totalPrize, data.winnerNames); // ← Isso já está correto!
  } else if (winType === 'bingo') {
    playSound('bingo');
    speak(`Bingo feito por ${data.winnerNames}!`);
    if (isJackpot) {
      showJackpotVictory(data.jackpotAmount || data.totalPrize, data.winnerNames, data.ballsCount);
    } else {
      showBingoVictory(data.totalPrize, data.winnerNames);
    }
  }

    if (data.newStage) updateControlButtons(data.newStage);
    if (winType === 'bingo') gameEnded = true;

    setTimeout(() => {
      socket.emit('sync-state');
    }, 500);
  });

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
    roomsState = {};
    refreshAllChipDisplays();
    // Limpa fundo ao reiniciar
    const chipsBg = document.getElementById('chips-background');
    if (chipsBg) chipsBg.style.display = 'none';
  });

  socket.on('error', (msg) => showAdminMessage(msg, 'error'));
  socket.on('message', (msg) => showAdminMessage(msg, 'success'));

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

  if ('wakeLock' in navigator) {
    const gameObserver = new MutationObserver(() => {
      if (gameArea.style.display === 'block') {
        navigator.wakeLock.request('screen').catch(err => console.warn('Wake Lock:', err));
      }
    });
    gameObserver.observe(gameArea, { attributes: true, attributeFilter: ['style'] });
  }

  window.addEventListener('beforeunload', (e) => {
    if (currentRoom && !gameEnded) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    // Limpa intervalo ao sair
    if (window.chipsBackgroundInterval) {
      clearInterval(window.chipsBackgroundInterval);
    }
  });

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

  function getBallsLeftForCurrentStage(card, drawnNumbers, stage) {
    if (cardType === '75') {
      const marked = card.map(n => n === 'FREE' || drawnNumbers.includes(n));
      const totalMarked = marked.filter(Boolean).length;
      return 24 - totalMarked; // 24 números reais
    } else {
      let markedInRow = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 9; c++) {
          if (card[r][c] !== null && drawnNumbers.includes(card[r][c])) {
            markedInRow[r]++;
          }
        }
      }
      if (stage === 'linha1') {
        return Math.min(5 - markedInRow[0], 5 - markedInRow[1], 5 - markedInRow[2]);
      } else if (stage === 'linha2') {
        const sorted = [...markedInRow].sort((a, b) => b - a);
        return (5 - sorted[0]) + (5 - sorted[1]);
      } else {
        return 15 - markedInRow.reduce((a, b) => a + b, 0);
      }
    }
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
      // --- RENDERIZAÇÃO DO BINGO 90 (3x9) ---
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
          } else {
            cell.classList.add('empty');
          }
          grid.appendChild(cell);
        }
      }

      if (bingo) {
        wrapper.className = 'card-wrapper bingo-complete';
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.display = 'flex';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.zIndex = '10';
        overlay.style.pointerEvents = 'none';

        const bingoText = document.createElement('div');
        bingoText.textContent = 'BINGO!';
        bingoText.style.color = 'white';
        bingoText.style.fontSize = '2.4em';
        bingoText.style.fontWeight = '900';
        bingoText.style.fontFamily = "'Montserrat', sans-serif";
        bingoText.style.textShadow = `
          0 0 8px rgba(0, 0, 0, 0.8),
          0 0 16px rgba(255, 215, 0, 0.6),
          0 0 24px rgba(255, 215, 0, 0.4)
        `;
        bingoText.style.letterSpacing = '2px';
        bingoText.style.textAlign = 'center';
        bingoText.style.background = 'rgba(0, 0, 0, 0.5)';
        bingoText.style.padding = '8px 20px';
        bingoText.style.borderRadius = '10px';
        bingoText.style.backdropFilter = 'blur(3px)';
        bingoText.style.webkitBackdropFilter = 'blur(3px)';
        overlay.appendChild(bingoText);
        wrapper.appendChild(overlay);
      }
    } else {
      // --- RENDERIZAÇÃO CORRETA DO BINGO 75 (5x5) ---
      for (let i = 0; i < 25; i++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const val = item.card[i];
        if (val === 'FREE') {
          cell.textContent = '★';
          cell.classList.add('free');
        } else {
          cell.textContent = val.toString();
          cell.dataset.num = val.toString();
          if (roomsDrawnNumbers.includes(val)) {
            cell.classList.add('marked');
          }
        }
        grid.appendChild(cell);
      }
    }

    wrapper.appendChild(grid);
    container.appendChild(wrapper);
  });
}

  // Funções auxiliares de som e voz (mantidas como placeholders)
  function playSound(type, number) { /* implementar se desejar */ }
  function speak(text) { /* implementar se desejar */ }
  function checkAchievements(type, count, balls) { /* implementar se desejar */ }
  function showLineVictory(prize, names) { /* implementar se desejar */ }
  function showLine2Victory(prize, names) { /* implementar se desejar */ }
  function showBingoVictory(prize, names) { /* implementar se desejar */ }
  function showJackpotVictory(prize, names, balls) { /* implementar se desejar */ }
  function addChatMessage(message, sender, isBot, isSystem) {
    const chatBox = document.getElementById('chat-messages');
    const p = document.createElement('p');
    p.className = isSystem ? 'system' : isBot ? 'bot' : 'human';
    p.innerHTML = `<strong>${sender}:</strong> ${message}`;
    chatBox.appendChild(p);
    chatBox.scrollTop = chatBox.scrollHeight;
  }
  function getBallsLeftForCurrentStage(card, drawnNumbers, stage) {
  if (cardType === '75') {
    const marked = card.map(n => n === 'FREE' || drawnNumbers.includes(n));
    const totalMarked = marked.filter(Boolean).length;
    
    // Linha 1: horizontal do meio → índices 10–14
    const line1Indices = [10,11,12,13,14];
    const line1Marked = line1Indices.filter(i => marked[i]).length;
    const ballsForLine1 = 5 - line1Marked;

    // Linha 2: vertical do meio → índices 2,7,12,17,22
    const line2Indices = [2,7,12,17,22];
    const line2Marked = line2Indices.filter(i => marked[i]).length;
    const ballsForLine2 = 5 - line2Marked;

    // Linha 3: diagonal → 0,6,12,18,24
    const line3Indices = [0,6,12,18,24];
    const line3Marked = line3Indices.filter(i => marked[i]).length;
    const ballsForLine3 = 5 - line3Marked;

    // Bingo: 24 números reais
    const ballsForBingo = 24 - (totalMarked - 1); // -1 pq FREE não conta

    if (stage === 'linha1') return Math.max(0, ballsForLine1);
    if (stage === 'linha2') return Math.max(0, ballsForLine2);
    if (stage === 'linha3') return Math.max(0, ballsForLine3);
    return Math.max(0, ballsForBingo);
  } else {
    let markedInRow = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        if (card[r][c] !== null && drawnNumbers.includes(card[r][c])) {
          markedInRow[r]++;
        }
      }
    }
    if (stage === 'linha1') {
      return Math.min(5 - markedInRow[0], 5 - markedInRow[1], 5 - markedInRow[2]);
    } else if (stage === 'linha2') {
      const sorted = [...markedInRow].sort((a, b) => b - a);
      return (5 - sorted[0]) + (5 - sorted[1]);
    } else {
      return 15 - markedInRow.reduce((a, b) => a + b, 0);
    }
  }
}

// ✅ Funções auxiliares de som e voz
function playSound(type, number) {
  if (type === 'sorteio') {
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-winning-chimes-2015.mp3');
    audio.volume = 0.4;
    audio.play().catch(e => console.warn('Áudio bloqueado:', e));
  } else if (type === 'linha1') {
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-unlock-game-notification-253.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.warn('Áudio bloqueado:', e));
  } else if (type === 'linha2') {
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-arcade-game-jump-coin-216.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.warn('Áudio bloqueado:', e));
  } else if (type === 'linha3') {
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-magic-spell-cast-649.mp3');
    audio.volume = 0.5;
    audio.play().catch(e => console.warn('Áudio bloqueado:', e));
  } else if (type === 'bingo') {
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-crowd-cheering-short-632.mp3');
    audio.volume = 0.6;
    audio.play().catch(e => console.warn('Áudio bloqueado:', e));
  }
}

function speak(text) {
  // Opcional: usar SpeechSynthesis API
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 1.0;
    speechSynthesis.speak(utterance);
  }
}

// ✅ Animações de vitória
function showLineVictory(prize, names) {
  const overlay = document.getElementById('line-victory-overlay');
  if (!overlay) {
    const el = document.createElement('div');
    el.id = 'line-victory-overlay';
    el.innerHTML = `
      <div class="line-card">
        <div class="line-title">Linha 1!</div>
        <span class="winner-name">${names}</span>
        <div class="chips-box">
          <div class="prize-chips">R$ ${prize.toLocaleString('pt-BR')}</div>
          <div class="chip-label">PRÊMIO</div>
        </div>
      </div>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('active'), 10);
    setTimeout(() => el.classList.remove('active'), 4000);
    setTimeout(() => el.remove(), 4500);
    return;
  }
  overlay.querySelector('.winner-name').textContent = names;
  overlay.querySelector('.prize-chips').textContent = `R$ ${prize.toLocaleString('pt-BR')}`;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 4000);
}

function showLine2Victory(prize, names) {
  const overlay = document.getElementById('line2-victory-overlay');
  if (!overlay) {
    const el = document.createElement('div');
    el.id = 'line2-victory-overlay';
    el.innerHTML = `
      <div class="line-frame">
        <div class="line-header">Linha Dupla!</div>
        <span class="winner-name">${names}</span>
        <div class="chips-amount">R$ ${prize.toLocaleString('pt-BR')}</div>
        <div class="sub-label">DUAS LINHAS COMPLETAS</div>
      </div>
    `;
    document.body.appendChild(el);
    return;
  }
  overlay.querySelector('.winner-name').textContent = names;
  overlay.querySelector('.chips-amount').textContent = `R$ ${prize.toLocaleString('pt-BR')}`;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 4000);
}

function showLine3Victory(prize, names) {
  const overlay = document.getElementById('line3-victory-overlay');
  if (!overlay) {
    const el = document.createElement('div');
    el.id = 'line3-victory-overlay';
    el.innerHTML = `
      <div class="line3-frame">
        <div class="line3-header">✨ LINHA DIAGONAL! ✨</div>
        <div class="winner-name">${names}</div>
        <div class="chips-box">
          <div class="prize-chips">R$ ${prize.toLocaleString('pt-BR')}</div>
          <div class="chip-label">PRÊMIO</div>
        </div>
        <div class="sub-label">Terceira conquista!</div>
      </div>
    `;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('active'), 10);
    setTimeout(() => el.classList.remove('active'), 4000);
    setTimeout(() => el.remove(), 4500);
    return;
  }
  overlay.querySelector('.winner-name').textContent = names;
  overlay.querySelector('.prize-chips').textContent = `R$ ${prize.toLocaleString('pt-BR')}`;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 4000);
}

function showBingoVictory(prize, names) {
  const overlay = document.getElementById('bingo-victory-overlay');
  if (!overlay) {
    const el = document.createElement('div');
    el.id = 'bingo-victory-overlay';
    el.innerHTML = `
      <div class="bingo-card">
        <div class="bingo-title">BINGO!</div>
        <div class="prize-container">
          <div class="prize-amount">R$ ${prize.toLocaleString('pt-BR')}</div>
        </div>
        <div class="sub-tag">CARTELA COMPLETA</div>
      </div>
    `;
    document.body.appendChild(el);
    return;
  }
  overlay.querySelector('.prize-amount').textContent = `R$ ${prize.toLocaleString('pt-BR')}`;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 5000);
}

function showJackpotVictory(prize, names, balls) {
  const overlay = document.getElementById('jackpot-overlay');
  if (!overlay) {
    const el = document.createElement('div');
    el.id = 'jackpot-overlay';
    el.innerHTML = `
      <div class="winner-frame">
        <div class="jackpot-header">JACKPOT!</div>
        <span class="username">${names}</span>
        <div class="prize-box">
          <div class="prize-amount">R$ ${prize.toLocaleString('pt-BR')}</div>
        </div>
        <div class="badge-info">BINGO EM ${balls} BOLAS</div>
      </div>
    `;
    document.body.appendChild(el);
    return;
  }
  overlay.querySelector('.username').textContent = names;
  overlay.querySelector('.prize-amount').textContent = `R$ ${prize.toLocaleString('pt-BR')}`;
  overlay.querySelector('.badge-info').textContent = `BINGO EM ${balls} BOLAS`;
  overlay.classList.add('active');
  setTimeout(() => overlay.classList.remove('active'), 6000);
}

function checkAchievements(type, count, balls) {
  // Placeholder – pode ser expandido com sistema de conquistas
}

function addChatMessage(message, sender, isBot, isSystem) {
  const chatBox = document.getElementById('chat-messages');
  const p = document.createElement('p');
  p.className = isSystem ? 'system' : isBot ? 'bot' : 'human';
  p.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatBox.appendChild(p);
  chatBox.scrollTop = chatBox.scrollHeight;
}
});
