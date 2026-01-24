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

// ✅ Funções de Estado do Jogador — AGORA ISOLADAS POR SALA
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

    // ✅ CARREGAR ESTADO DA SALA ESPECÍFICA
    const savedState = loadGameState(name, roomType);
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
    if (player) {
      // ✅ SALVAR ESTADO DA SALA ESPECÍFICA
      saveGameState(playerName, currentRoom, player.chips, player.cards75, player.cards90);
    }

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

    // ✅ CARREGAR E ATUALIZAR ESTADO DA SALA ESPECÍFICA
    const currentState = loadGameState(playerName, currentRoom) || {};
    if (data.cardType === '75') {
      currentState.cards75 = currentState.cards75 || [];
      data.cards.forEach(c => currentState.cards75.push(c.card));
    } else {
      currentState.cards90 = currentState.cards90 || [];
      data.cards.forEach(c => currentState.cards90.push(c.card));
    }
    saveGameState(playerName, currentRoom, currentState.chips || 10000, currentState.cards75, currentState.cards90);

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
      checkAchievements('linha1', 0);
      showLineVictory(data.totalPrize, data.winnerNames);
    } else if (winType === 'linha2') {
      playSound('linha2');
      speak(`Linhas completas por ${data.winnerNames}!`);
      checkAchievements('linha2', 0);
      showLine2Victory(data.totalPrize, data.winnerNames);
    } else if (winType === 'bingo') {
      playSound('bingo');
      speak(`Bingo feito por ${data.winnerNames}!`);
      checkAchievements('bingo', 0, data.ballsCount);

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

    // ✅ LIMPAR ESTADO DA SALA ESPECÍFICA
    localStorage.removeItem(`bingo_player_${playerName}_${currentRoom}`);

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

  // ✅ Wake Lock para mobile
  if ('wakeLock' in navigator) {
    const gameObserver = new MutationObserver(() => {
      if (gameArea.style.display === 'block') {
        navigator.wakeLock.request('screen').catch(err => console.warn('Wake Lock:', err));
      }
    });
    gameObserver.observe(gameArea, { attributes: true, attributeFilter: ['style'] });
  }

  // ✅ Limpar fundo ao sair
  window.addEventListener('beforeunload', (e) => {
    if (currentRoom && !gameEnded) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    if (window.chipsBackgroundInterval) {
      clearInterval(window.chipsBackgroundInterval);
    }
  });

  // Funções auxiliares
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
    if (cardType === '90') {
      const markedInRow = [0, 0, 0];
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 9; c++) {
          const num = card[r][c];
          if (num !== null && drawnNumbers.includes(num)) {
            markedInRow[r]++;
          }
        }
      }
      const sorted = [...markedInRow].sort((a, b) => b - a);
      if (stage === 'linha1') return Math.min(5 - markedInRow[0], 5 - markedInRow[1], 5 - markedInRow[2]);
      if (stage === 'linha2') return (5 - sorted[0]) + (5 - sorted[1]);
      if (stage === 'bingo') return 15 - markedInRow.reduce((a, b) => a + b, 0);
    } else {
      // Bingo 75: full card only
      let marked = 0;
      for (let i = 0; i < 25; i++) {
        if (card[i] === 'FREE' || drawnNumbers.includes(card[i])) marked++;
      }
      return 25 - marked;
    }
    return 999;
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
  }

  // Função placeholder para evitar erros (caso não estejam definidas em outro lugar)
  window.addChatMessage = window.addChatMessage || ((msg, sender, isBot, isSystem) => {
    const chat = document.getElementById('chat-messages');
    const p = document.createElement('p');
    p.className = isBot ? 'bot' : isSystem ? 'system' : 'human';
    p.innerHTML = `<strong>${sender}:</strong> ${msg}`;
    chat.appendChild(p);
    chat.scrollTop = chat.scrollHeight;
  });

  window.checkAchievements = window.checkAchievements || (() => {});
  window.showLineVictory = window.showLineVictory || (() => {});
  window.showLine2Victory = window.showLine2Victory || (() => {});
  window.showBingoVictory = window.showBingoVictory || (() => {});
  window.showJackpotVictory = window.showJackpotVictory || (() => {});

});
