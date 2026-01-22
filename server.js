const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);

// ✅ Rate limiting simples para feedback
const feedbackLimiter = new Map(); // IP -> último timestamp
const FEEDBACK_MIN_INTERVAL_MS = 5000; // 5 segundos entre envios

const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// ✅ Função de sanitização
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Anônimo';
  let clean = name.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
  clean = clean.substring(0, 15);
  return clean || 'Anônimo';
}

// ✅ Endpoint de feedback com rate limiting
app.use(express.json());
app.post('/api/feedback', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const last = feedbackLimiter.get(ip);
  
  if (last && (now - last) < FEEDBACK_MIN_INTERVAL_MS) {
    return res.status(429).json({ error: 'Aguarde antes de enviar outro feedback.' });
  }

  const { playerName, message, roomType } = req.body;
  if (!playerName || !message || message.length < 5 || message.length > 500) {
    return res.status(400).json({ error: 'Mensagem inválida. Use 5 a 500 caracteres.' });
  }

  feedbackLimiter.set(ip, now);
  setTimeout(() => feedbackLimiter.delete(ip), FEEDBACK_MIN_INTERVAL_MS);

  const logEntry = `[${new Date().toISOString()}] [${roomType || 'unknown'}] ${playerName}: ${message}\n`;
  fs.appendFile('feedback.log', logEntry, (err) => {
    if (err) console.error('Erro ao salvar feedback:', err);
  });
  console.log('📩 Novo feedback recebido:', logEntry.trim());
  res.json({ success: true });
});

// ✅ Nomes de bots
const BOT_NAMES = [
  "Bibiu", "Casca de Ferida", "Cão Chupando Manga", "Karatê", "Chico Tripa", 
  "Zé da Foice", "Venta de Ventoinha", "Sete de Ouro", "Galego do Zinho", "Totonho", 
  "Peba", "Rabo de Peixe", "Zé Moleza", "Cara de Broa", "Furico de Rato",
  "Mão de Gancho", "Tico-Tico", "Pinta Roxa", "Galinha Morta", "Boca de Caçapa",
  "Saco de Estopa", "Meia-Noite", "Catuaba", "Pau de Virar Tripa", "Caneca furada"
];

// ✅ CONFIGURAÇÕES JUSTAS
const PRICE_PER_CARD = 100;
const INITIAL_CHIPS = 10000; // Chips iniciais para novos jogadores
const MAX_CARDS_PER_PLAYER = 10; // Limite máximo de 10 cartelas por jogador
const JACKPOT_BALL_LIMIT = 60; // ✅ CORRIGIDO DE 40 PARA 60
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '0589';

// ✅ Salas em memória - CORRIGIDO maxBots para 25
const rooms = {
  'bingo75': { 
    name: 'Bingo 75 (Americano)', 
    players: {}, 
    drawnNumbers: [], 
    gameActive: false, 
    lastNumber: null,
    maxBots: 25,
    pot: 0,
    drawInterval: null,
    currentStage: 'linha1',
    stageCompleted: { linha1: false, linha2: false, bingo: false },
    jackpot: 1000000,
    gameCompleted: false
  },
  'bingo90': { 
    name: 'Bingo 90 (Brasileiro)', 
    players: {}, 
    drawnNumbers: [], 
    gameActive: false, 
    lastNumber: null,
    maxBots: 25,
    pot: 0,
    drawInterval: null,
    currentStage: 'linha1',
    stageCompleted: { linha1: false, linha2: false, bingo: false },
    jackpot: 1000000,
    gameCompleted: false
  }
};

// ✅ MENSAGENS DE PARABENIZAÇÃO
function getVictoryMessage(winType, winnerNames) {
  const messages = {
    linha1: [
      `🎉 Parabéns ${winnerNames}! Primeira linha conquistada!`,
      `🔥 Uau! ${winnerNames} fez a primeira linha!`,
      `🎯 Acerto certeiro! ${winnerNames} marcou a linha 1!`,
      `🚀 ${winnerNames} decolou com a primeira linha!`,
      `👀 Impressionante! ${winnerNames} já fez a linha 1!`,
      `🏆 ${winnerNames} está no caminho certo com a linha 1!`,
      `✨ Magia do bingo! ${winnerNames} completou a linha 1!`
    ],
    linha2: [
      `🎊 Dupla vitória! ${winnerNames} fez duas linhas!`,
      `💥 Poderoso! ${winnerNames} completou duas linhas!`,
      `🔥🔥 Duas linhas perfeitas! Parabéns ${winnerNames}!`,
      `🎯🎯 Precisão incrível! ${winnerNames} fez as duas linhas!`,
      `🚀🚀 ${winnerNames} está voando com duas linhas!`,
      `🏆🏆 ${winnerNames} dominando o bingo com duas linhas!`,
      `✨✨ ${winnerNames} brilhou com duas linhas completas!`
    ],
    bingo: [
      `🏆🏆🏆 BINGO ÉPICO! ${winnerNames} é o CAMPEÃO!`,
      `🎉🎉🎉 BINGOOOO! ${winnerNames} arrasou totalmente!`,
      `👑👑👑 REI DO BINGO! ${winnerNames} mandou bem demais!`,
      `💎💎💎 VITÓRIA PERFEITA! ${winnerNames} fez o BINGO!`,
      `🚀🚀🚀 ${winnerNames} VOOU DIRETO PRO TOPO! BINGO!`,
      `🌟🌟🌟 ${winnerNames} ILUMINOU A SALA COM SEU BINGO!`,
      `🎯🎯🎯 ACERTO MILIMÉTRICO! ${winnerNames} FEZ O BINGO!`,
      `🔥🔥🔥 ${winnerNames} ESTÁ ON FIRE! BINGO INCRÍVEL!`
    ]
  };
  
  const msgArray = messages[winType] || [`Parabéns ${winnerNames}!`];
  return msgArray[Math.floor(Math.random() * msgArray.length)];
}

// ✅ Funções de validação e geração
function countTotalNumbersInCard(card) {
  if (!Array.isArray(card) || card.length !== 3) return 0;
  let count = 0;
  for (let r = 0; r < 3; r++) {
    if (!Array.isArray(card[r]) || card[r].length !== 9) continue;
    for (let c = 0; c < 9; c++) {
      if (typeof card[r][c] === 'number' && card[r][c] >= 1 && card[r][c] <= 90) count++;
    }
  }
  return count;
}

function validateAndFixBingo90Card(card) {
  if (!Array.isArray(card) || card.length !== 3) return generateBingo90Card();
  const columns = [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]];
  const usedNumbers = new Set();
  let fixed = false;
  for (let r = 0; r < 3; r++) {
    if (!Array.isArray(card[r]) || card[r].length !== 9) {
      card[r] = Array(9).fill(null);
      fixed = true;
    }
    for (let c = 0; c < 9; c++) {
      const val = card[r][c];
      if (val === null) continue;
      if (typeof val !== 'number' || val < 1 || val > 90) {
        const [min, max] = columns[c];
        card[r][c] = Math.floor(Math.random() * (max - min + 1)) + min;
        fixed = true;
      }
      if (usedNumbers.has(val)) {
        const [min, max] = columns[c];
        let novo;
        do { novo = Math.floor(Math.random() * (max - min + 1)) + min; } while (usedNumbers.has(novo));
        card[r][c] = novo;
        fixed = true;
      } else {
        usedNumbers.add(val);
      }
    }
  }
  const total = countTotalNumbersInCard(card);
  if (total !== 15) return generateBingo90Card();
  return card;
}

function generateBingo90Card() {
  let attempts = 0;
  while (attempts < 10) {
    const columns = [[1,9],[10,19],[20,29],[30,39],[40,49],[50,59],[60,69],[70,79],[80,90]];
    const card = Array(3).fill().map(() => Array(9).fill(null));
    let positions = [];
    for (let row = 0; row < 3; row++) {
      let cols = [...Array(9).keys()];
      for (let i = cols.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cols[i], cols[j]] = [cols[j], cols[i]];
      }
      cols.slice(0, 5).forEach(col => positions.push({ row, col }));
    }
    const colCount = Array(9).fill(0);
    positions.forEach(p => colCount[p.col]++);
    for (let c = 0; c < 9; c++) {
      if (colCount[c] === 0) {
        const randomIndex = Math.floor(Math.random() * positions.length);
        positions[randomIndex].col = c;
      }
    }
    const usedNumbers = new Set();
    let valid = true;
    positions.forEach(pos => {
      const [min, max] = columns[pos.col];
      let num;
      let tries = 0;
      do {
        num = Math.floor(Math.random() * (max - min + 1)) + min;
        tries++;
        if (tries > 100) { valid = false; return; }
      } while (usedNumbers.has(num));
      if (valid) {
        usedNumbers.add(num);
        card[pos.row][pos.col] = num;
      }
    });
    if (valid && usedNumbers.size === 15) return card;
    attempts++;
  }
  return [
    [1,10,20,30,40,null,null,null,null],
    [null,11,21,31,41,50,60,70,80],
    [2,12,22,32,null,51,61,71,90]
  ];
}

function generateBingo75Card() {
  const ranges = [[1,15],[16,30],[31,45],[46,60],[61,75]];
  const card = [];
  for (let col = 0; col < 5; col++) {
    const [min, max] = ranges[col];
    const nums = new Set();
    while (nums.size < 5) nums.add(Math.floor(Math.random() * (max - min + 1)) + min);
    const colNums = Array.from(nums);
    if (col === 2) colNums[2] = 'FREE';
    card.push(...colNums);
  }
  return card;
}

function drawNumber(roomType) {
  const room = rooms[roomType];
  const max = roomType === 'bingo75' ? 75 : 90;
  const pool = Array.from({length: max}, (_, i) => i + 1).filter(n => !room.drawnNumbers.includes(n));
  if (pool.length === 0) return null;
  const number = pool[Math.floor(Math.random() * pool.length)];
  room.drawnNumbers.push(number);
  room.lastNumber = number;
  return number;
}

function checkCardAchievements(card, drawnNumbers) {
  const markedInRow = [0, 0, 0];
  let totalMarked = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const num = card[r][c];
      if (num !== null && typeof num === 'number' && drawnNumbers.includes(num)) {
        markedInRow[r]++;
        totalMarked++;
      }
    }
  }
  const completeLines = markedInRow.filter(count => count === 5).length;
  return {
    linha1: completeLines >= 1,
    linha2: completeLines >= 2,
    bingo: completeLines === 3 && totalMarked === 15
  };
}

function getLineStatusForCard(card, drawnNumbers) {
  const markedInRow = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      const num = card[r][c];
      if (num !== null && drawnNumbers.includes(num)) markedInRow[r]++;
    }
  }
  return {
    line1: markedInRow[0] === 5,
    line2: markedInRow[1] === 5,
    line3: markedInRow[2] === 5,
    markedInRow
  };
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
  let minBalls = Infinity;
  if (sorted[2] < 5) minBalls = Math.min(minBalls, ballsForLine1);
  if (sorted[1] < 5) minBalls = Math.min(minBalls, ballsForLine2);
  if (sorted[0] < 5) minBalls = Math.min(minBalls, ballsForBingo);
  return {
    min: Math.max(0, minBalls),
    forLine1: Math.max(0, ballsForLine1),
    forLine2: Math.max(0, ballsForLine2),
    forBingo: Math.max(0, ballsForBingo)
  };
}

function distributePrize(room, winners, prize) {
  if (winners.length === 0 || prize <= 0) return [];
  
  const baseShare = Math.floor(prize / winners.length);
  const remainder = prize % winners.length;
  
  return winners.map((winner, index) => {
    let finalShare = baseShare + (index < remainder ? 1 : 0);
    room.players[winner.playerId].chips += finalShare;
    return {
      playerId: winner.playerId,
      playerName: room.players[winner.playerId].name,
      isBot: room.players[winner.playerId].isBot,
      prize: finalShare,
      winType: winner.winType,
      cardIndex: winner.cardIndex
    };
  });
}

function checkWinForAllPlayers(roomType) {
  const room = rooms[roomType];
  const currentStage = room.currentStage;
  if (room.stageCompleted[currentStage]) return null;
  const allWinners = [];
  for (const [playerId, player] of Object.entries(room.players)) {
    const cards = player.cards90 || [];
    for (let i = 0; i < cards.length; i++) {
      const card = validateAndFixBingo90Card(cards[i]);
      const result = checkCardAchievements(card, room.drawnNumbers);
      let qualifies = false;
      if (currentStage === 'linha1' && result.linha1) qualifies = true;
      else if (currentStage === 'linha2' && result.linha2) qualifies = true;
      else if (currentStage === 'bingo' && result.bingo) qualifies = true;
      if (qualifies) allWinners.push({ playerId, cardIndex: i, winType: currentStage });
    }
  }
  if (allWinners.length > 0) {
    console.log(`[VITÓRIA] Sala: ${roomType}, Etapa: ${currentStage}, Vencedores:`, allWinners.map(w => room.players[w.playerId]?.name).join(', '));
  }
  return allWinners.length > 0 ? allWinners : null;
}

function pauseDraw(roomType) {
  const room = rooms[roomType];
  if (room.drawInterval) {
    clearInterval(room.drawInterval);
    room.drawInterval = null;
    room.gameActive = false;
  }
}

function resumeDraw(roomType) {
  const room = rooms[roomType];
  if (room.gameActive || room.drawnNumbers.length >= (roomType === 'bingo75' ? 75 : 90)) return;
  room.gameActive = true;
  room.drawInterval = setInterval(() => {
    const number = drawNumber(roomType);
    if (number === null) {
      clearInterval(room.drawInterval);
      room.drawInterval = null;
      room.gameActive = false;
      io.to(roomType).emit('game-end', 'Todos os números foram sorteados!');
      return;
    }
    io.to(roomType).emit('number-drawn', {
      number,
      drawnNumbers: room.drawnNumbers,
      lastNumber: number
    });
    
    if (roomType === 'bingo90') {
      Object.keys(room.players).forEach(playerId => {
        const player = room.players[playerId];
        if (!player.isBot) {
          const updatedCards = player.cards90.map(card => ({
            card: validateAndFixBingo90Card(card),
            ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers),
            lineStatus: getLineStatusForCard(card, room.drawnNumbers)
          }));
          io.to(playerId).emit('cards-updated', { cards: updatedCards, cardType: '90' });
        }
      });
    }
    const winners = checkWinForAllPlayers(roomType);
    if (winners) handleWin(roomType, winners);
  }, 3000);
}

function handleWin(roomType, allWinners) {
  const room = rooms[roomType];
  const currentStage = room.currentStage;
  if (room.stageCompleted[currentStage]) return;
  room.stageCompleted[currentStage] = true;
  let prize = 0;
  if (currentStage === 'linha1') {
    prize = Math.floor(room.pot * 0.20);
    room.currentStage = 'linha2';
  } else if (currentStage === 'linha2') {
    prize = Math.floor(room.pot * 0.30);
    room.currentStage = 'bingo';
  } else if (currentStage === 'bingo') {
    prize = Math.floor(room.pot * 0.50);
    room.gameCompleted = true;
  }
  prize = Math.max(prize, 100);
  const results = distributePrize(room, allWinners, prize);
  results.forEach(result => {
    const player = room.players[result.playerId];
    player.winsCount = (player.winsCount || 0) + 1;
    player.currentWins = (player.currentWins || 0) + 1;
  });
  let jackpotWinners = [];
  let wonJackpot = false;
  if (currentStage === 'bingo' && room.drawnNumbers.length <= JACKPOT_BALL_LIMIT) {
    wonJackpot = true;
    const jackpotPrize = room.jackpot;
    room.jackpot = 1000000;
    jackpotWinners = distributePrize(room, allWinners, jackpotPrize);
  }
  const winnerNames = results.map(r => r.playerName).join(', ');
  const totalPrize = results.reduce((sum, r) => sum + r.prize, 0);
  
  const victoryMessage = getVictoryMessage(currentStage, winnerNames);
  io.to(roomType).emit('chat-message', {
    message: victoryMessage,
    sender: "Sistema",
    isBot: false
  });
  
  io.to(roomType).emit('player-won', {
    winners: results,
    winnerNames,
    totalPrize,
    newStage: room.currentStage,
    jackpotWinners: wonJackpot ? jackpotWinners : null,
    ballsCount: room.drawnNumbers.length,
    wonJackpot: wonJackpot
  });
  
  if (wonJackpot) {
    const jackpotNames = jackpotWinners.map(w => w.playerName).join(', ');
    io.to(roomType).emit('jackpot-won', {
      winnerNames: jackpotNames,
      jackpotAmount: room.jackpot,
      ballsCount: room.drawnNumbers.length
    });
    io.to(roomType).emit('chat-message', {
      message: `💰💰💰 JACKPOT HISTÓRICO! ${jackpotNames} ganharam o prêmio de R$ ${room.jackpot.toLocaleString('pt-BR')}!`,
      sender: "Sistema",
      isBot: false
    });
  }
  
  broadcastPlayerList(roomType);
  broadcastRanking(roomType);
  pauseDraw(roomType);
  setTimeout(() => {
    if (currentStage === 'bingo') {
      io.to(roomType).emit('game-over', `${winnerNames} fizeram bingo!`);
      io.to(roomType).emit('show-restart-button');
    } else {
      resumeDraw(roomType);
    }
  }, 5000);
}

function addBotToRoom(roomType, initialChips = INITIAL_CHIPS) {
  const room = rooms[roomType];
  const currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
  if (currentBots >= room.maxBots) return;
  
  const usedNames = new Set();
  Object.values(room.players).forEach(p => { if (p.isBot) usedNames.add(p.name); });
  let name;
  let attempts = 0;
  do {
    name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    attempts++;
  } while (usedNames.has(name) && attempts < 100);
  if (usedNames.has(name)) name = `${name} ${Math.floor(Math.random() * 1000)}`;
  
  const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
  
  const cardCount = MAX_CARDS_PER_PLAYER;
  const totalCost = cardCount * PRICE_PER_CARD;
  
  if (initialChips < totalCost) {
    return;
  }
  
  const cards90 = roomType === 'bingo90' 
    ? Array(cardCount).fill().map(() => validateAndFixBingo90Card(generateBingo90Card())) 
    : [];
  const cards75 = roomType === 'bingo75' 
    ? Array(cardCount).fill().map(() => generateBingo75Card()) 
    : [];
    
  room.players[botId] = {
    name: name,
    chips: initialChips - totalCost,
    isBot: true,
    cards75,
    cards90,
    winsCount: 0,
    currentWins: 0
  };
  
  room.pot += totalCost;
  room.jackpot += Math.floor(totalCost * 0.5);
  console.log(`🤖 Bot adicionado: ${name} comprou ${cardCount} cartelas. Pote atual: ${room.pot}`);
}

function broadcastPlayerList(roomType) {
  const room = rooms[roomType];
  if (!room) return;
  const players = Object.entries(room.players).map(([id, p]) => ({
    id, name: p.name, chips: p.chips, isBot: p.isBot, winsCount: p.winsCount || 0, currentWins: p.currentWins || 0
  }));
  const humanCount = players.filter(p => !p.isBot).length;
  const botCount = players.filter(p => p.isBot).length;
  const withoutChips = players.filter(p => p.chips <= 0);
  const withChips = players.filter(p => p.chips > 0).sort((a, b) => b.chips - a.chips);
  io.to(roomType).emit('player-list', { humanCount, botCount, withoutChips, withChips });
}

function broadcastRanking(roomType) {
  const room = rooms[roomType];
  if (!room) return;
  const rankedPlayers = Object.entries(room.players)
    .map(([id, player]) => ({ id, name: player.name, chips: player.chips, isBot: player.isBot }))
    .sort((a, b) => b.chips - a.chips)
    .map((player, index) => ({ ...player, position: index + 1 }));
  io.to(roomType).emit('ranking-update', rankedPlayers);
}

function addChipsToPlayer(roomType, playerName, amount) {
  const room = rooms[roomType];
  if (!room) return { success: false, message: `❌ Sala ${roomType} não encontrada.` };
  const playerId = Object.keys(room.players).find(id => room.players[id].name === playerName);
  if (!playerId) return { success: false, message: `❌ Jogador "${playerName}" não encontrado.` };
  room.players[playerId].chips += amount;
  io.to(playerId).emit('update-player', { chips: room.players[playerId].chips });
  broadcastPlayerList(roomType);
  broadcastRanking(roomType);
  return { success: true, message: `✅ ${amount} chips adicionados ao jogador "${playerName}".` };
}

function findPlayerByName(roomType, playerName) {
  const room = rooms[roomType];
  if (!room) return null;
  return Object.entries(room.players).find(([id, player]) => !player.isBot && player.name === playerName);
}

io.on('connection', (socket) => {
  console.log('🔌 Jogador conectado:', socket.id);

  socket.on('join-room', ({ playerName, roomType, savedChips, savedCards75, savedCards90 }) => {
    if (!rooms[roomType]) {
      socket.emit('error', 'Sala inválida');
      return;
    }
    
    playerName = sanitizeName(playerName);

    const room = rooms[roomType];
    const existingPlayer = findPlayerByName(roomType, playerName);
    let playerId, playerData;
    if (existingPlayer) {
      playerId = existingPlayer[0];
      playerData = existingPlayer[1];
      delete room.players[playerId];
      if (!room.gameCompleted) {
        playerData.cards75 = savedCards75?.map(c => c) || [];
        playerData.cards90 = (savedCards90 || []).map(c => validateAndFixBingo90Card(c));
      } else {
        playerData.cards75 = [];
        playerData.cards90 = [];
      }
      playerId = socket.id;
      room.players[playerId] = validatePlayerState(playerData, roomType);
    } else {
      playerId = socket.id;
      const initialChips = (savedChips != null && savedChips >= 0) ? savedChips : INITIAL_CHIPS;
      const cards75 = (!room.gameCompleted && savedCards75) ? savedCards75 : [];
      const cards90 = (!room.gameCompleted && savedCards90) ? savedCards90.map(c => validateAndFixBingo90Card(c)) : [];
      room.players[playerId] = validatePlayerState({
        name: playerName,
        chips: initialChips,
        isBot: false,
        cards75,
        cards90,
        winsCount: 0,
        currentWins: 0
      }, roomType);
    }
    
    socket.join(roomType);
    socket.data = { roomType };
    
    let currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
    while (currentBots < room.maxBots) {
      addBotToRoom(roomType);
      const newBotCount = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
      if (newBotCount === currentBots) break;
      currentBots = newBotCount;
    }
    
    socket.emit('room-welcome', {
      roomName: room.name,
      roomId: roomType,
      currentStage: room.currentStage,
      gameCompleted: room.gameCompleted
    });
    socket.emit('room-state', {
      drawnNumbers: room.drawnNumbers,
      lastNumber: room.lastNumber,
      gameActive: room.gameActive,
      pot: room.pot,
      currentStage: room.currentStage,
      jackpot: room.jackpot,
      gameCompleted: room.gameCompleted,
      players: Object.fromEntries(
        Object.entries(room.players).map(([id, p]) => [id, { 
          name: p.name, chips: p.chips, isBot: p.isBot,
          winsCount: p.winsCount, currentWins: p.currentWins
        }])
      )
    });
    const player = room.players[playerId];
    if (player.cards75.length > 0) {
      socket.emit('cards-received', { 
        cards: player.cards75.map(card => ({ 
          card, 
          ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers)
        })), 
        cardType: '75' 
      });
    }
    if (player.cards90.length > 0) {
      socket.emit('cards-received', { 
        cards: player.cards90.map(card => ({ 
          card: validateAndFixBingo90Card(card), 
          ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers),
          lineStatus: getLineStatusForCard(card, room.drawnNumbers)
        })), 
        cardType: '90' 
      });
    }
    broadcastPlayerList(roomType);
    broadcastRanking(roomType);
  });

  socket.on('buy-cards', ({ count, cardType }) => {
    try {
      const roomType = socket.data?.roomType;
      if (!roomType || !rooms[roomType]) return socket.emit('error', 'Sala inválida.');
      if (count < 1 || count > MAX_CARDS_PER_PLAYER) return socket.emit('error', `Compre entre 1 e ${MAX_CARDS_PER_PLAYER} cartelas.`);
      
      const room = rooms[roomType];
      const player = room.players[socket.id];
      if (!player || player.isBot) return;
      
      const currentCardCount = cardType === '75' ? player.cards75.length : player.cards90.length;
      if (currentCardCount + count > MAX_CARDS_PER_PLAYER) {
        return socket.emit('error', `Você já tem ${currentCardCount} cartelas. Máximo permitido: ${MAX_CARDS_PER_PLAYER}.`);
      }
      
      const totalCost = count * PRICE_PER_CARD;
      if (player.chips < totalCost) return socket.emit('error', 'Chips insuficientes');
      
      player.chips -= totalCost;
      room.pot += totalCost;
      room.jackpot += Math.floor(totalCost * 0.5);
      
      const cards = [];
      for (let i = 0; i < count; i++) {
        const card = cardType === '75' ? generateBingo75Card() : validateAndFixBingo90Card(generateBingo90Card());
        cards.push(card);
      }
      
      if (cardType === '75') player.cards75 = player.cards75.concat(cards);
      else player.cards90 = player.cards90.concat(cards);
      
      socket.emit('cards-received', { 
        cards: cards.map(card => ({ 
          card, 
          ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers),
          lineStatus: cardType === '90' ? getLineStatusForCard(card, room.drawnNumbers) : null
        })), 
        cardType 
      });
      
      io.to(socket.id).emit('update-player', { chips: player.chips });
      io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });
      broadcastPlayerList(roomType);
      broadcastRanking(roomType);
    } catch (err) {
      console.error('Erro buy-cards:', err);
      socket.emit('error', 'Erro ao comprar cartelas.');
    }
  });

  socket.on('start-draw', () => {
    const roomType = socket.data?.roomType;
    if (roomType && !rooms[roomType].gameActive) resumeDraw(roomType);
  });

  socket.on('claim-win', ({ winType }) => {
    try {
      const roomType = socket.data?.roomType;
      if (!roomType || !rooms[roomType]) return socket.emit('error', 'Sala inválida.');
      const room = rooms[roomType];
      const playerId = socket.id;
      const player = room.players[playerId];
      if (!player || player.isBot || winType !== room.currentStage || room.stageCompleted[winType]) {
        return socket.emit('error', 'Etapa inválida.');
      }
      let hasWon = false;
      for (let i = 0; i < player.cards90.length; i++) {
        const card = validateAndFixBingo90Card(player.cards90[i]);
        const result = checkCardAchievements(card, room.drawnNumbers);
        if ((winType === 'linha1' && result.linha1) ||
            (winType === 'linha2' && result.linha2) ||
            (winType === 'bingo' && result.bingo)) {
          hasWon = true; break;
        }
      }
      if (hasWon) {
        const allWinners = checkWinForAllPlayers(roomType);
        if (allWinners) handleWin(roomType, allWinners);
      } else {
        socket.emit('error', 'Você não completou esta etapa ainda.');
      }
    } catch (err) {
      console.error('Erro claim-win:', err);
      socket.emit('error', 'Erro ao reivindicar vitória.');
    }
  });

  socket.on('admin-add-chips', ({ playerName, amount, adminPassword }) => {
    const roomType = socket.data?.roomType;
    if (!roomType) return socket.emit('error', 'Sala inválida.');
    if (adminPassword !== ADMIN_PASSWORD) return socket.emit('error', 'Senha inválida.');
    const result = addChipsToPlayer(roomType, playerName, amount);
    socket.emit(result.success ? 'message' : 'error', result.message);
  });

  socket.on('restart-game', () => {
    const roomType = socket.data?.roomType;
    if (!roomType) return socket.emit('error', 'Sala inválida.');
    pauseDraw(roomType);
    const room = rooms[roomType];
    
    const allPlayers = {};
    for (const [id, player] of Object.entries(room.players)) {
      allPlayers[id] = {
        name: player.name,
        chips: player.chips,
        isBot: player.isBot,
        winsCount: player.winsCount || 0,
        cards75: [],
        cards90: [],
        currentWins: 0
      };
    }
    
    room.players = allPlayers;
    room.drawnNumbers = [];
    room.lastNumber = null;
    room.pot = 0;
    room.currentStage = 'linha1';
    room.stageCompleted = { linha1: false, linha2: false, bingo: false };
    room.gameCompleted = false;
    room.gameActive = false;
    
    let currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
    const botsToAdd = room.maxBots - currentBots;
    for (let i = 0; i < botsToAdd; i++) {
      addBotToRoom(roomType, INITIAL_CHIPS);
    }
    
    for (const [id, player] of Object.entries(room.players)) {
      if (player.isBot && player.cards90.length === 0 && player.cards75.length === 0) {
        const cardCount = Math.min(MAX_CARDS_PER_PLAYER, Math.floor(player.chips / PRICE_PER_CARD));
        if (cardCount > 0) {
          const totalCost = cardCount * PRICE_PER_CARD;
          player.chips -= totalCost;
          room.pot += totalCost;
          room.jackpot += Math.floor(totalCost * 0.5);
          
          if (roomType === 'bingo90') {
            player.cards90 = Array(cardCount).fill().map(() => validateAndFixBingo90Card(generateBingo90Card()));
          } else {
            player.cards75 = Array(cardCount).fill().map(() => generateBingo75Card());
          }
        }
      }
    }
    
    io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });
    io.to(roomType).emit('room-reset');
    broadcastPlayerList(roomType);
    broadcastRanking(roomType);
    console.log(`[${roomType}] Jogo reiniciado. ${Object.keys(room.players).filter(id => id.startsWith('bot_')).length} bots ativos.`);
  });

  socket.on('chat-message', ({ message, sender, isBot }) => {
    const roomType = socket.data?.roomType;
    if (!roomType || !rooms[roomType]) return;
    
    if (!isBot) {
      io.to(roomType).emit('chat-message', { message, sender, isBot: false });
      
      const lowerMsg = message.toLowerCase();
      const relevantKeywords = ['bingo', 'jogo', 'cartela', 'número', 'sorteio', 'como', 'regra', 'vitória', 'prêmio', 'chips', 'comprar', 'linha', 'jackpot', 'estratégia', 'bot', 'chat'];
      
      const isRelevant = relevantKeywords.some(keyword => lowerMsg.includes(keyword));
      if (isRelevant) {
        const aiResponses = [
          "No bingo, quanto mais cartelas você comprar, maiores suas chances!",
          "As regras são simples: complete linhas ou o bingo completo para ganhar prêmios!",
          "Estratégia real? Compre até 10 cartelas como todos os jogadores!",
          "O jackpot só ativa se você fizer bingo em menos de 60 bolas!",
          "Fique atento aos números sorteados e às suas cartelas próximas da vitória!",
          "Os bots também jogam com as mesmas regras que você!",
          "Cada fase tem seu prêmio: linha 1 (20%), linha 2 (30%) e bingo (50%) do pote!"
        ];
        const aiMessage = aiResponses[Math.floor(Math.random() * aiResponses.length)];
        setTimeout(() => {
          io.to(roomType).emit('chat-message', {
            message: aiMessage,
            sender: "🤖 SYSTEM",
            isBot: true
          });
        }, 1500);
      }
    }
  });

  socket.on('disconnect', () => {
    const roomType = socket.data?.roomType;
    if (roomType && rooms[roomType]) {
      const player = rooms[roomType].players[socket.id];
      if (player && !player.isBot) {
        console.log('👋 Jogador humano desconectado (mantido):', player.name);
      } else {
        delete rooms[roomType].players[socket.id];
      }
      socket.leave(roomType);
      broadcastPlayerList(roomType);
      broadcastRanking(roomType);
    }
  });
});

function validatePlayerState(player, roomType) {
  if (player.chips == null || typeof player.chips !== 'number' || player.chips < 0) player.chips = INITIAL_CHIPS;
  if (!Array.isArray(player.cards90)) player.cards90 = [];
  if (!Array.isArray(player.cards75)) player.cards75 = [];
  if (player.cards90.length > MAX_CARDS_PER_PLAYER) {
    player.cards90 = player.cards90.slice(0, MAX_CARDS_PER_PLAYER);
  }
  if (player.cards75.length > MAX_CARDS_PER_PLAYER) {
    player.cards75 = player.cards75.slice(0, MAX_CARDS_PER_PLAYER);
  }
  if (roomType === 'bingo90') player.cards90 = player.cards90.map(card => validateAndFixBingo90Card(card));
  return player;
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
