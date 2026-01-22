// script.js — Bingo Master Pro Frontend
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
    gameCompleted = data.gameCompleted;
    currentStage = data.currentStage;
    updateUI();
  });

  socket.on('room-state', (data) => {
    // Atualiza estado visual (números sorteados, etc.)
    renderDrawnNumbers(data.drawnNumbers);
    currentStage = data.currentStage;
    gameCompleted = data.gameCompleted;
    updateUI();
  });

  socket.on('player-list', (data) => {
    renderPlayerList(data);
  });

  socket.on('ranking-update', (ranking) => {
    renderRanking(ranking);
  });

  socket.on('pot-update', (data) => {
    document.getElementById('pot-value').innerText = data.pot.toLocaleString('pt-BR');
    document.getElementById('jackpot-value').innerText = data.jackpot.toLocaleString('pt-BR');
  });

  socket.on('number-drawn', (data) => {
    highlightNumberOnCards(data.number);
  });

  socket.on('chat-message', (msg) => {
    appendChatMessage(msg);
  });

  socket.on('cards-received', (data) => {
    if (data.cardType === '90') {
      data.cards.forEach(cardObj => {
        cards90.push(cardObj.card);
      });
      renderCards90();
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
  container.innerHTML = '';
  cards90.forEach((card, idx) => {
    const cardEl = document.createElement('div');
    cardEl.className = 'bingo-card';
    let html = '<table>';
    for (let row of card) {
      html += '<tr>';
      for (let num of row) {
        if (num === null) {
          html += '<td class="empty"></td>';
        } else {
          html += `<td class="number">${num}</td>`;
        }
      }
      html += '</tr>';
    }
    html += '</table>';
    cardEl.innerHTML = html;
    container.appendChild(cardEl);
  });
  localStorage.setItem('cards90', JSON.stringify(cards90));
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
  const message = input.value.trim();
  if (!message) return;
  socket.emit('chat-message', {
    message,
    sender: playerName,
    isBot: false
  });
  input.value = '';
}

// === ANIMAÇÕES DE VITÓRIA ===

let victoryActive = false;

function showLine1Victory(amount, name) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('line-victory-overlay');
  overlay.innerHTML = `
    <div class="line-card">
      <h2 class="line-title">LINHA 1 COMPLETA!</h2>
      <span class="winner-name">${name}</span>
      
      <div class="chips-box">
        <div class="prize-chips" id="chip-counter">0</div>
        <p class="chip-label">CHIPS</p>
      </div>
      
      <p style="font-size: 0.7rem; color: #555; letter-spacing: 2px;">BINGO MASTER PRO</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const counter = document.getElementById('chip-counter');
  animateCounter(counter, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
  });

  const interval = setInterval(() => createColorChip(), 80);
  setTimeout(() => clearInterval(interval), 2500);
}

function showLine2Victory(amount, name) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('victory-stage');
  overlay.innerHTML = `
    <div class="rays-emerald"></div>
    <div class="line-frame">
      <h1 class="line-header">LINHA 2!</h1>
      <p style="font-size: 0.7rem; color: #888; letter-spacing: 3px; margin-bottom: 5px;">VENCEDOR</p>
      <span class="winner-name">${name}</span>
      
      <div class="chips-box">
        <span class="chips-amount" id="chips-text">0</span>
      </div>
      
      <p class="sub-label">CHIPS GANHOS</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const counter = document.getElementById('chips-text');
  animateCounter(counter, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
  });

  const interval = setInterval(() => createChip(), 120);
  setTimeout(() => clearInterval(interval), 2500);
}

function showBingoVictory(amount, name) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('bingo-victory-overlay');
  overlay.innerHTML = `
    <div class="bingo-card">
      <h1 class="bingo-title">BINGO!</h1>
      <p style="font-size: 0.7rem; color: #888; letter-spacing: 3px;">VENCEDOR</p>
      <span class="winner-name">${name}</span>
      
      <div class="prize-container">
        <div class="prize-amount" id="counter">R$ 0</div>
      </div>
      
      <p class="sub-tag">✨ CARTELA CHEIA ✨</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const counterEl = document.getElementById('counter');
  animateCurrencyCounter(counterEl, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
  });

  const interval = setInterval(() => createBingoParticle(), 100);
  setTimeout(() => clearInterval(interval), 2500);
}

function showJackpotVictory(amount, name, ballsUsed) {
  if (victoryActive) return;
  victoryActive = true;

  const overlay = createOverlay('jackpot-container');
  overlay.innerHTML = `
    <div class="rays"></div>
    <div class="winner-frame">
      <h1 class="jackpot-header">JACKPOT</h1>
      <p style="font-size: 0.7rem; color: #888; letter-spacing: 3px;">VENCEDOR</p>
      <span class="username">${name}</span>
      
      <div class="prize-box">
        <span class="prize-amount" id="prize-text">R$ 0</span>
      </div>
      
      <p class="badge-info">✨ BINGO EM ${ballsUsed} BOLAS ✨</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const counterEl = document.getElementById('prize-text');
  animateCurrencyCounter(counterEl, amount, () => {
    setTimeout(() => {
      cleanupOverlay(overlay);
      victoryActive = false;
    }, 3000);
  });

  const interval = setInterval(() => createCoin(), 100);
  setTimeout(() => clearInterval(interval), 2500);
}

// === UTILITÁRIOS DE ANIMAÇÃO ===

function createOverlay(id) {
  const el = document.createElement('div');
  el.id = id;
  el.style.cssText = `
    position: fixed; inset: 0; background: black; display: flex; justify-content: center;
    align-items: center; z-index: 1000; opacity: 0;
  `;
  setTimeout(() => el.style.opacity = '1', 10);
  return el;
}

function cleanupOverlay(el) {
  el.style.opacity = '0';
  setTimeout(() => el.remove(), 500);
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

// Partículas Linha 1
function createColorChip() {
  const chip = document.createElement('div');
  const colors = ['c-blue', 'c-red', 'c-green', 'c-purple'];
  chip.className = `chip-particle ${colors[Math.floor(Math.random() * colors.length)]}`;
  chip.innerText = 'B';
  chip.style.left = Math.random() * 100 + 'vw';
  chip.style.cssText += `
    position: absolute; width: ${Math.random() * 10 + 30}px; height: ${Math.random() * 10 + 30}px;
    border-radius: 50%; border: 4px dashed rgba(255,255,255,0.7); display: flex; justify-content: center;
    align-items: center; font-weight: bold; color: white; font-size: 12px; pointer-events: none;
    z-index: 105; box-shadow: inset 0 0 10px rgba(0,0,0,0.5);
    animation: chipFly ${Math.random() * 1.5 + 1.5}s ease-in forwards;
  `;
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), 3000);
}

// Partículas Linha 2
function createChip() {
  const chip = document.createElement('div');
  const colors = ['c-emerald', 'c-turquoise', 'c-gold'];
  chip.className = `chip ${colors[Math.floor(Math.random() * colors.length)]}`;
  chip.innerText = 'B';
  chip.style.left = Math.random() * 100 + 'vw';
  chip.style.cssText += `
    position: absolute; width: ${Math.random() * 15 + 30}px; height: ${Math.random() * 15 + 30}px;
    border-radius: 50%; border: 3px dashed rgba(255,255,255,0.7); display: flex; justify-content: center;
    align-items: center; font-weight: bold; color: ${chip.classList.contains('c-gold') ? '#000' : '#fff'};
    font-size: 14px; z-index: 5; pointer-events: none;
    animation: chipFall ${Math.random() * 2 + 2}s linear forwards;
  `;
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), 3000);
}

// Partículas Bingo
function createBingoParticle() {
  const p = document.createElement('div');
  const colors = ['p-gold', 'p-emerald', 'p-blue'];
  p.className = `particle ${colors[Math.floor(Math.random() * colors.length)]}`;
  p.style.left = Math.random() * 100 + 'vw';
  p.style.cssText += `
    position: absolute; width: 35px; height: 35px; border-radius: 50%;
    border: 3px dashed rgba(255,255,255,0.8); z-index: 5; pointer-events: none;
    animation: fall ${Math.random() * 2 + 2}s linear forwards;
  `;
  document.body.appendChild(p);
  setTimeout(() => p.remove(), 3000);
}

// Moedas Jackpot
function createCoin() {
  const coin = document.createElement('div');
  const isFront = Math.random() > 0.4;
  coin.className = isFront ? 'coin front-coin' : 'coin back-coin';
  coin.innerText = '$';
  coin.style.left = Math.random() * 100 + 'vw';
  coin.style.cssText += `
    position: absolute; width: ${Math.random() * 20 + 25}px; height: ${Math.random() * 20 + 25}px;
    background: #FFD700; border-radius: 50%; border: 2px solid #B8860B;
    display: flex; justify-content: center; align-items: center; font-weight: bold;
    color: #8b6508; font-size: 14px; pointer-events: none;
    box-shadow: inset 0 0 8px rgba(0,0,0,0.4);
    animation: coinFall ${Math.random() * 3 + 2}s linear forwards;
    z-index: ${isFront ? 30 : 5};
  `;
  document.body.appendChild(coin);
  setTimeout(() => coin.remove(), 3000);
}

// === ESTILOS DINÂMICOS (para animações) ===
const style = document.createElement('style');
style.textContent = `
  @keyframes chipFly {
    0% { transform: translateY(110vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(-20vh) rotate(720deg); opacity: 0; }
  }
  @keyframes chipFall {
    0% { transform: translateY(-10vh) rotate(0deg); }
    100% { transform: translateY(110vh) rotate(720deg); }
  }
  @keyframes fall {
    0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(110vh) rotate(720deg); opacity: 0; }
  }
  @keyframes coinFall {
    0% { transform: translateY(-15vh) rotate(0deg) translateX(0); }
    25% { transform: translateY(15vh) rotate(180deg) translateX(15px); }
    50% { transform: translateY(45vh) rotate(360deg) translateX(-15px); }
    100% { transform: translateY(115vh) rotate(720deg) translateX(0); }
  }
  @keyframes rotate {
    from { transform: rotate(0deg); } to { transform: rotate(360deg); }
  }
  @keyframes entry {
    from { transform: scale(0.8); opacity: 0; } to { transform: scale(1); opacity: 1; }
  }
  @keyframes popIn {
    from { transform: scale(0.7); opacity: 0; } to { transform: scale(1); opacity: 1; }
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

  .coin { background: #FFD700; border: 2px solid #B8860B; }
`;
document.head.appendChild(style);

// === FUNÇÕES AUXILIARES (UI básica) ===
function renderDrawnNumbers(numbers) {
  const el = document.getElementById('drawn-numbers');
  if (el) {
    el.innerHTML = numbers.map(n => `<span class="ball">${n}</span>`).join('');
  }
}

function highlightNumberOnCards(number) {
  document.querySelectorAll('.number').forEach(td => {
    if (parseInt(td.innerText) === number) {
      td.classList.add('marked');
    }
  });
}

function appendChatMessage(msg) {
  const chatBox = document.getElementById('chat-box');
  if (!chatBox) return;
  const div = document.createElement('div');
  div.innerHTML = `<strong>${msg.sender}:</strong> ${msg.message}`;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

function renderPlayerList(data) {
  // Implemente conforme sua UI
}

function renderRanking(ranking) {
  // Implemente conforme sua UI
}

function updateUI() {
  const btnRestart = document.getElementById('btn-restart');
  const btnStart = document.getElementById('btn-start');
  if (btnRestart) btnRestart.disabled = !gameCompleted;
  if (btnStart) btnStart.disabled = gameCompleted;
}

// Iniciar
document.addEventListener('DOMContentLoaded', () => {
  connectSocket();

  // Exemplo de botões (ajuste conforme seu HTML)
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
