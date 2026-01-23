// ============ FUNÇÕES DAS NOVAS ANIMAÇÕES ============

// Linha 1
function showLineVictory(amount, name) {
  const overlay = document.getElementById('line-victory-overlay');
  if (!overlay) return;
  const counter = document.getElementById('chip-counter');
  const nameDisplay = document.getElementById('winner-display');
  if (nameDisplay) nameDisplay.innerText = name;
  overlay.classList.add('active');
  
  const interval = setInterval(() => {
    if (!overlay.classList.contains('active')) {
      clearInterval(interval);
      return;
    }
    createColorChip();
  }, 80);

  let current = 0;
  const duration = 2000;
  const startTime = performance.now();
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    current = Math.floor(progress * amount);
    if (counter) counter.innerText = current.toLocaleString('pt-BR');
    if (progress < 1) {
      requestAnimationFrame(updateCounter);
    }
  }
  requestAnimationFrame(updateCounter);

  setTimeout(() => {
    overlay.classList.remove('active');
  }, 5000);
}

function createColorChip() {
  const chip = document.createElement('div');
  const CORES = ['c-blue', 'c-red', 'c-green', 'c-purple'];
  const colorClass = CORES[Math.floor(Math.random() * CORES.length)];
  chip.className = `chip-particle ${colorClass}`;
  chip.innerText = 'B';
  chip.style.left = Math.random() * 100 + 'vw';
  const duration = Math.random() * 1.5 + 1.5;
  chip.style.animation = `chipFly ${duration}s ease-in forwards`;
  const size = Math.random() * 10 + 30;
  chip.style.width = size + 'px';
  chip.style.height = size + 'px';
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), duration * 1000);
}

// Linha 2
function showLine2Victory(amount, name) {
  const overlay = document.getElementById('line2-victory-overlay');
  if (!overlay) return;
  const chipsText = document.getElementById('line2-chips-text');
  const winnerName = document.getElementById('line2-winner-name');
  if (winnerName) winnerName.innerText = name;
  overlay.classList.add('active');

  let current = 0;
  const duration = 2500;
  const startTime = performance.now();
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    current = Math.floor(progress * amount);
    if (chipsText) chipsText.innerText = current.toLocaleString('pt-BR');
    if (progress < 1) requestAnimationFrame(updateCounter);
  }
  requestAnimationFrame(updateCounter);

  const chipInterval = setInterval(() => {
    if (!overlay.classList.contains('active')) {
      clearInterval(chipInterval);
      return;
    }
    createLine2Chip();
  }, 120);

  setTimeout(() => {
    overlay.classList.remove('active');
    clearInterval(chipInterval);
  }, 5000);
}

function createLine2Chip() {
  const chip = document.createElement('div');
  const CORES = ['c-emerald', 'c-turquoise', 'c-gold'];
  const colorClass = CORES[Math.floor(Math.random() * CORES.length)];
  chip.className = `chip ${colorClass}`;
  chip.innerText = 'B';
  chip.style.left = Math.random() * 100 + 'vw';
  const duration = Math.random() * 2 + 2;
  chip.style.animation = `chipFall ${duration}s linear forwards`;
  const size = Math.random() * 15 + 30;
  chip.style.width = size + 'px';
  chip.style.height = size + 'px';
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), duration * 1000);
}

// Bingo
function showBingoVictory(amount, name) {
  const overlay = document.getElementById('bingo-victory-overlay');
  if (!overlay) return;
  const prizeEl = document.getElementById('bingo-prize-amount');
  const winnerEl = document.getElementById('bingo-winner-name');
  if (winnerEl) winnerEl.innerText = name;
  overlay.classList.add('active');

  let current = 0;
  const duration = 2000;
  const startTime = performance.now();
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    current = Math.floor(progress * amount);
    if (prizeEl) {
      prizeEl.innerText = current.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0
      });
    }
    if (progress < 1) requestAnimationFrame(updateCounter);
  }
  requestAnimationFrame(updateCounter);

  const particleInterval = setInterval(() => {
    if (!overlay.classList.contains('active')) {
      clearInterval(particleInterval);
      return;
    }
    createBingoParticle();
  }, 100);

  setTimeout(() => {
    overlay.classList.remove('active');
    clearInterval(particleInterval);
  }, 6000);
}

function createBingoParticle() {
  const p = document.createElement('div');
  const CORES = ['p-gold', 'p-emerald', 'p-blue'];
  const cor = CORES[Math.floor(Math.random() * CORES.length)];
  p.className = `particle ${cor}`;
  p.style.left = Math.random() * 100 + 'vw';
  const duration = Math.random() * 2 + 2;
  p.style.animation = `fall ${duration}s linear forwards`;
  document.body.appendChild(p);
  setTimeout(() => p.remove(), duration * 1000);
}

// Jackpot
function showJackpotVictory(amount, name, ballsCount) {
  const overlay = document.getElementById('jackpot-overlay');
  if (!overlay) return;
  const prizeEl = document.getElementById('jackpot-prize-amount');
  const winnerEl = document.getElementById('jackpot-winner-name');
  const ballsEl = document.getElementById('jackpot-balls-info');
  if (winnerEl) winnerEl.innerText = name;
  if (ballsEl) ballsEl.innerText = `✨ BINGO EM ${ballsCount} BOLAS ✨`;
  overlay.classList.add('active');

  let current = 0;
  const duration = 2500;
  const startTime = performance.now();
  function updateCounter(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    current = Math.floor(progress * amount);
    if (prizeEl) {
      prizeEl.innerText = current.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        maximumFractionDigits: 0
      });
    }
    if (progress < 1) requestAnimationFrame(updateCounter);
  }
  requestAnimationFrame(updateCounter);

  const coinInterval = setInterval(() => {
    if (!overlay.classList.contains('active')) {
      clearInterval(coinInterval);
      return;
    }
    createCoin();
  }, 100);

  setTimeout(() => {
    overlay.classList.remove('active');
    clearInterval(coinInterval);
  }, 7000);
}

function createCoin() {
  const coin = document.createElement('div');
  const isFront = Math.random() > 0.4;
  coin.className = isFront ? 'coin front-coin' : 'coin back-coin';
  coin.innerText = '$';
  coin.style.left = Math.random() * 100 + 'vw';
  const duration = Math.random() * 3 + 2;
  coin.style.animation = `coinFall ${duration}s linear forwards`;
  const size = Math.random() * 20 + 25;
  coin.style.width = size + 'px';
  coin.style.height = size + 'px';
  document.body.appendChild(coin);
  setTimeout(() => coin.remove(), duration * 1000);
}
