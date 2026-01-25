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
let roomsState = {};

// ✅ CONEXÃO (URL corrigida)
const SOCKET_URL = 'https://bingo-online-production.up.railway.app';
socket = io(SOCKET_URL, {
  transports: ['websocket'],
  reconnection: true,
  reconnectionAttempts: Infinity
});

// ✅ Função de fala segura
function speak(text) {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    speechSynthesis.speak(utterance);
  }
}

// ✅ Função de chat (faltava!)
function addChatMessage(message, sender, isBot, isSystem = false) {
  const chatMessages = document.getElementById('chat-messages');
  if (!chatMessages) return;

  const msgDiv = document.createElement('div');
  msgDiv.classList.add('chat-message');
  if (isSystem) msgDiv.classList.add('system-message');
  else if (isBot) msgDiv.classList.add('bot-message');
  else msgDiv.classList.add('player-message');

  msgDiv.innerHTML = `<strong>${sender}:</strong> ${message}`;
  chatMessages.appendChild(msgDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ✅ Funções de Administração
function toggleAdminMode() {
  const controls = document.getElementById('admin-controls');
  if (controls) {
    controls.style.display = isAdminMode ? 'none' : 'block';
    isAdminMode = !isAdminMode;
  }
}

function showAdminMessage(message, type = 'info') {
  const msgElement = document.getElementById('admin-message');
  if (!msgElement) return;
  msgElement.textContent = message;
  msgElement.style.display = 'block';
  msgElement.style.background = type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3';
  setTimeout(() => msgElement.style.display = 'none', 5000);
}

function sendAdminCommand() {
  const playerName = document.getElementById('admin-player-name')?.value;
  const amount = parseInt(document.getElementById('admin-amount')?.value);
  const password = document.getElementById('admin-password')?.value;
  if (!playerName || isNaN(amount) || !password) {
    alert('Preencha todos os campos.');
    return;
  }
  socket.emit('admin-add-chips', { playerName, amount, adminPassword: password });
  if (document.getElementById('admin-player-name')) document.getElementById('admin-player-name').value = '';
  if (document.getElementById('admin-amount')) document.getElementById('admin-amount').value = '';
  if (document.getElementById('admin-password')) document.getElementById('admin-password').value = '';
}

let clickCount = 0;
let clickTimer = null;

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

// ✅ Atualização de interface com cores forçadas
function updateControlButtons(stage) {
  if (!stage) return;
  currentStage = stage;
  const mainControls = document.getElementById('main-controls');
  if (mainControls) mainControls.className = `controls stage-${stage}`;
  
  const stageText = document.getElementById('stage-text');
  const nearLine1 = document.getElementById('near-line1');
  const nearLine2 = document.getElementById('near-line2');

  function setTextColor(el, color) {
    if (el) {
      el.style.setProperty('color', color, 'important');
      el.style.fontWeight = 'bold';
    }
  }

  if (stageText) {
    if (stage === 'linha1') {
      stageText.textContent = 'Linha 1';
      setTextColor(stageText, '#66bb6a');
    } else if (stage === 'linha2') {
      stageText.textContent = 'Linha 2';
      setTextColor(stageText, '#ab47bc');
      if (nearLine1) nearLine1.textContent = '0';
    } else if (stage === 'bingo') {
      stageText.textContent = 'BINGO!';
      setTextColor(stageText, '#ffd700');
      if (nearLine2) nearLine2.textContent = '0';
    }
  }
}

// ✅ Atualizar tudo relacionado a chips
function refreshAllChipDisplays() {
  const player = socket.id ? roomsState?.players?.[socket.id] : null;
  if (player) {
    const chipsDisplay = document.getElementById('chips-display');
    if (chipsDisplay) chipsDisplay.textContent = player.chips.toLocaleString('pt-BR');
  }

  if (roomsState?.pot != null) {
    const potDisplay = document.getElementById('pot-display');
    if (potDisplay) potDisplay.textContent = `Pote: R$ ${roomsState.pot.toLocaleString('pt-BR')}`;
  }
  if (roomsState?.jackpot != null) {
    const jackpotDisplay = document.getElementById('jackpot-display');
    if (jackpotDisplay) jackpotDisplay.textContent = `Jackpot: R$ ${roomsState.jackpot.toLocaleString('pt-BR')}`;
  }

  if (roomsState?.players) {
    const playersArray = Object.entries(roomsState.players).map(([id, p]) => ({ id, ...p }));
    const withoutChips = playersArray.filter(p => p.chips <= 0);
    const withChips = playersArray.filter(p => p.chips > 0).sort((a, b) => b.chips - a.chips);

    const noChipsCount = document.getElementById('no-chips-count');
    const withChipsCount = document.getElementById('with-chips-count');
    if (noChipsCount) noChipsCount.textContent = withoutChips.length;
    if (withChipsCount) withChipsCount.textContent = withChips.length;

    const withoutList = document.getElementById('without-chips-list')?.querySelector('ul');
    const withList = document.getElementById('with-chips-list')?.querySelector('ul');
    if (withoutList) withoutList.innerHTML = '';
    if (withList) withList.innerHTML = '';

    if (withoutList) {
      withoutChips.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name;
        li.classList.add('x-out');
        withoutList.appendChild(li);
      });
    }

    if (withList) {
      withChips.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.name}</span><span>R$ ${p.chips.toLocaleString('pt-BR')}</span>`;
        if (p.currentWins > 0) li.classList.add('winner');
        withList.appendChild(li);
      });
    }
  }

  if (roomsState?.players) {
    const ranked = Object.entries(roomsState.players)
      .map(([id, p]) => ({ id, name: p.name, chips: p.chips, isBot: p.isBot }))
      .sort((a, b) => b.chips - a.chips)
      .map((p, i) => ({ ...p, position: i + 1 }));

    const rankingList = document.getElementById('ranking-list');
    if (rankingList) {
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
}

// ✅ FUNDO DINÂMICO DE FICHAS (GENÉRICO)
function startChipsBackground(containerId, isLogin = false) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.style.display = 'block';
  container.innerHTML = '';

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
    if (isLogin) {
      chip.style.position = 'absolute';
    }
    
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

  if (isLogin) {
    window.loginChipsInterval = interval;
  } else {
    window.chipsBackgroundInterval = interval;
  }
}

// ✅ TIMER VISUAL (movido para cá)
let countdownActive = false;
function hideCountdown() {
  const el = document.getElementById('countdown-timer');
  if (el) el.style.display = 'none';
  countdownActive = false;
}
function showCountdown(seconds) {
  const gameArea = document.getElementById('game-area');
  if (!gameArea || gameArea.style.display === 'none') return;
  const numberEl = document.getElementById('number');
  const countdownEl = document.getElementById('countdown-timer');
  if (!numberEl || !countdownEl) return;

  numberEl.textContent = seconds;
  if (seconds <= 5) {
    numberEl.classList.add('critical-text');
  } else {
    numberEl.classList.remove('critical-text');
  }
  countdownEl.style.display = 'block';
  countdownActive = true;
}

// ✅ Restante principal
document.addEventListener('DOMContentLoaded', () => {
  // Inicia animação na tela de login
  startChipsBackground('chips-container', true);

  const playerNameInput = document.getElementById('player-name');
  const loginScreen = document.getElementById('login-screen');
  const gameArea = document.getElementById('game-area');
  const potDisplay = document.getElementById('pot-display');
  const jackpotDisplay = document.getElementById('jackpot-display');
  const ballsCountDisplay = document.getElementById('balls-count');
  const lastNumberDisplay = document.getElementById('last-number');

  // Evento de clique para modo admin
  if (playerNameInput) {
    playerNameInput.addEventListener('click', function() {
      clickCount++;
      if (clickTimer) clearTimeout(clickTimer);
      clickTimer = setTimeout(() => clickCount = 0, 500);
      if (clickCount === 5) {
        toggleAdminMode();
        clickCount = 0;
        clearTimeout(clickTimer);
      }
    });
  }

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

  // Botões
  const join75 = document.getElementById('join-bingo75');
  const join90 = document.getElementById('join-bingo90');
  const set10 = document.getElementById('set-10-cards');
  const sendAdmin = document.getElementById('send-admin-command');
  const buyBtn = document.getElementById('buy-btn');
  const line2Btn = document.getElementById('line2-btn');
  const bingoBtn = document.getElementById('bingo-btn');
  const restartBtn = document.getElementById('restart-btn');
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');

  if (join75) join75.addEventListener('click', () => joinRoom('bingo75'));
  if (join90) join90.addEventListener('click', () => joinRoom('bingo90'));
  if (set10) set10.addEventListener('click', () => {
    const input = document.getElementById('card-count');
    if (input) input.value = 10;
  });
  if (sendAdmin) sendAdmin.addEventListener('click', sendAdminCommand);
  if (buyBtn) buyBtn.addEventListener('click', () => {
    if (gameEnded) {
      alert('O jogo terminou. Clique em "Reiniciar Jogo".');
      return;
    }
    const count = parseInt(document.getElementById('card-count')?.value) || 1;
    if (count < 1 || count > 10) {
      alert('Digite um valor entre 1 e 10.');
      return;
    }
    socket.emit('buy-cards', { count, cardType });
  });
  if (line2Btn) line2Btn.addEventListener('click', () => {
    if (gameEnded) return;
    socket.emit('claim-win', { winType: 'linha2' });
  });
  if (bingoBtn) bingoBtn.addEventListener('click', () => {
    if (gameEnded) return;
    socket.emit('claim-win', { winType: 'bingo' });
  });
  if (restartBtn) restartBtn.addEventListener('click', () => {
    if (confirm('Deseja reiniciar o jogo?')) {
      socket.emit('restart-game');
    }
  });
  if (chatSend && chatInput) {
    chatSend.addEventListener('click', () => {
      const msg = chatInput.value.trim();
      if (msg) {
        socket.emit('chat-message', { message: msg, sender: playerName, isBot: false });
        chatInput.value = '';
      }
    });
    chatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        chatSend.click();
      }
    });
  }

  // Socket listeners
  socket.on('room-welcome', (data) => {
    currentRoom = data.roomId;
    cardType = currentRoom === 'bingo75' ? '75' : '90';
    if (loginScreen) loginScreen.style.display = 'none';
    if (gameArea) gameArea.style.display = 'block';
    const roomTitle = document.getElementById('room-title');
    if (roomTitle) roomTitle.textContent = `Sala: ${data.roomName}`;
    gameEnded = data.gameCompleted || false;
    updateControlButtons(data.currentStage || 'linha1');
    if (window.loginChipsInterval) clearInterval(window.loginChipsInterval);
    setTimeout(() => startChipsBackground('chips-background'), 100);
  });

  socket.on('room-state', (data) => {
    roomsState = data;
    const displayName = document.getElementById('player-name-display');
    if (displayName) displayName.textContent = data.players[socket.id]?.name || '?';
    roomsDrawnNumbers = data.drawnNumbers || [];
    if (ballsCountDisplay) ballsCountDisplay.textContent = roomsDrawnNumbers.length;
    if (data.lastNumber && lastNumberDisplay) lastNumberDisplay.textContent = data.lastNumber;
    updateControlButtons(data.currentStage || 'linha1');
    const player = data.players[socket.id];
    if (player) saveGameState(playerName, player.chips, player.cards75, player.cards90);
    refreshAllChipDisplays();
  });

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

  socket.on('player-list', () => refreshAllChipDisplays());
  socket.on('update-player', () => refreshAllChipDisplays());
  socket.on('chat-message', (data) => addChatMessage(data.message, data.sender, data.isBot, data.sender === "Sistema"));

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
    if (lastNumberDisplay) lastNumberDisplay.textContent = data.number;
    roomsDrawnNumbers = data.drawnNumbers;
    if (ballsCountDisplay) ballsCountDisplay.textContent = roomsDrawnNumbers.length;
    markDrawnNumbers(data.number);
    renderCards();
    // playSound('sorteio', data.number); // opcional
    speak(data.number.toString());
    const remainingForJackpot = Math.max(0, 60 - roomsDrawnNumbers.length);
    const jackpotRemaining = document.getElementById('jackpot-remaining');
    if (jackpotRemaining) jackpotRemaining.textContent = `Bolas restantes para Jackpot: ${remainingForJackpot}`;
  });

  socket.on('player-won', (data) => {
    // Removido chamadas a funções inexistentes
    if (data.newStage) updateControlButtons(data.newStage);
    if (data.winners[0]?.winType === 'bingo') gameEnded = true;
    setTimeout(() => { socket.emit('sync-state'); }, 500);
  });

  socket.on('room-reset', () => {
    roomsDrawnNumbers = [];
    playerCards = [];
    gameEnded = false;
    const cardsContainer = document.getElementById('cards-container');
    const history = document.getElementById('history');
    const chatMessages = document.getElementById('chat-messages');
    if (cardsContainer) cardsContainer.innerHTML = '';
    if (lastNumberDisplay) lastNumberDisplay.textContent = '-';
    if (ballsCountDisplay) ballsCountDisplay.textContent = '0';
    if (history) history.innerHTML = '';
    if (chatMessages) chatMessages.innerHTML = '';
    localStorage.removeItem(`bingo_player_${playerName}`);
    renderCards();
    updateControlButtons('linha1');
    roomsState = {};
    refreshAllChipDisplays();
    const chipsBg = document.getElementById('chips-background');
    if (chipsBg) chipsBg.style.display = 'none';
  });

  socket.on('error', (msg) => showAdminMessage(msg, 'error'));
  socket.on('message', (msg) => showAdminMessage(msg, 'success'));

  // Timer events
  socket.on('countdown-start', (data) => showCountdown(data.seconds));
  socket.on('countdown-update', (data) => {
    if (countdownActive) {
      showCountdown(data.seconds);
      if (data.seconds === 0) setTimeout(hideCountdown, 300);
    }
  });
  socket.on('room-reset', hideCountdown);
  socket.on('number-drawn', hideCountdown);
  socket.on('player-won', hideCountdown);
  socket.on('game-end', hideCountdown);

  // Wake lock
  if ('wakeLock' in navigator && gameArea) {
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
    }
    if (window.chipsBackgroundInterval) clearInterval(window.chipsBackgroundInterval);
    if (window.loginChipsInterval) clearInterval(window.loginChipsInterval);
  });

  // Funções auxiliares (mantidas)
  function updateHistory(numbers) {
    const hist = document.getElementById('history');
    if (!hist) return;
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
    if (!container) return;
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
    sortedCards.forEach((item, idx) => { item.index = idx; });
    sortedCards.forEach(item => {
      const wrapper = document.createElement('div');
      wrapper.className = 'card-wrapper';
      const ballsLeftForStage = getBallsLeftForCurrentStage(item.card, roomsDrawnNumbers, currentStage);
      if (ballsLeftForStage === 1) wrapper.classList.add('near-win');
      wrapper.innerHTML = `<div class="card-title">Cartela ${item.index + 1}</div>`;
      const grid = document.createElement('div');
      grid.className = cardType === '75' ? 'grid-75' : 'grid-90';
      if (cardType === '90') {
        const markedInRow = [0, 0, 0];
        for (let r = 0; r < 3; r++) {
          for (let c = 0; c < 9; c++) {
            const num = item.card[r][c];
            if (num !== null && roomsDrawnNumbers.includes(num)) markedInRow[r]++;
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
              if (roomsDrawnNumbers.includes(val)) cell.classList.add('marked');
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
        for (let i = 0; i < 25; i++) {
          const cell = document.createElement('div');
          cell.className = 'cell';
          if (item.card[i] === 'FREE') {
            cell.textContent = '★';
            cell.classList.add('free');
          } else {
            cell.textContent = item.card[i].toString();
            cell.dataset.num = item.card[i].toString();
            if (roomsDrawnNumbers.includes(item.card[i])) cell.classList.add('marked');
          }
          grid.appendChild(cell);
        }
      }
      wrapper.appendChild(grid);
      container.appendChild(wrapper);
    });
  }

  function getBallsLeftForCurrentStage(card, drawnNumbers, stage) {
    const stats = calculateBallsLeftForCard(card, drawnNumbers);
    if (stage === 'linha1') return stats.forLine1;
    if (stage === 'linha2') return stats.forLine2;
    return stats.forBingo;
  }

  function calculateBallsLeftForCard(card, drawnNumbers) {
    const markedInRow = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        if (card[r][c] !== null && drawnNumbers.includes(card[r][c])) markedInRow[r]++;
      }
    }
    const ballsForLine1 = Math.min(5 - markedInRow[0], 5 - markedInRow[1], 5 - markedInRow[2]);
    const sorted = [...markedInRow].sort((a, b) => b - a);
    const ballsForLine2 = (5 - sorted[0]) + (5 - sorted[1]);
    const ballsForBingo = 15 - markedInRow.reduce((a,b) => a+b, 0);
    return {
      forLine1: Math.max(0, ballsForLine1),
      forLine2: Math.max(0, ballsForLine2),
      forBingo: Math.max(0, ballsForBingo)
    };
  }
});
