const express = require('express');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = require('socket.io')(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

// ✅ Nomes de bots 100% únicos e engraçados
const BOT_NAMES = [
  "Bibiu", "Casca de Ferida", "Cão Chupando Manga", "Karatê", "Chico Tripa", 
  "Zé da Foice", "Venta de Ventoinha", "Sete de Ouro", "Galego do Zinho", "Totonho", 
  "Peba", "Rabo de Peixe", "Zé Moleza", "Cara de Broa", "Furico de Rato",
  "Mão de Gancho", "Tico-Tico", "Pinta Roxa", "Galinha Morta", "Boca de Caçapa",
  "Saco de Estopa", "Meia-Noite", "Catuaba", "Pau de Virar Tripa", "Caneca furada",
  "Zé Magrelo", "Curimbatá", "Bagre Ensaboado", "Pipoca", "Espalha Brasa",
  "Biu do Rádio", "Bucho de Porco", "Cara de Jaca", "Perna de Vidro", "Mão de Vaca",
  "Zé do Caixão",
  "Testa de Ferro", "Cabeça de Pudim", "Garganta de Aluguel", "Lambari", "Tiririca",
  "Quincas","Chicote", "Pelo de Rato", "Sapo Boi", "Boca de Veludo",
  "Cara de Coruja", "Olho de Peixe Morto", "Pintinho Amarelinho", "Boneco de Olinda", "Rabo de Galo",
  "Chupeta de Baleia", "Fogo na Roupa", "Mata Gato", "Bucho de Melancia",
  "Arreio de Prata", "Cabelo de Anjo", "Pé de Pano", "Gato Pingado",
  "Zé Preguiça", "Coração de Boi", "Cara de Chinelo", "Mão de Tesoura", "Boca de Chupeta",
  "Perna de Grilo", "Cabeça de Ovo", "Venta de Cavalo", "Meio Quilo", "Sete Gatos",
  "Rabo de Lagartixa", "Cara de Paisagem", "Olho de Tandera", "Cabelo de Fogo", "Zé do Apito",
  "Mata-Sete", "Saco de Pancada", "Pão com Ovo", "Bucho de Veado", "Cara de Cuia", "Perna de Pau",
  "Mão de Alface", "Boca de Forno", "Cabeça de Bagre", "Venta de Fole", "Meia Sola", "Sete Quedas",
  "Rabo de Arraia", "Cara de Tacho", "Olho de Vidro", "Cabelo de Milho", "Zé da Pinga", "Mata Burro",
  "Saco Vacuo", "Pão de Queijo", "Bucho de Égua", "Cara de Tabua", "Perna de Louva-a-Deus",
  "Mão de Remela", "Boca de Urna", "Pacatuba"
];

const rooms = {
  'bingo75': { 
    name: 'Bingo 75 (Americano)', 
    players: {}, 
    drawnNumbers: [], 
    gameActive: false, 
    lastNumber: null,
    maxBots: 50,
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
    maxBots: 50,
    pot: 0,
    drawInterval: null,
    currentStage: 'linha1',
    stageCompleted: { linha1: false, linha2: false, bingo: false },
    jackpot: 1000000,
    gameCompleted: false
  }
};

const PRICE_PER_CARD = 100;
const JACKPOT_BALL_LIMIT = 40;

// ✅ FUNÇÃO DE LOG INTELIGENTE
function logError(context, error, metadata = {}) {
  console.error(`[ERRO ${context}]`, error, metadata);
}

// ✅ VALIDAÇÃO E CORREÇÃO DE CARTELA BINGO 90
function validateAndFixBingo90Card(card) {
  if (!Array.isArray(card) || card.length !== 3) {
    return generateBingo90Card();
  }

  const columns = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90]
  ];

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
        do {
          novo = Math.floor(Math.random() * (max - min + 1)) + min;
        } while (usedNumbers.has(novo));
        card[r][c] = novo;
        fixed = true;
      } else {
        usedNumbers.add(val);
      }
    }
  }

  if (fixed) {
    console.warn('Cartela corrigida automaticamente.');
  }
  return card;
}

// ✅ VALIDAR ESTADO DO JOGADOR
function validatePlayerState(player, roomType) {
  if (player.chips == null || typeof player.chips !== 'number' || player.chips < 0) {
    console.warn('Chips inválidos corrigidos para 10000.');
    player.chips = 10000;
  }

  if (!Array.isArray(player.cards90)) player.cards90 = [];
  if (!Array.isArray(player.cards75)) player.cards75 = [];

  if (roomType === 'bingo90') {
    player.cards90 = player.cards90.map(card => validateAndFixBingo90Card(card));
  }

  return player;
}

function generateBingo90Card() {
  const columns = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90]
  ];
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
  positions.forEach(pos => {
    const [min, max] = columns[pos.col];
    let num;
    do {
      num = Math.floor(Math.random() * (max - min + 1)) + min;
    } while (usedNumbers.has(num));
    usedNumbers.add(num);
    card[pos.row][pos.col] = num;
  });

  return card;
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

function checkCardAchievements(card, drawnNumbers, cardType) {
  if (cardType === '75') {
    return { linha1: false, linha2: false, bingo: false };
  }

  const markedInRow = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      if (card[r][c] !== null && drawnNumbers.includes(card[r][c])) {
        markedInRow[r]++;
      }
    }
  }

  const linha1 = markedInRow.some(count => count === 5);
  const completeLines = markedInRow.filter(count => count === 5).length;
  const linha2 = completeLines >= 2;
  const bingo = completeLines === 3;

  return { linha1, linha2, bingo, markedInRow, completeLines };
}

function calculateBallsLeftForCard(card, drawnNumbers, cardType) {
  if (cardType === '75') {
    return { min: Infinity };
  }

  const markedInRow = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      if (card[r][c] !== null && drawnNumbers.includes(card[r][c])) {
        markedInRow[r]++;
      }
    }
  }

  const ballsForLine1 = Math.min(
    5 - markedInRow[0],
    5 - markedInRow[1],
    5 - markedInRow[2]
  );
  
  const sortedLines = [...markedInRow].sort((a, b) => b - a);
  const ballsForLine2 = (5 - sortedLines[0]) + (5 - sortedLines[1]);
  const ballsForBingo = 15 - (markedInRow[0] + markedInRow[1] + markedInRow[2]);

  let minBalls = Infinity;
  if (sortedLines[2] < 5) minBalls = Math.min(minBalls, ballsForLine1);
  if (sortedLines[1] < 5) minBalls = Math.min(minBalls, ballsForLine2);
  if (sortedLines[0] < 5) minBalls = Math.min(minBalls, ballsForBingo);

  return { min: Math.max(0, minBalls) };
}

// ✅ LÓGICA CORRIGIDA: BOTS AGORA GANHAM!
function checkWinForAllPlayers(roomType) {
  const room = rooms[roomType];
  const currentStage = room.currentStage;
  if (room.stageCompleted[currentStage]) return null;

  const humansWithWin = [];
  const botsWithWin = [];

  for (const [playerId, player] of Object.entries(room.players)) {
    const cards = player.cards90 || [];
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const result = checkCardAchievements(card, room.drawnNumbers, '90');
      let hasWon = false;

      if (currentStage === 'linha1' && result.linha1) {
        hasWon = true;
      } else if (currentStage === 'linha2' && result.linha2) {
        hasWon = true;
      } else if (currentStage === 'bingo' && result.bingo) {
        hasWon = true;
      }

      if (hasWon) {
        const winData = { playerId, cardIndex: i, winType: currentStage };
        if (player.isBot) {
          botsWithWin.push(winData);
        } else {
          humansWithWin.push(winData);
        }
      }
    }
  }

  // ✅ CORREÇÃO: Se houver vencedores, alguém deve ganhar
  if (humansWithWin.length > 0 || botsWithWin.length > 0) {
    // Prioridade para humanos (70%)
    if (humansWithWin.length > 0 && Math.random() < 0.7) {
      return humansWithWin[Math.floor(Math.random() * humansWithWin.length)];
    }
    // Se não escolher humano, mas houver bots, escolher bot
    if (botsWithWin.length > 0) {
      return botsWithWin[Math.floor(Math.random() * botsWithWin.length)];
    }
    // Caso raro: só humanos, mas não foi escolhido → garantir vitória
    if (humansWithWin.length > 0) {
      return humansWithWin[Math.floor(Math.random() * humansWithWin.length)];
    }
  }

  return null;
}

function pauseDraw(roomType) {
  const room = rooms[roomType];
  if (room.drawInterval) {
    clearInterval(room.drawInterval);
    room.drawInterval = null;
    room.gameActive = false;
  }
}

// ✅ REMOVIDO O DELAY PARA BOTS — VITÓRIA IMEDIATA E JUSTA
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

    // ✅ CHAMADA DIRETA — SEM SIMULAÇÃO DE DELAY
    const winner = checkWinForAllPlayers(roomType);
    if (winner) {
      handleWin(roomType, winner.playerId, { winType: winner.winType, cardIndex: winner.cardIndex });
    }
  }, 3000);
}

function handleWin(roomType, playerId, result) {
  const room = rooms[roomType];
  const player = room.players[playerId];
  if (!player) return;

  const winType = result.winType;
  if (room.stageCompleted[winType]) return;

  room.stageCompleted[winType] = true;

  let prize = 0;
  if (winType === 'linha1') {
    prize = Math.floor(room.pot * 0.20);
    room.currentStage = 'linha2';
  } else if (winType === 'linha2') {
    prize = Math.floor(room.pot * 0.30);
    room.currentStage = 'bingo';
  } else if (winType === 'bingo') {
    prize = Math.floor(room.pot * 0.50);
    room.gameCompleted = true;
  }

  prize = Math.max(prize, 100);
  player.chips += prize;

  player.winsCount = (player.winsCount || 0) + 1;
  player.currentWins = (player.currentWins || 0) + 1;

  let jackpotPrize = 0;
  let wonJackpot = false;
  if (winType === 'bingo' && room.drawnNumbers.length <= JACKPOT_BALL_LIMIT) {
    jackpotPrize = room.jackpot;
    player.chips += jackpotPrize;
    wonJackpot = true;
    // ✅ Jackpot reseta SOMENTE quando é ganho
    room.jackpot = 1000000;
  }

  let completedLines = [];
  if (winType !== 'bingo') {
    const card = player.cards90[result.cardIndex];
    const markedInRow = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        if (card[r][c] !== null && room.drawnNumbers.includes(card[r][c])) {
          markedInRow[r]++;
        }
      }
    }
    for (let r = 0; r < 3; r++) {
      if (markedInRow[r] === 5) {
        completedLines.push(r);
      }
    }
  }

  io.to(roomType).emit('player-won', {
    playerId,
    playerName: player.name,
    winType,
    prize,
    isBot: player.isBot,
    cardIndex: result.cardIndex,
    newStage: room.currentStage,
    jackpot: wonJackpot ? jackpotPrize : null,
    winsCount: player.winsCount,
    currentWins: player.currentWins,
    completedLines: completedLines
  });

  if (wonJackpot) {
    io.to(roomType).emit('jackpot-won', {
      playerName: player.name,
      jackpotAmount: jackpotPrize,
      ballsCount: room.drawnNumbers.length
    });
  }

  broadcastPlayerList(roomType);

  pauseDraw(roomType);

  setTimeout(() => {
    if (winType === 'bingo') {
      io.to(roomType).emit('game-over', `${player.name} fez bingo!`);
      io.to(roomType).emit('show-restart-button');
    } else {
      resumeDraw(roomType);
    }
  }, 5000);
}

function addBotToRoom(roomType, initialChips = 1000000) {
  const room = rooms[roomType];
  const currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
  if (currentBots >= room.maxBots) return;

  const usedNames = new Set();
  Object.values(room.players).forEach(p => {
    if (p.isBot) usedNames.add(p.name);
  });

  let name;
  let attempts = 0;
  do {
    name = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    attempts++;
  } while (usedNames.has(name) && attempts < 100);

  if (usedNames.has(name)) {
    name = `${name} ${Math.floor(Math.random() * 1000)}`;
  }

  const botId = `bot_${Date.now()}_${Math.floor(Math.random() * 10000)}`;

  const cardCount = 1000;
  const totalCost = cardCount * PRICE_PER_CARD;

  if (initialChips < totalCost) {
    console.warn(`Bot ${name} não tem chips suficientes para comprar cartelas.`);
    return;
  }

  const cards90 = roomType === 'bingo90' ? Array(cardCount).fill().map(() => generateBingo90Card()) : [];
  const cards75 = roomType === 'bingo75' ? Array(cardCount).fill().map(() => generateBingo75Card()) : [];

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

  io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });
}

function broadcastPlayerList(roomType) {
  const room = rooms[roomType];
  const playerList = Object.entries(room.players).map(([id, p]) => {
    let displayName = p.name;
    if (p.chips <= 0 && p.isBot) {
      displayName += " ❌";
    } else {
      displayName += ` (${p.chips.toLocaleString('pt-BR')})`;
    }
    return {
      id,
      name: displayName,
      isBot: !!p.isBot,
      winsCount: p.winsCount || 0,
      currentWins: p.currentWins || 0,
      chips: p.chips
    };
  });
  io.to(roomType).emit('player-list', playerList);
}

function addChipsToPlayer(roomType, playerName, amount) {
  const room = rooms[roomType];
  if (!room) {
    return { success: false, message: `❌ Sala ${roomType} não encontrada.` };
  }

  const playerId = Object.keys(room.players).find(id => room.players[id].name === playerName);
  if (!playerId) {
    return { success: false, message: `❌ Jogador "${playerName}" não encontrado.` };
  }

  const player = room.players[playerId];
  player.chips += amount;

  io.to(playerId).emit('update-player', { chips: player.chips });
  broadcastPlayerList(roomType);

  return { success: true, message: `✅ ${amount} chips adicionados ao jogador "${playerName}". Novo saldo: ${player.chips}` };
}

function findPlayerByName(roomType, playerName) {
  const room = rooms[roomType];
  if (!room) return null;
  return Object.entries(room.players).find(([id, player]) => 
    !player.isBot && player.name === playerName
  );
}

io.on('connection', (socket) => {
  console.log('🔌 Jogador conectado:', socket.id);

  socket.on('join-room', ({ playerName, roomType, savedChips, savedCards75, savedCards90 }) => {
    if (!rooms[roomType]) {
      socket.emit('error', 'Sala inválida');
      return;
    }

    const room = rooms[roomType];
    
    const existingPlayer = findPlayerByName(roomType, playerName);
    let playerId;
    let playerData;

    if (existingPlayer) {
      playerId = existingPlayer[0];
      playerData = existingPlayer[1];
      delete room.players[playerId];
      
      if (!room.gameCompleted) {
        playerData.cards75 = savedCards75 || [];
        playerData.cards90 = savedCards90 || [];
      } else {
        playerData.cards75 = [];
        playerData.cards90 = [];
      }
      
      playerId = socket.id;
      room.players[playerId] = validatePlayerState(playerData, roomType);
    } else {
      playerId = socket.id;
      const initialChips = (savedChips != null && savedChips >= 0) ? savedChips : 10000;
      
      const cards75 = (!room.gameCompleted && savedCards75) ? savedCards75 : [];
      const cards90 = (!room.gameCompleted && savedCards90) ? savedCards90 : [];
      
      room.players[playerId] = validatePlayerState({
        name: playerName,
        chips: initialChips,
        isBot: false,
        cards75,
        cards90,
        winsCount: 0,
        currentWins: 0
      }, roomType);

      let currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
      while (currentBots < room.maxBots) {
        addBotToRoom(roomType);
        currentBots++;
      }
    }

    socket.join(roomType);
    socket.data = { roomType };

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
          name: p.name, 
          chips: p.chips, 
          isBot: p.isBot,
          winsCount: p.winsCount,
          currentWins: p.currentWins
        }])
      )
    });

    const player = room.players[playerId];
    if (player.cards75.length > 0) {
      const cards75WithBalls = player.cards75.map(card => ({
        card: card,
        ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers, '75')
      }));
      socket.emit('cards-received', { cards: cards75WithBalls, cardType: '75' });
    }
    if (player.cards90.length > 0) {
      const cards90WithBalls = player.cards90.map(card => ({
        card: validateAndFixBingo90Card(card),
        ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers, '90')
      }));
      socket.emit('cards-received', { cards: cards90WithBalls, cardType: '90' });
    }

    broadcastPlayerList(roomType);
  });

  socket.on('buy-cards', ({ count, cardType }) => {
    try {
      const roomType = socket.data?.roomType;
      if (!roomType || !rooms[roomType]) {
        socket.emit('error', 'Você não está em uma sala válida.');
        return;
      }

      if (count < 1 || count > 1000) {
        socket.emit('error', 'Você pode comprar entre 1 e 1000 cartelas.');
        return;
      }

      const room = rooms[roomType];
      const player = room.players[socket.id];
      if (!player || player.isBot) return;

      const totalCost = count * PRICE_PER_CARD;
      if (player.chips < totalCost) {
        socket.emit('error', 'Chips insuficientes');
        return;
      }

      player.chips -= totalCost;
      room.pot += totalCost;
      room.jackpot += Math.floor(totalCost * 0.5);

      const cards = [];
      for (let i = 0; i < count; i++) {
        const card = cardType === '75' ? generateBingo75Card() : generateBingo90Card();
        cards.push(card);
      }

      if (cardType === '75') {
        player.cards75 = player.cards75.concat(cards);
      } else {
        player.cards90 = player.cards90.concat(cards);
      }

      const cardsWithBalls = cards.map(card => ({
        card: card,
        ballsLeft: calculateBallsLeftForCard(card, room.drawnNumbers, cardType)
      }));

      io.to(socket.id).emit('update-player', { chips: player.chips });
      socket.emit('cards-received', { cards: cardsWithBalls, cardType });
      io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });
      broadcastPlayerList(roomType);
    } catch (err) {
      logError('buy-cards', err, { playerId: socket.id });
      socket.emit('error', 'Erro ao comprar cartelas. Tente novamente.');
    }
  });

  socket.on('start-draw', () => {
    const roomType = socket.data?.roomType;
    if (!roomType || !rooms[roomType]) {
      socket.emit('error', 'Você não está em uma sala válida.');
      return;
    }

    const room = rooms[roomType];
    if (!room.gameActive) {
      resumeDraw(roomType);
    }
  });

  socket.on('claim-win', ({ winType }) => {
    try {
      const roomType = socket.data?.roomType;
      if (!roomType || !rooms[roomType]) {
        socket.emit('error', 'Você não está em uma sala válida.');
        return;
      }

      const room = rooms[roomType];
      const playerId = socket.id;
      const player = room.players[playerId];

      if (!player || player.isBot || winType !== room.currentStage || room.stageCompleted[winType]) {
        socket.emit('error', 'Etapa inválida ou já concluída.');
        return;
      }

      let hasWon = false;
      let winningCardIndex = -1;

      for (let i = 0; i < player.cards90.length; i++) {
        const result = checkCardAchievements(player.cards90[i], room.drawnNumbers, '90');
        if (
          (winType === 'linha1' && result.linha1) ||
          (winType === 'linha2' && result.linha2) ||
          (winType === 'bingo' && result.bingo)
        ) {
          hasWon = true;
          winningCardIndex = i;
          break;
        }
      }

      if (hasWon) {
        if (Math.random() < 0.7) {
          handleWin(roomType, playerId, { winType, cardIndex: winningCardIndex });
        } else {
          socket.emit('error', 'Você completou a etapa, mas não foi escolhido como vencedor desta rodada.');
        }
      } else {
        socket.emit('error', 'Você não completou esta etapa ainda.');
      }
    } catch (err) {
      logError('claim-win', err, { playerId: socket.id });
      socket.emit('error', 'Erro ao reivindicar vitória.');
    }
  });

  socket.on('admin-add-chips', ({ playerName, amount, adminPassword }) => {
    const roomType = socket.data?.roomType;
    if (!roomType || !rooms[roomType]) {
      socket.emit('error', 'Você não está em uma sala válida.');
      return;
    }

    if (adminPassword !== '0589') {
      socket.emit('error', 'Senha de admin inválida.');
      return;
    }

    const result = addChipsToPlayer(roomType, playerName, amount);
    socket.emit(result.success ? 'message' : 'error', result.message);
  });

  socket.on('restart-game', () => {
    const roomType = socket.data?.roomType;
    if (!roomType || !rooms[roomType]) {
      socket.emit('error', 'Você não está em uma sala válida.');
      return;
    }

    const room = rooms[roomType];
    pauseDraw(roomType);

    // ✅ Manter TODOS os jogadores (humanos e bots) com seus chips reais
    const allPlayers = {};
    for (const [id, player] of Object.entries(room.players)) {
      allPlayers[id] = validatePlayerState({
        name: player.name,
        chips: player.chips,
        isBot: player.isBot,
        winsCount: player.winsCount || 0,
        cards75: [],
        cards90: [],
        currentWins: 0
      }, roomType);
    }

    room.players = allPlayers;
    room.drawnNumbers = [];
    room.lastNumber = null;
    room.pot = 0;
    // ✅ Jackpot NÃO reseta
    room.currentStage = 'linha1';
    room.stageCompleted = { linha1: false, linha2: false, bingo: false };
    room.gameCompleted = false;
    room.gameActive = false;

    // ✅ Recomprar cartelas para bots com chips suficientes
    let activeBots = 0;
    for (const [id, player] of Object.entries(room.players)) {
      if (player.isBot && player.chips > 0) {
        const cardCount = 1000;
        const totalCost = cardCount * PRICE_PER_CARD;
        if (player.chips >= totalCost) {
          player.cards90 = roomType === 'bingo90' ? Array(cardCount).fill().map(() => generateBingo90Card()) : [];
          player.cards75 = roomType === 'bingo75' ? Array(cardCount).fill().map(() => generateBingo75Card()) : [];
          player.chips -= totalCost;
          room.pot += totalCost;
          room.jackpot += Math.floor(totalCost * 0.5);
          activeBots++;
        }
      }
    }

    // ✅ Se restarem MENOS de 10 bots ativos, adicionar novos
    if (activeBots < 10) {
      const botsToAdd = 50 - Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
      for (let i = 0; i < botsToAdd && i < 40; i++) {
        addBotToRoom(roomType, 1000000); // ✅ Novos bots com 1 milhão
      }
    }

    io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });
    io.to(roomType).emit('room-reset');
    broadcastPlayerList(roomType);
    
    console.log(`[${roomType}] Jogo reiniciado. Bots ativos: ${activeBots}`);
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
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
