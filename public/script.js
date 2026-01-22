// Bingo Master Pro - Frontend Engine
let socket;
let currentRoom = 'bingo90';
let playerName = '';
let chips = 10000;
let cards90 = [];
let gameCompleted = false;
let currentStage = 'linha1';
let roomsDrawnNumbers = []; // Global para persistência visual

// --- CONFIGURAÇÃO DE PREVENÇÃO DE ZOOM MOBILE ---
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);

// --- CONEXÃO E SOCKETS ---
function connectSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('Conectado ao Bingo Master Pro');
        joinRoom();
    });

    socket.on('room-welcome', (data) => {
        gameCompleted = data.gameCompleted || false;
        currentStage = data.currentStage || 'linha1';
        
        // Alternar telas
        document.getElementById('login-screen')?.style.setProperty('display', 'none');
        document.getElementById('game-area')?.style.setProperty('display', 'block');

        const roomTitle = document.getElementById('room-title');
        if (roomTitle) roomTitle.textContent = `Sala: ${data.roomName || 'Bingo 90'}`;

        updateUI();
    });

    socket.on('room-state', (data) => {
        const player = data.players?.[socket.id];
        
        // Atualizar Dados do Jogador
        const nameDisplay = document.getElementById('player-name-display');
        const chipsDisplay = document.getElementById('chips-display');
        if (nameDisplay) nameDisplay.textContent = player?.name || playerName;
        if (chipsDisplay) chipsDisplay.textContent = (player?.chips || chips).toLocaleString('pt-BR');

        // Atualizar Estado do Jogo
        roomsDrawnNumbers = data.drawnNumbers || [];
        const ballsCount = document.getElementById('balls-count');
        const lastNumberEl = document.getElementById('last-number');
        if (ballsCount) ballsCount.textContent = roomsDrawnNumbers.length;
        if (lastNumberEl) lastNumberEl.textContent = data.lastNumber || '-';

        currentStage = data.currentStage || 'linha1';
        gameCompleted = data.gameCompleted || false;

        if (player) {
            chips = player.chips;
            saveGameState(player.name, player.chips, cards90);
        }
        
        renderDrawnNumbers(roomsDrawnNumbers);
        updateUI();
    });

    socket.on('player-list', (data) => {
        const withoutList = document.querySelector('#without-chips-list ul');
        const withList = document.querySelector('#with-chips-list ul');
        
        if (withoutList) withoutList.innerHTML = '';
        if (withList) withList.innerHTML = '';

        data.withoutChips?.forEach(p => {
            const li = document.createElement('li');
            li.textContent = p.name;
            li.className = 'x-out';
            withoutList?.appendChild(li);
        });

        data.withChips?.forEach(p => {
            const li = document.createElement('li');
            li.innerHTML = `<span>${p.name}</span><span>R$ ${p.chips.toLocaleString('pt-BR')}</span>`;
            if (p.currentWins > 0) li.classList.add('winner');
            withList?.appendChild(li);
        });
    });

    socket.on('pot-update', (data) => {
        const potEl = document.getElementById('pot-display');
        const jackpotEl = document.getElementById('jackpot-display');
        if (potEl) potEl.textContent = `Pote: R$ ${data.pot.toLocaleString('pt-BR')}`;
        if (jackpotEl) jackpotEl.textContent = `Jackpot: R$ ${data.jackpot.toLocaleString('pt-BR')}`;
    });

    socket.on('number-drawn', (data) => {
        roomsDrawnNumbers = data.drawnNumbers;
        const lastNumberEl = document.getElementById('last-number');
        const ballsCount = document.getElementById('balls-count');
        if (lastNumberEl) lastNumberEl.textContent = data.number;
        if (ballsCount) ballsCount.textContent = roomsDrawnNumbers.length;
        
        renderDrawnNumbers(roomsDrawnNumbers);
        highlightNumberOnCards(data.number);
    });

    socket.on('cards-received', (data) => {
        if (data.cardType === '90' && Array.isArray(data.cards)) {
            cards90 = data.cards.map(obj => obj.card);
            renderCards90();
            localStorage.setItem('cards90', JSON.stringify(cards90));
        }
    });

    socket.on('room-reset', () => {
        cards90 = [];
        roomsDrawnNumbers = [];
        renderCards90();
        gameCompleted = false;
        currentStage = 'linha1';
        updateUI();
    });

    socket.on('chat-message', (msg) => appendChatMessage(msg));
    socket.on('error', (msg) => alert(msg));

    // Eventos de Vitória
    socket.on('line1-victory', (d) => showLine1Victory(d.prize, d.playerName));
    socket.on('line2-victory', (d) => showLine2Victory(d.prize, d.playerName));
    socket.on('bingo-victory', (d) => showBingoVictory(d.prize, d.playerName));
    socket.on('jackpot-victory', (d) => showJackpotVictory(d.prize, d.playerName, d.ballsUsed));
}

// --- LÓGICA DE JOGO ---
function joinRoom() {
    playerName = localStorage.getItem('playerName') || prompt("Seu Nome de Jogador:");
    if (!playerName) playerName = "Jogador_" + Math.floor(Math.random() * 1000);
    localStorage.setItem('playerName', playerName);

    const savedData = JSON.parse(localStorage.getItem(`bingo_player_${playerName}`)) || {};
    chips = savedData.chips || 10000;
    cards90 = JSON.parse(localStorage.getItem('cards90')) || [];

    socket.emit('join-room', {
        playerName,
        roomType: 'bingo90',
        savedChips: chips,
        savedCards90: cards90
    });
}

function renderCards90() {
    const container = document.getElementById('cards-container');
    if (!container) return;
    container.innerHTML = '';

    cards90.forEach((card, idx) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'card-wrapper';
        let html = `<div class="card-title">Cartela ${idx + 1}</div><div class="grid-90">`;
        
        card.forEach(row => {
            row.forEach(num => {
                if (num === null) {
                    html += '<div class="cell empty"></div>';
                } else {
                    const marked = roomsDrawnNumbers.includes(num) ? ' marked' : '';
                    html += `<div class="cell${marked}" data-num="${num}">${num}</div>`;
                }
            });
        });
        
        html += '</div>';
        cardEl.innerHTML = html;
        container.appendChild(cardEl);
    });
}

function renderDrawnNumbers(numbers) {
    const hist = document.getElementById('history');
    if (!hist) return;
    hist.innerHTML = '';
    [...numbers].reverse().slice(0, 15).forEach(num => {
        const span = document.createElement('span');
        span.className = 'ball';
        span.textContent = num;
        hist.appendChild(span);
    });
}

function highlightNumberOnCards(number) {
    document.querySelectorAll(`.cell[data-num="${number}"]`).forEach(cell => {
        cell.classList.add('marked');
    });
}

function buyCards(count) {
    if (gameCompleted) return alert('O jogo terminou. Reinicie!');
    socket.emit('buy-cards', { count, cardType: '90' });
}

function startDraw() {
    socket.emit('start-draw');
}

function restartGame() {
    socket.emit('restart-game');
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    if (!input?.value.trim()) return;
    socket.emit('chat-message', {
        message: input.value,
        sender: playerName,
        isBot: false
    });
    input.value = '';
}

function appendChatMessage(msg) {
    const chatBox = document.getElementById('chat-messages');
    if (!chatBox) return;
    const div = document.createElement('p');
    div.className = msg.sender === "Sistema" ? 'system' : (msg.isBot ? 'bot' : 'human');
    div.innerHTML = `<strong>${msg.sender}:</strong> ${msg.message}`;
    chatBox.appendChild(div);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function updateUI() {
    const restartBtn = document.getElementById('btn-restart');
    const startBtn = document.getElementById('btn-start');
    if (restartBtn) restartBtn.disabled = !gameCompleted;
    if (startBtn) startBtn.disabled = gameCompleted;
    
    const controls = document.getElementById('main-controls');
    if (controls) controls.className = `controls stage-${currentStage}`;
}

// --- FUNÇÕES DE ANIMAÇÃO (CONFORME SOLICITADO) ---
let victoryActive = false;

function createOverlay(id) {
    const el = document.createElement('div');
    el.id = id;
    el.style.cssText = `position:fixed; inset:0; background:rgba(0,0,0,0.85); display:flex; justify-content:center; align-items:center; z-index:2000; opacity:0; transition:0.5s; backdrop-filter:blur(5px);`;
    document.body.appendChild(el);
    setTimeout(() => el.style.opacity = '1', 10);
    return el;
}

function cleanupOverlay(el) {
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 500);
}

function animateCounter(el, target, isCurrency = false) {
    let current = 0;
    const duration = 2000;
    const start = performance.now();

    function step(now) {
        const progress = Math.min((now - start) / duration, 1);
        current = Math.floor(progress * target);
        el.innerText = isCurrency 
            ? current.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
            : current.toLocaleString('pt-BR');
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// === INTERFACE DE VITÓRIAS ===
function showLine1Victory(amount, name) {
    if (victoryActive) return; victoryActive = true;
    const overlay = createOverlay('win-1');
    overlay.innerHTML = `<div class="line-card" style="text-align:center; color:#00d2ff;">
        <h2>LINHA 1!</h2><p>${name}</p><div id="c-1" style="font-size:3rem">0</div></div>`;
    animateCounter(overlay.querySelector('#c-1'), amount);
    setTimeout(() => { cleanupOverlay(overlay); victoryActive = false; }, 4000);
}

function showBingoVictory(amount, name) {
    if (victoryActive) return; victoryActive = true;
    const overlay = createOverlay('win-bingo');
    overlay.innerHTML = `<div class="bingo-card" style="text-align:center; color:gold; border:2px solid gold; padding:20px; border-radius:20px;">
        <h1>BINGO!</h1><p>${name}</p><div id="c-b" style="font-size:3.5rem">0</div></div>`;
    animateCounter(overlay.querySelector('#c-b'), amount, true);
    setTimeout(() => { cleanupOverlay(overlay); victoryActive = false; }, 5000);
}

// Estilos Dinâmicos
(function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        .marked { background: #ffeb3b !important; color: #000 !important; font-weight: bold; transform: scale(1.05); }
        .cell { transition: all 0.3s ease; }
        .system { color: #ff9800; font-style: italic; }
        .bot { color: #4caf50; }
        .human { color: #fff; }
        #chat-messages { height: 150px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 5px; }
    `;
    document.head.appendChild(style);
})();

function saveGameState(name, chips, cards) {
    localStorage.setItem(`bingo_player_${name}`, JSON.stringify({ chips, cards90: cards }));
}

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    connectSocket();

    // Mapping botões
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
