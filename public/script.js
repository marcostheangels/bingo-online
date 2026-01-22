// script.js — Bingo Master Pro Frontend (CORRIGIDO FINAL)

// --- VARIÁVEIS GLOBAIS ---
let socket;
let currentRoom = 'bingo90';
let playerName = '';
let chips = 10000;
let cards90 = [];
let gameCompleted = false;
let currentStage = 'linha1';
let roomsDrawnNumbers = []; // Movido para escopo global para acesso em todas as funções

// --- IMPEDIR ZOOM NO MOBILE ---
document.addEventListener('touchstart', function(event) {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) event.preventDefault();
  lastTouchEnd = now;
}, false);

// --- CONEXÃO E SOCKETS ---
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Conectado ao servidor');
    joinRoom();
  });

  socket.on('room-welcome', (data) => {
    gameCompleted = data.gameCompleted || false;
    currentStage = data.currentStage || 'linha1';
    
    // Alternância de Telas (Login -> Jogo)
    const loginScreen = document.getElementById('login-screen');
    const gameArea = document.getElementById('game-area');
    if (loginScreen) loginScreen.style.display = 'none';
    if (gameArea) gameArea.style.display = 'block';

    const roomTitle = document.getElementById('room-title');
    if (roomTitle) roomTitle.textContent = `Sala: ${data.roomName || 'Bingo 90'}`;

    updateUI();
  });

  socket.on('room-state', (data) => {
    const player = data.players?.[socket.id];
    
    // Atualiza info do jogador
    const nameDisplay = document.getElementById('player-name-display');
    const chipsDisplay = document.getElementById('chips-display');
    if (nameDisplay) nameDisplay.textContent = player?.name || playerName;
    if (chipsDisplay) chipsDisplay.textContent = (player?.chips || chips).toLocaleString('pt-BR');

    // Atualiza estado do sorteio
    roomsDrawnNumbers = data.drawnNumbers || [];
    const ballsCount = document.getElementById('balls-count');
    const lastNumberEl = document.getElementById('last-number');
    if (ballsCount) ballsCount.textContent = roomsDrawnNumbers.length;
    if (lastNumberEl) lastNumberEl.textContent = data.lastNumber || '-';

    currentStage = data.currentStage || 'linha1';
    gameCompleted = data.gameCompleted || false;

    // Persistência e Renderização
    if (player) {
        chips = player.chips; // Sincroniza chips locais
        saveGameState(player.name, player.chips, player.cards90);
    }
    
    // Re-renderiza histórico e cartelas para garantir marcações corretas
    renderDrawnNumbers(roomsDrawnNumbers);
    
    // Se tiver cartelas salvas e não desenhadas, desenha agora
    if (cards90.length > 0) {
        renderCards90(); 
    }
    
    updateUI();
  });

  socket.on('player-list', (data) => {
    const withoutList = document.querySelector('#without-chips-list ul');
    const withList = document.querySelector('#with-chips-list ul');
    const noChipsCount = document.getElementById('no-chips-count');
    const withChipsCount = document.getElementById('with-chips-count');

    if (withoutList) withoutList.innerHTML = '';
    if (withList) withList.innerHTML = '';
    
    if (noChipsCount) noChipsCount.textContent = data.withoutChips?.length || 0;
    if (withChipsCount) withChipsCount.textContent = data.withChips?.length || 0;

    if (withoutList && Array.isArray(data.withoutChips)) {
      data.withoutChips.forEach(p => {
        const li = document.createElement('li');
        li.textContent = p.name;
        li.classList.add('x-out');
        withoutList.appendChild(li);
      });
    }

    if (withList && Array.isArray(data.withChips)) {
      data.withChips.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = `<span>${p.name}</span><span>R$ ${p.chips.toLocaleString('pt-BR')}</span>`;
        if (p.currentWins > 0) li.classList.add('winner');
        withList.appendChild(li);
      });
    }
  });

  socket.on('ranking-update', (ranking) => {
    const rankingList = document.getElementById('ranking-list');
    if (!rankingList) return;
    rankingList.innerHTML = '';
    if (!Array.isArray(ranking)) return;
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

  socket.on('pot-update', (data) => {
    const potEl = document.getElementById('pot-display');
    const jackpotEl = document.getElementById('jackpot-display');
    if (potEl) potEl.textContent = `Pote: R$ ${data.pot.toLocaleString('pt-BR')}`;
    if (jackpotEl) jackpotEl.textContent = `Jackpot: R$ ${data.jackpot.toLocaleString('pt-BR')}`;
  });

  socket.on('number-drawn', (data) => {
    // Atualiza a variável global imediatamente
    roomsDrawnNumbers = data.drawnNumbers; 
    
    const lastNumberEl = document.getElementById('last-number');
    const ballsCount = document.getElementById('balls-count');
    if (lastNumberEl) lastNumberEl.textContent = data.number;
    if (ballsCount) ballsCount.textContent = roomsDrawnNumbers.length;
    
    renderDrawnNumbers(roomsDrawnNumbers);
    highlightNumberOnCards(data.number);
  });

  socket.on('chat-message', (msg) => {
    appendChatMessage(msg);
  });

  socket.on('cards-received', (data) => {
    if (data.cardType === '90' && Array.isArray(data.cards)) {
      cards90 = []; // Limpa para evitar duplicatas ao reconectar
      data.cards.forEach(cardObj => {
        cards90.push(cardObj.card);
      });
      renderCards90();
      localStorage.setItem('cards90', JSON.stringify(cards90));
    }
  });

  socket.on('room-reset', () => {
    cards90 = [];
    roomsDrawnNumbers = []; // Limpa histórico local
    renderCards90();
    gameCompleted = false;
    currentStage = 'linha1';
    
    // Limpa o histórico visual
    const hist = document.getElementById('history');
    if (hist) hist.innerHTML = '';
    
    updateUI();
  });

  socket.on('error', (msg) => alert(msg));
  socket.on('message', (msg) => alert(msg));

  // === EVENTOS DE VITÓRIA ===
  socket.on('line1-victory', (data) => showLine1Victory(data.prize, data.playerName));
  socket.on('line2-victory', (data) => showLine2Victory(data.prize, data.playerName));
  socket.on('bingo-victory', (data) => showBingoVictory(data.prize, data.playerName));
  socket.on('jackpot-victory', (data) => showJackpotVictory(data.prize, data.playerName, data.ballsUsed));
}

// --- FUNÇÕES DE LÓGICA DO JOGO ---

function joinRoom() {
  // Lógica de Login/Registro simplificada via LocalStorage
  playerName = localStorage.getItem('playerName');
  
  if (!playerName) {
     playerName = prompt("Digite seu nome:");
     if (!playerName) playerName = "Visitante_" + Math.floor(Math.random() * 1000);
  }
  localStorage.setItem('playerName', playerName);

  const savedData = JSON.parse(localStorage.getItem(`bingo_player_${playerName}`)) || {};
  const savedChips = savedData.chips || 10000;
  const savedCards90 = JSON.parse(localStorage.getItem('cards90')) || [];

  chips = savedChips;
  cards90 = savedCards90;

  socket.emit('join-room', {
    playerName,
    roomType: 'bingo90',
    savedChips,
    savedCards90
  });
}

function renderCards90() {
  const container = document.getElementById('cards-container');
  if (!container) return;
  container.innerHTML = '';
  
  cards90.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'card-wrapper';
    let html = '<div class="card-title">Cartela ' + (idx + 1) + '</div><div class="grid-90">';
    for (let row of card) {
      for (let num of row) {
        if (num === null) {
          html += '<div class="cell empty"></div>';
        } else {
          // Verifica se o número está no array global de sorteados
          const marked = roomsDrawnNumbers.includes(num) ? ' marked' : '';
          html += `<div class="cell${marked}" data-num="${num}">${num}</div>`;
        }
      }
    }
    html += '</div>';
    cardEl.innerHTML = html;
    container.appendChild(cardEl);
  });
}

function buyCards(count) {
  if (gameCompleted) {
    alert('O jogo acabou. Aguarde o reinício!');
    return;
  }
  socket.emit('buy-cards', { count, cardType: '90' });
}

function startDraw() {
  if (gameCompleted) {
    alert('Reinicie o jogo primeiro!');
    return;
  }
  socket.emit('start-draw');
}

function restartGame() {
  if (!gameCompleted) {
    alert('Só é possível reiniciar após o Bingo.');
    return;
  }
  socket.emit('restart-game');
}

function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const message = input?.value.trim();
  if (!message) return;
  socket.emit('chat-message', {
    message,
    sender: playerName,
    isBot: false
  });
  if (input) input.value = '';
}

function renderDrawnNumbers(numbers) {
  const hist = document.getElementById('history');
  if (!hist) return;
  hist.innerHTML = '';
  // Mostra as últimas 15 bolas para não poluir a UI
  [...numbers].reverse().slice(0, 20).forEach(num => {
    const span = document.createElement('span');
    span.className = 'ball';
    span.textContent = num;
    hist.appendChild(span);
  });
}

function highlightNumberOnCards(number) {
  // Busca células com este número e adiciona a classe visual
  document.querySelectorAll(`.cell[data-num="${number}"]`).forEach(cell => {
    cell.classList.add('marked');
  });
}

function appendChatMessage(msg) {
  const chatBox = document.getElementById('chat-messages');
  if (!chatBox) return;
  const div = document.createElement('p');
  div.innerHTML = `<strong>${msg.sender}:</strong> ${msg.message}`;
  
  if (msg.sender === "Sistema") div.className = 'system';
  else if (msg.isBot) div.className = 'bot';
  else div.className = 'human';
  
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function updateUI() {
  const controls = document.getElementById('main-controls');
  if (controls) {
    controls.className = `controls stage-${currentStage}`;
  }
  
  // CORREÇÃO: Usando os IDs corretos definidos no HTML (btn-start, btn-restart)
  const restartBtn = document.getElementById('btn-restart');
  const startBtn = document.getElementById('btn-start');
  
  if (restartBtn) restartBtn.disabled = !gameCompleted;
  if (startBtn) startBtn.disabled = gameCompleted;
}

function saveGameState(name, chips, cards90) {
  try {
    localStorage.setItem(`bingo_player_${name}`, JSON.stringify({ chips, cards90 }));
  } catch (e) {
    console.warn('Não foi possível salvar o estado:', e);
  }
}

// === SISTEMA DE ANIMAÇÕES E OVERLAYS ===

let victoryActive = false;

function createOverlay(id) {
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText = `
    position: fixed; inset: 0; background: rgba(0,0,0,0.85); display: flex; justify-content: center;
    align-items: center; z-index: 2000; opacity: 0; transition: opacity 0.5s ease;
    backdrop-filter: blur(5px);
  `;
  document.body.appendChild(el);
  // Pequeno delay para permitir transição CSS
  setTimeout(() => el.style.opacity = '1', 10);
  return el;
}

function cleanupOverlay(el) {
  if (!el) return;
  el.style.opacity = '0';
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 500);
}

function animateCounter(el, target, onComplete) {
  let current = 0;
  const duration = 2000;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing simples
    const ease = 1 - Math.pow(1 - progress, 3);
    
    current = Math.floor(ease * target);
    el.innerText = current.toLocaleString('pt-BR');
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else if (onComplete) {
      onComplete();
    }
  }
  requestAnimationFrame(update);
}

function animateCurrencyCounter(el, target, onComplete) {
  let current = 0;
  const duration = 2000;
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    
    current = Math.floor(ease * target);
    el.innerText = current.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    });
    
    if (progress < 1) {
      requestAnimationFrame(update);
    } else if (onComplete) {
      onComplete();
    }
  }
  requestAnimationFrame(update);
}

function createParticle(className, colors, sizeRange = [30, 45]) {
  const p = document.createElement('div');
  p.className = className + ' ' + colors[Math.floor(Math.random() * colors.length)];
  p.innerText = 'B'; // Texto genérico ou pode ser removido no CSS
  p.style.left = Math.random() * 95 + 'vw';
  
  const size = Math.random() * (sizeRange[1] - sizeRange[0]) + sizeRange[0];
  p.style.width = size + 'px';
  p.style.height = size + 'px';
  
  // Animação de queda/voo definida no CSS injetado
  p.style.animationName = Math.random() > 0.5 ? 'chipFall' : 'chipFly';
  p.style.animationDuration = (Math.random() * 2 + 1) + 's';
  
  document.body.appendChild(p);
  setTimeout(() => { if(p.parentNode) p.remove(); }, 3000);
  return p;
}

// === VITÓRIA LINHA 1 ===
function showLine1Victory(amount, name) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('line-victory-overlay');
  overlay.innerHTML = `
    <div class="line-card" style="position:relative;z-index:110;width:88%;max-width:400px;background:rgba(0,0,0,0.9);backdrop-filter:blur(20px);border:3px solid #00d2ff;border-radius:35px;padding:35px 20px;text-align:center;box-shadow:0 0 50px rgba(0,210,255,0.3);">
      <h2 style="font-family:'Goldman',cursive;font-size:clamp(1.8rem,8vw,2.4rem);color:#00d2ff;text-shadow:0 0 15px #00d2ff;margin-bottom:5px;">LINHA 1 COMPLETA!</h2>
      <span style="font-size:clamp(1.1rem,5vw,1.6rem);color:#fff;font-weight:900;margin-bottom:20px;display:block;">${name}</span>
      <div style="background:rgba(255,255,255,0.05);border:1px solid rgba(0,210,255,0.3);border-radius:20px;padding:20px 10px;margin-bottom:15px;">
        <div id="chip-counter" style="font-size:clamp(2.5rem,12vw,3.8rem);font-weight:900;color:#fff;text-shadow:0 0 20px #00d2ff;">0</div>
        <p style="font-size:0.9rem;color:#00d2ff;letter-spacing:4px;font-weight:bold;">CHIPS</p>
      </div>
    </div>
  `;

  const counter = overlay.querySelector('#chip-counter');
  if (counter) animateCounter(counter, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 2000);
  });

  const interval = setInterval(() => {
    createParticle('chip-particle', ['c-blue', 'c-red', 'c-green', 'c-purple'], [30, 40]);
  }, 80);
  setTimeout(() => clearInterval(interval), 2500);
}

// === VITÓRIA LINHA 2 ===
function showLine2Victory(amount, name) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('victory-stage');
  overlay.innerHTML = `
    <div style="position:absolute;width:200%;height:200%;background:conic-gradient(from 0deg, transparent 0%, rgba(0,255,135,0.08) 15%, transparent 30%);animation:rotate 25s linear infinite;z-index:1;left:-50%;top:-50%;"></div>
    <div class="line-frame" style="position:relative;z-index:20;width:88%;max-width:400px;background:rgba(0,0,0,0.9);backdrop-filter:blur(25px);border:3px solid #00ff87;border-radius:40px;padding:35px 15px;text-align:center;box-shadow:0 0 50px rgba(0,255,135,0.25);">
      <h1 style="font-family:'Goldman',cursive;font-size:clamp(2rem,9vw,2.8rem);background:linear-gradient(to bottom,#00ff87,#00f2fe);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px;">LINHA 2!</h1>
      <span style="font-size:clamp(1.2rem,5vw,1.7rem);color:#fff;font-weight:900;margin-bottom:20px;display:block;">${name}</span>
      <div style="background:rgba(0,255,135,0.05);border:1px solid rgba(0,255,135,0.3);border-radius:20px;padding:22px 10px;width:90%;margin:0 auto;">
        <span id="chips-text" style="font-size:clamp(2.2rem,11vw,4rem);font-weight:900;color:#fff;text-shadow:0 0 20px #00ff87;">0</span>
      </div>
    </div>
  `;

  const counter = overlay.querySelector('#chips-text');
  if (counter) animateCounter(counter, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 2000);
  });

  const interval = setInterval(() => {
    createParticle('chip', ['c-emerald', 'c-turquoise', 'c-gold'], [30, 45]);
  }, 120);
  setTimeout(() => clearInterval(interval), 2500);
}

// === VITÓRIA BINGO ===
function showBingoVictory(amount, name) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('bingo-victory-overlay');
  overlay.innerHTML = `
    <div class="bingo-card" style="position:relative;z-index:110;width:90%;max-width:420px;background:rgba(0,0,0,0.95);backdrop-filter:blur(15px);border:4px solid gold;border-radius:40px;padding:40px 10px;text-align:center;box-shadow:0 0 50px rgba(255,215,0,0.3);">
      <h1 style="font-family:'Goldman',cursive;font-size:clamp(2.5rem,12vw,4rem);color:gold;text-shadow:0 0 20px rgba(255,215,0,0.5);margin-bottom:10px;">BINGO!</h1>
      <span style="font-size:1.5rem;color:#fff;font-weight:900;margin-bottom:25px;display:block;">${name}</span>
      <div style="background:rgba(255,215,0,0.05);border:2px solid rgba(255,215,0,0.3);border-radius:25px;padding:25px 5px;width:95%;display:flex;justify-content:center;align-items:center;min-height:100px;margin:0 auto;">
        <div id="counter" style="font-size:clamp(1.8rem,10vw,3.8rem);font-weight:900;color:#fff;text-shadow:0 0 20px gold;white-space:nowrap;">R$ 0</div>
      </div>
      <p style="margin-top:25px;font-size:0.9rem;color:gold;letter-spacing:5px;font-weight:bold;">✨ CARTELA CHEIA ✨</p>
    </div>
  `;

  const counterEl = overlay.querySelector('#counter');
  if (counterEl) animateCurrencyCounter(counterEl, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
  });

  const interval = setInterval(() => {
    createParticle('particle', ['p-gold', 'p-emerald', 'p-blue'], [30, 40]);
  }, 100);
  setTimeout(() => clearInterval(interval), 2500);
}

// === VITÓRIA JACKPOT ===
function showJackpotVictory(amount, name, ballsUsed) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('jackpot-container');
  overlay.innerHTML = `
    <div style="position:absolute;width:200%;height:200%;background:conic-gradient(from 0deg, transparent 0%, rgba(255,215,0,0.1) 15%, transparent 30%);animation:rotate 25s linear infinite;z-index:1;left:-50%;top:-50%;"></div>
    <div class="winner-frame" style="position:relative;z-index:20;width:88%;max-width:400px;background:rgba(0,0,0,0.92);backdrop-filter:blur(20px);border:3px solid gold;border-radius:40px;padding:35px 15px;text-align:center;box-shadow:0 0 60px rgba(0,0,0,1);">
      <h1 style="font-family:'Goldman',cursive;font-size:clamp(2.2rem,10vw,3rem);background:linear-gradient(180deg,#FFD700,#B8860B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px;">JACKPOT</h1>
      <span style="font-size:clamp(1.2rem,5vw,1.6rem);color:#fff;font-weight:900;margin-bottom:15px;display:block;">${name}</span>
      <div style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.3);border-radius:20px;padding:22px 10px;width:92%;display:flex;justify-content:center;align-items:center;margin:0 auto;">
        <span id="prize-text" style="font-size:clamp(1.8rem,9vw,3.8rem);font-weight:900;color:#fff;text-shadow:0 0 20px rgba(255,215,0,0.8);white-space:nowrap;">R$ 0</span>
      </div>
      <p style="margin-top:20px;font-weight:700;color:gold;font-size:0.85rem;">✨ BINGO EM ${ballsUsed} BOLAS ✨</p>
    </div>
  `;

  const counterEl = overlay.querySelector('#prize-text');
  if (counterEl) animateCurrencyCounter(counterEl, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 4000);
  });

  const interval = setInterval(() => {
    const coin = document.createElement('div');
    coin.className = Math.random() > 0.4 ? 'coin front-coin' : 'coin back-coin';
    coin.innerText = '$';
    coin.style.left = Math.random() * 95 + 'vw';
    const size = Math.random() * 20 + 25;
    coin.style.width = size + 'px';
    coin.style.height = size + 'px';
    coin.style.cssText += `
      position: absolute; background: #FFD700; border-radius: 50%; border: 2px solid #B8860B;
      display: flex; justify-content: center; align-items: center; font-weight: bold;
      color: #8b6508; font-size: 14px; pointer-events: none;
      box-shadow: inset 0 0 8px rgba(0,0,0,0.4);
      animation: coinFall ${Math.random() * 3 + 2}s linear forwards;
      z-index: ${coin.classList.contains('front-coin') ? 30 : 5};
    `;
    document.body.appendChild(coin);
    setTimeout(() => coin.remove(), 3000);
  }, 100);
  setTimeout(() => clearInterval(interval), 3000);
}

// === CSS DINÂMICO INJETADO ===
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes chipFly { 
      0% { transform: translateY(110vh) rotate(0deg); opacity: 1; } 
      100% { transform: translateY(-20vh) rotate(720deg); opacity: 0; } 
    }
    @keyframes chipFall { 
      0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 
      100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } 
    }
    @keyframes coinFall {
      0% { transform: translateY(-15vh) rotate(0deg) translateX(0); }
      25% { transform: translateY(15vh) rotate(180deg) translateX(15px); }
      50% { transform: translateY(45vh) rotate(360deg) translateX(-15px); }
      100% { transform: translateY(115vh) rotate(720deg) translateX(0); }
    }
    .chip-particle, .chip, .particle { position: fixed; border-radius: 50%; z-index: 2005; display:flex; justify-content:center; align-items:center; color:rgba(255,255,255,0.5); font-size:10px; pointer-events:none; }
    
    /* Cores das Partículas */
    .chip-particle.c-blue { background: #00d2ff; box-shadow: 0 0 15px #00d2ff; }
    .chip-particle.c-red { background: #ff4b2b; box-shadow: 0 0 15px #ff4b2b; }
    .chip-particle.c-green { background: #00ff87; box-shadow: 0 0 15px #00ff87; }
    .chip-particle.c-purple { background: #a800ff; box-shadow: 0 0 15px #a800ff; }
    
    .chip.c-emerald { background: #00ff87; box-shadow: 0 0 15px #00ff87; }
    .chip.c-turquoise { background: #00f2fe; box-shadow: 0 0 15px #00f2fe; }
    .chip.c-gold { background: #ffeb3b; color: #000; border-color: #000; box-shadow: 0 0 15px #ffeb3b; }
    
    .particle.p-gold { background: #FFD700; box-shadow: 0 0 15px #FFD700; }
    .particle.p-emerald { background: #00ff87; box-shadow: 0 0 15px #00ff87; }
    .particle.p-blue { background: #00d2ff; box-shadow: 0 0 15px #00d2ff; }

    /* Estilos de Jogo */
    .cell.marked {
       background: #ffeb3b !important;
       color: #000 !important;
       font-weight: 900 !important;
       transform: scale(1.1);
       box-shadow: 0 0 10px #ffeb3b;
       border-color: #ffd700 !important;
    }
    
    /* Chat */
    .system { color: #ff9800; font-style: italic; font-size: 0.8rem; }
    .bot { color: #4caf50; font-weight: bold; }
    .human { color: #fff; }
    #chat-messages p { margin: 4px 0; line-height: 1.4; }
  `;
  document.head.appendChild(style);
})();

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
  connectSocket();

  // Mapeamento dos Botões (Garante que os IDs batem com o HTML)
  document.getElementById('btn-buy-1')?.addEventListener('click', () => buyCards(1));
  document.getElementById('btn-buy-5')?.addEventListener('click', () => buyCards(5));
  document.getElementById('btn-buy-10')?.addEventListener('click', () => buyCards(10));
  
  // Controles de Jogo
  document.getElementById('btn-start')?.addEventListener('click', startDraw);
  document.getElementById('btn-restart')?.addEventListener('click', restartGame);
  
  // Chat
  document.getElementById('btn-chat-send')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
});
