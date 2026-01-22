// script.js — Bingo Master Pro Frontend (CORRIGIDO)
let socket;
let currentRoom = 'bingo90';
let playerName = '';
let chips = 10000;
let cards90 = [];
let gameCompleted = false;
let currentStage = 'linha1';

// Impedir zoom no mobile
document.addEventListener('touchstart', function(event) {
  if (event.touches.length > 1) event.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', function(event) {
  const now = Date.now();
  if (now - lastTouchEnd <= 300) event.preventDefault();
  lastTouchEnd = now;
}, false);

// Conectar ao servidor
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    console.log('Conectado ao servidor');
    joinRoom();
  });

  socket.on('room-welcome', (data) => {
    gameCompleted = data.gameCompleted || false;
    currentStage = data.currentStage || 'linha1';
    
    const loginScreen = document.getElementById('login-screen');
    const gameArea = document.getElementById('game-area');
    if (loginScreen) loginScreen.style.display = 'none';
    if (gameArea) gameArea.style.display = 'block';

    const roomTitle = document.getElementById('room-title');
    if (roomTitle) roomTitle.textContent = `Sala: ${data.roomName || '?'}`;

    updateUI();
  });

  socket.on('room-state', (data) => {
    const player = data.players?.[socket.id];
    const nameDisplay = document.getElementById('player-name-display');
    const chipsDisplay = document.getElementById('chips-display');
    if (nameDisplay) nameDisplay.textContent = player?.name || '?';
    if (chipsDisplay) chipsDisplay.textContent = (player?.chips || 10000).toLocaleString('pt-BR');

    roomsDrawnNumbers = data.drawnNumbers || [];
    const ballsCount = document.getElementById('balls-count');
    const lastNumberEl = document.getElementById('last-number');
    if (ballsCount) ballsCount.textContent = roomsDrawnNumbers.length;
    if (lastNumberEl) lastNumberEl.textContent = data.lastNumber || '-';

    currentStage = data.currentStage || 'linha1';
    gameCompleted = data.gameCompleted || false;

    if (player) saveGameState(player.name, player.chips, player.cards90);
    updateUI();
  });

  socket.on('player-list', (data) => {
    const withoutList = document.getElementById('without-chips-list')?.querySelector('ul');
    const withList = document.getElementById('with-chips-list')?.querySelector('ul');
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
    const lastNumberEl = document.getElementById('last-number');
    const ballsCount = document.getElementById('balls-count');
    if (lastNumberEl) lastNumberEl.textContent = data.number;
    if (ballsCount) ballsCount.textContent = data.drawnNumbers.length;
    renderDrawnNumbers(data.drawnNumbers);
    highlightNumberOnCards(data.number);
  });

  socket.on('chat-message', (msg) => {
    appendChatMessage(msg);
  });

  socket.on('cards-received', (data) => {
    if (data.cardType === '90' && Array.isArray(data.cards)) {
      data.cards.forEach(cardObj => {
        cards90.push(cardObj.card);
      });
      renderCards90();
      localStorage.setItem('cards90', JSON.stringify(cards90));
    }
  });

  socket.on('room-reset', () => {
    cards90 = [];
    renderCards90();
    gameCompleted = false;
    currentStage = 'linha1';
    updateUI();
  });

  socket.on('error', (msg) => {
    alert(msg);
  });

  socket.on('message', (msg) => {
    alert(msg);
  });

  // === EVENTOS DE VITÓRIA ===
  socket.on('line1-victory', (data) => {
    showLine1Victory(data.prize, data.playerName);
  });

  socket.on('line2-victory', (data) => {
    showLine2Victory(data.prize, data.playerName);
  });

  socket.on('bingo-victory', (data) => {
    showBingoVictory(data.prize, data.playerName);
  });

  socket.on('jackpot-victory', (data) => {
    showJackpotVictory(data.prize, data.playerName, data.ballsUsed);
  });
}

// Variáveis globais usadas nas funções
let roomsDrawnNumbers = [];

// Entrar na sala
function joinRoom() {
  playerName = localStorage.getItem('playerName') || prompt("Digite seu nome:");
  if (!playerName) {
    playerName = "Anônimo";
  }
  localStorage.setItem('playerName', playerName);

  const savedChips = parseInt(localStorage.getItem('chips')) || 10000;
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

// Renderizar cartelas
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

// Comprar cartelas
function buyCards(count) {
  if (gameCompleted) {
    alert('Reinicie o jogo primeiro!');
    return;
  }
  socket.emit('buy-cards', { count, cardType: '90' });
}

// Iniciar sorteio
function startDraw() {
  if (gameCompleted) {
    alert('Reinicie o jogo primeiro!');
    return;
  }
  socket.emit('start-draw');
}

// Reiniciar jogo
function restartGame() {
  if (!gameCompleted) {
    alert('Só é possível reiniciar após o Bingo.');
    return;
  }
  socket.emit('restart-game');
}

// Enviar mensagem no chat
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

// Renderizar números sorteados
function renderDrawnNumbers(numbers) {
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

// Destacar número nas cartelas
function highlightNumberOnCards(number) {
  document.querySelectorAll(`.cell[data-num="${number}"]`).forEach(cell => {
    cell.classList.add('marked');
  });
}

// Adicionar mensagem no chat
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

// Atualizar UI (botões, etc.)
function updateUI() {
  const controls = document.getElementById('main-controls');
  if (controls) {
    controls.className = `controls stage-${currentStage}`;
  }
  const restartBtn = document.getElementById('restart-btn');
  const startBtn = document.getElementById('start-btn');
  if (restartBtn) restartBtn.disabled = !gameCompleted;
  if (startBtn) startBtn.disabled = gameCompleted;
}

// === ANIMAÇÕES DE VITÓRIA ===

let victoryActive = false;

function createOverlay(id) {
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText = `
    position: fixed; inset: 0; background: black; display: flex; justify-content: center;
    align-items: center; z-index: 1000; opacity: 0;
  `;
  setTimeout(() => el.style.opacity = '1', 10);
  document.body.appendChild(el);
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
    current = Math.floor(progress * target);
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
    current = Math.floor(progress * target);
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

// Partículas genéricas
function createParticle(className, colors, sizeRange = [30, 45]) {
  const p = document.createElement('div');
  p.className = className + ' ' + colors[Math.floor(Math.random() * colors.length)];
  p.innerText = 'B';
  p.style.left = Math.random() * 100 + 'vw';
  const size = Math.random() * (sizeRange[1] - sizeRange[0]) + sizeRange[0];
  p.style.width = size + 'px';
  p.style.height = size + 'px';
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 3000);
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
      <p style="font-size:0.7rem;color:#555;letter-spacing:2px;">BINGO MASTER PRO</p>
    </div>
  `;

  const counter = overlay.querySelector('#chip-counter');
  if (counter) animateCounter(counter, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
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
    <div style="position:absolute;width:300%;height:300%;background:conic-gradient(from 0deg, transparent 0%, rgba(0,255,135,0.08) 15%, transparent 30%);animation:rotate 25s linear infinite;z-index:1;"></div>
    <div class="line-frame" style="position:relative;z-index:20;width:88%;max-width:400px;background:rgba(0,0,0,0.9);backdrop-filter:blur(25px);border:3px solid #00ff87;border-radius:40px;padding:35px 15px;text-align:center;box-shadow:0 0 50px rgba(0,255,135,0.25);">
      <h1 style="font-family:'Goldman',cursive;font-size:clamp(2rem,9vw,2.8rem);background:linear-gradient(to bottom,#00ff87,#00f2fe);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px;">LINHA 2!</h1>
      <p style="font-size:0.7rem;color:#888;letter-spacing:3px;margin-bottom:5px;">VENCEDOR</p>
      <span style="font-size:clamp(1.2rem,5vw,1.7rem);color:#fff;font-weight:900;margin-bottom:20px;display:block;">${name}</span>
      <div style="background:rgba(0,255,135,0.05);border:1px solid rgba(0,255,135,0.3);border-radius:20px;padding:22px 10px;width:90%;margin:0 auto;">
        <span id="chips-text" style="font-size:clamp(2.2rem,11vw,4rem);font-weight:900;color:#fff;text-shadow:0 0 20px #00ff87;">0</span>
      </div>
      <p style="margin-top:15px;color:#00ff87;font-weight:bold;letter-spacing:3px;font-size:0.8rem;">CHIPS GANHOS</p>
    </div>
  `;

  const counter = overlay.querySelector('#chips-text');
  if (counter) animateCounter(counter, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
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
      <p style="font-size:0.7rem;color:#888;letter-spacing:3px;">VENCEDOR</p>
      <span style="font-size:1.5rem;color:#fff;font-weight:900;margin-bottom:25px;display:block;">${name}</span>
      <div style="background:rgba(255,215,0,0.05);border:2px solid rgba(255,215,0,0.3);border-radius:25px;padding:25px 5px;width:95%;display:flex;justify-content:center;align-items:center;min-height:100px;">
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
    <div style="position:absolute;width:300%;height:300%;background:conic-gradient(from 0deg, transparent 0%, rgba(255,215,0,0.1) 15%, transparent 30%);animation:rotate 25s linear infinite;z-index:1;"></div>
    <div class="winner-frame" style="position:relative;z-index:20;width:88%;max-width:400px;background:rgba(0,0,0,0.92);backdrop-filter:blur(20px);border:3px solid gold;border-radius:40px;padding:35px 15px;text-align:center;box-shadow:0 0 60px rgba(0,0,0,1);">
      <h1 style="font-family:'Goldman',cursive;font-size:clamp(2.2rem,10vw,3rem);background:linear-gradient(180deg,#FFD700,#B8860B);-webkit-background-clip:text;-webkit-text-fill-color:transparent;margin-bottom:10px;">JACKPOT</h1>
      <p style="font-size:0.7rem;color:#888;letter-spacing:3px;">VENCEDOR</p>
      <span style="font-size:clamp(1.2rem,5vw,1.6rem);color:#fff;font-weight:900;margin-bottom:15px;display:block;">${name}</span>
      <div style="background:rgba(255,215,0,0.08);border:1px solid rgba(255,215,0,0.3);border-radius:20px;padding:22px 10px;width:92%;display:flex;justify-content:center;align-items:center;">
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
    }, 3000);
  });

  const interval = setInterval(() => {
    const coin = document.createElement('div');
    coin.className = Math.random() > 0.4 ? 'coin front-coin' : 'coin back-coin';
    coin.innerText = '$';
    coin.style.left = Math.random() * 100 + 'vw';
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
  setTimeout(() => clearInterval(interval), 2500);
}

// Estilos dinâmicos para animações
(function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes chipFly { 0% { transform: translateY(110vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(-20vh) rotate(720deg); opacity: 0; } }
    @keyframes chipFall { 0% { transform: translateY(-10vh) rotate(0deg); } 100% { transform: translateY(110vh) rotate(720deg); } }
    @keyframes fall { 0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0; } }
    @keyframes coinFall {
      0% { transform: translateY(-15vh) rotate(0deg) translateX(0); }
      25% { transform: translateY(15vh) rotate(180deg) translateX(15px); }
      50% { transform: translateY(45vh) rotate(360deg) translateX(-15px); }
      100% { transform: translateY(115vh) rotate(720deg) translateX(0); }
    }
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
  `;
  document.head.appendChild(style);
})();

// Salvar estado
function saveGameState(name, chips, cards90) {
  try {
    localStorage.setItem(`bingo_player_${name}`, JSON.stringify({ chips, cards90 }));
  } catch (e) {
    console.warn('Não foi possível salvar o estado:', e);
  }
}

// Inicializar
document.addEventListener('DOMContentLoaded', () => {
  connectSocket();

  // Botões
  document.getElementById('btn-buy-1')?.addEventListener('click', () => buyCards(1));
  document.getElementById('btn-buy-5')?.addEventListener('click', () => buyCards(5));
  document.getElementById('btn-buy-10')?.addEventListener('click', () => buyCards(10));
  document.getElementById('btn-start')?.addEventListener('click', startDraw);
  document.getElementById('btn-restart')?.addEventListener('click', restartGame);
  document.getElementById('btn-chat-send')?.addEventListener('click', sendChatMessage);
  document.getElementById('chat-input')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
});
