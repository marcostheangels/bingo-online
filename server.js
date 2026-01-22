// server.js — Bingo Multiplayer com todas as regras de Markim (VERSÃO FINAL)
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { loadDB, saveDB } = require('./db');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: "*" }
});

app.use(express.static('public'));

let db = loadDB();

let rooms = {
  bingo90: {
    players: {},
    drawnNumbers: [],
    gameStarted: false,
    gameCompleted: false,
    currentStage: 'linha1',
    pot: 0,
    jackpot: 0,
    lastNumber: null
  }
};

const HUMAN_NAMES = ['Markim', 'Marília'];

// === Geração de Cartela Corrigida ===
function generateValidBingo90Card() {
  const columns = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90]
  ];

  const colNumbers = columns.map(([min, max]) => {
    const pool = [];
    for (let i = min; i <= max; i++) pool.push(i);
    return pool.sort(() => 0.5 - Math.random()).slice(0, 3);
  });

  let card = Array(3).fill().map(() => Array(9).fill(null));

  for (let row = 0; row < 3; row++) {
    let filled = 0;
    const availableCols = [...Array(9).keys()].sort(() => 0.5 - Math.random());
    for (let col of availableCols) {
      if (filled >= 5) break;
      if (colNumbers[col].length > 0) {
        card[row][col] = colNumbers[col].pop();
        filled++;
      }
    }
    if (filled < 5) {
      for (let col = 0; col < 9 && filled < 5; col++) {
        if (card[row][col] === null && colNumbers[col].length > 0) {
          card[row][col] = colNumbers[col].pop();
          filled++;
        }
      }
    }
  }

  const total = card.flat().filter(n => n !== null).length;
  const linesOk = card.every(row => row.filter(n => n !== null).length === 5);
  if (total === 15 && linesOk) {
    return card;
  } else {
    return generateValidBingo90Card();
  }
}

// === Validação de Vitória ===
function isLineComplete(row, drawn) {
  const nums = row.filter(n => n !== null);
  if (nums.length !== 5) return false;
  return nums.every(n => drawn.includes(n));
}

function checkWin(card, drawn) {
  const l1 = isLineComplete(card[0], drawn);
  const l2 = isLineComplete(card[1], drawn);
  const l3 = isLineComplete(card[2], drawn);
  const complete = [l1, l2, l3].filter(Boolean).length;
  return {
    linha1: complete >= 1,
    linha2: complete >= 2,
    bingo: complete === 3
  };
}

function getWinningPlayers(room, winType) {
  const winners = [];
  for (const id in room.players) {
    const player = room.players[id];
    if (player.cards90) {
      for (const card of player.cards90) {
        const win = checkWin(card, room.drawnNumbers);
        if (win[winType]) {
          winners.push({ id, playerName: player.name });
          break;
        }
      }
    }
  }
  return winners;
}

function maybeAddBotAfterHumanWin(winnerName) {
  if (HUMAN_NAMES.includes(winnerName)) {
    const room = rooms.bingo90;
    const botId = `bot_auto_${Date.now()}`;
    room.players[botId] = {
      id: botId,
      name: `Bot Auto`,
      chips: 10000,
      isBot: true,
      cards90: [],
      connected: true
    };
    console.log(`✅ Bot adicionado após vitória de ${winnerName}`);
  }
}

// === Broadcasts ===
function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  io.to(roomId).emit('room-state', {
    players: room.players,
    drawnNumbers: room.drawnNumbers,
    lastNumber: room.lastNumber,
    currentStage: room.currentStage,
    gameCompleted: room.gameCompleted
  });
}

function broadcastPlayerList(roomId) {
  const room = rooms[roomId];
  const withChips = [];
  const withoutChips = [];

  for (const id in room.players) {
    const p = room.players[id];
    if (p.chips <= 0) {
      withoutChips.push({ name: p.name });
    } else {
      withChips.push({ name: p.name, chips: p.chips });
    }
  }

  io.to(roomId).emit('player-list', { withChips, withoutChips });
}

function broadcastRanking(roomId) {
  const room = rooms[roomId];
  const ranking = Object.values(room.players)
    .map(p => ({ name: p.name, chips: p.chips }))
    .sort((a, b) => b.chips - a.chips)
    .map((p, i) => ({ ...p, position: i + 1 }));

  io.to(roomId).emit('ranking-update', ranking);
}

function broadcastPot(roomId) {
  const room = rooms[roomId];
  io.to(roomId).emit('pot-update', {
    pot: room.pot,
    jackpot: room.jackpot
  });
}

// === Socket.IO ===
io.on('connection', (socket) => {
  console.log('🔌 Novo jogador conectado:', socket.id);

  socket.on('join-room', ({ playerName, roomType, savedChips, savedCards90 }) => {
    if (roomType !== 'bingo90') return;
    const roomId = 'bingo90';
    const room = rooms[roomId];

    let chips = 10000;
    let cards90 = [];

    if (db.players[playerName]) {
      chips = db.players[playerName].chips || 10000;
      cards90 = db.players[playerName].cards90 || [];
    } else if (savedChips) {
      chips = savedChips;
      cards90 = savedCards90 || [];
    }

    room.players[socket.id] = {
      id: socket.id,
      name: playerName,
      chips,
      isBot: false,
      cards90,
      connected: true
    };

    db.players[playerName] = { chips, cards90 };
    saveDB(db);

    // ✅ ADICIONAR 3 BOTS INICIAIS SE FOR MARKIM OU MARÍLIA E NÃO HOUVER BOTS
    const currentBots = Object.values(room.players).filter(p => p.isBot);
    if (currentBots.length === 0 && (playerName === 'Markim' || playerName === 'Marília')) {
      console.log(`🤖 Adicionando 3 bots iniciais para ${playerName}...`);
      for (let i = 1; i <= 3; i++) {
        const botId = `bot_initial_${i}_${Date.now()}`;
        room.players[botId] = {
          id: botId,
          name: `Bot ${i}`,
          chips: 10000,
          isBot: true,
          cards90: [],
          connected: true
        };
      }
      broadcastPlayerList('bingo90');
      broadcastRanking('bingo90');
    }

    socket.join(roomId);
    socket.emit('room-welcome', {
      roomId,
      roomName: 'Bingo 90',
      gameCompleted: room.gameCompleted,
      currentStage: room.currentStage
    });

    broadcastRoomState(roomId);
    broadcastPlayerList(roomId);
    broadcastRanking(roomId);
    broadcastPot(roomId);
  });

  socket.on('buy-cards', ({ count, cardType }) => {
    if (cardType !== '90') return;
    const room = rooms.bingo90;
    const player = room.players[socket.id];
    if (!player || room.gameStarted) return;

    const cost = count * 100;
    if (player.chips < cost) {
      socket.emit('error', 'Chips insuficientes!');
      return;
    }

    const newCards = [];
    for (let i = 0; i < count; i++) {
      newCards.push(generateValidBingo90Card());
    }

    player.cards90 = player.cards90.concat(newCards);
    player.chips -= cost;

    db.players[player.name] = { chips: player.chips, cards90: player.cards90 };
    saveDB(db);

    // Bots compram junto
    for (const id in room.players) {
      const p = room.players[id];
      if (p.isBot && !room.gameStarted) {
        const botNewCards = [];
        for (let i = 0; i < count; i++) {
          botNewCards.push(generateValidBingo90Card());
        }
        p.cards90 = p.cards90.concat(botNewCards);
        p.chips -= cost;
        if (p.chips < 0) p.chips = 0;
      }
    }

    socket.emit('cards-received', { cards: newCards.map(c => ({ card: c })), cardType: '90' });
    broadcastRoomState('bingo90');
    broadcastPlayerList('bingo90');
    broadcastRanking('bingo90');
  });

  socket.on('start-draw', () => {
    const room = rooms.bingo90;
    if (room.gameStarted || room.gameCompleted) return;

    const hasHumanWithCards = Object.values(room.players).some(p => !p.isBot && p.cards90.length > 0);
    if (!hasHumanWithCards) {
      io.to('bingo90').emit('message', 'É necessário pelo menos 1 humano com cartela para iniciar.');
      return;
    }

    room.gameStarted = true;
    room.drawnNumbers = [];
    room.lastNumber = null;
    room.pot = 0;
    room.jackpot = 0;

    for (const id in room.players) {
      const p = room.players[id];
      const spent = p.cards90.length * 100;
      room.pot += spent;
    }
    room.jackpot = room.pot;

    broadcastPot('bingo90');
    broadcastRoomState('bingo90');
    broadcastPlayerList('bingo90');

    drawNextNumber('bingo90', 0);
  });

  socket.on('claim-win', ({ winType }) => {
    const room = rooms.bingo90;
    if (!room.gameStarted || room.gameCompleted) return;

    const player = room.players[socket.id];
    if (!player) return;

    const winners = getWinningPlayers(room, winType);
    const thisPlayerWon = winners.some(w => w.id === socket.id);
    if (!thisPlayerWon) {
      socket.emit('error', 'Você não completou essa conquista!');
      return;
    }

    processWin(winType, room, winners);
  });

  // ✅ REINICIAR JOGO
  socket.on('restart-game', () => {
    const room = rooms.bingo90;
    if (!room.gameCompleted) {
      socket.emit('error', 'Só é possível reiniciar após o Bingo.');
      return;
    }
    resetRoom('bingo90');
    socket.emit('message', 'Jogo reiniciado!');
  });

  socket.on('disconnect', () => {
    const room = rooms.bingo90;
    if (room.players[socket.id]) {
      const player = room.players[socket.id];
      if (!room.gameStarted && player.cards90.length > 0) {
        const refund = player.cards90.length * 100;
        player.chips += refund;
        player.cards90 = [];

        db.players[player.name] = { chips: player.chips, cards90: [] };
        saveDB(db);
      }
      delete room.players[socket.id];
      broadcastPlayerList('bingo90');
      broadcastRanking('bingo90');
    }
  });
});

// === Lógica de Jogo ===
function processWin(winType, room, winners) {
  if (winners.length === 0 || room.gameCompleted) return;

  const prize = Math.floor(room.pot / winners.length);
  const jackpotPrize = winType === 'bingo' ? Math.floor(room.jackpot / winners.length) : 0;

  const winnerNames = winners.map(w => w.playerName);
  winnerNames.forEach(name => {
    if (winType === 'bingo') {
      maybeAddBotAfterHumanWin(name);
    }
  });

  winners.forEach(w => {
    const player = room.players[w.id];
    if (player) {
      player.chips += prize;
      if (jackpotPrize) player.chips += jackpotPrize;
      db.players[player.name] = { chips: player.chips, cards90: player.cards90 };
    }
  });
  saveDB(db);

  if (winType === 'linha1') {
    room.currentStage = 'linha2';
  } else if (winType === 'linha2') {
    room.currentStage = 'bingo';
  } else if (winType === 'bingo') {
    room.gameCompleted = true;
    room.gameStarted = false;
  }

  io.to('bingo90').emit('player-won', {
    winners: winners.map(w => ({ playerName: w.playerName, prize, winType })),
    winnerNames: winnerNames.join(', '),
    jackpotWinners: jackpotPrize ? winners.map(w => ({ playerName: w.playerName, prize: jackpotPrize })) : null,
    newStage: room.currentStage
  });

  if (winType !== 'bingo' && !room.gameCompleted) {
    setTimeout(() => {
      drawNextNumber('bingo90', room.drawnNumbers.length);
    }, 3000);
  }

  if (winType === 'bingo') {
    setTimeout(() => resetRoom('bingo90'), 6000);
  }

  broadcastRoomState('bingo90');
  broadcastPlayerList('bingo90');
  broadcastRanking('bingo90');
  broadcastPot('bingo90');
}

function drawNextNumber(roomId, index) {
  const room = rooms[roomId];
  if (!room.gameStarted || room.gameCompleted) return;
  if (index >= 90 || room.drawnNumbers.length >= 90) return;

  const used = new Set(room.drawnNumbers);
  let number;
  do {
    number = Math.floor(Math.random() * 90) + 1;
  } while (used.has(number) && used.size < 90);

  if (used.size >= 90) return;

  room.drawnNumbers.push(number);
  room.lastNumber = number;

  io.to(roomId).emit('number-drawn', {
    number,
    drawnNumbers: [...room.drawnNumbers]
  });

  let shouldContinue = true;
  if (room.currentStage === 'linha1') {
    const winners = getWinningPlayers(room, 'linha1');
    if (winners.length > 0) {
      processWin('linha1', room, winners);
      shouldContinue = false;
    }
  } else if (room.currentStage === 'linha2') {
    const winners = getWinningPlayers(room, 'linha2');
    if (winners.length > 0) {
      processWin('linha2', room, winners);
      shouldContinue = false;
    }
  } else if (room.currentStage === 'bingo') {
    const winners = getWinningPlayers(room, 'bingo');
    if (winners.length > 0) {
      processWin('bingo', room, winners);
      shouldContinue = false;
    }
  }

  if (shouldContinue && !room.gameCompleted) {
    setTimeout(() => drawNextNumber(roomId, index + 1), 3000);
  }
}

function resetRoom(roomId) {
  const room = rooms[roomId];
  room.drawnNumbers = [];
  room.gameStarted = false;
  room.gameCompleted = false;
  room.currentStage = 'linha1';
  room.lastNumber = null;
  room.pot = 0;
  room.jackpot = 0;

  for (const id in room.players) {
    const p = room.players[id];
    if (!p.isBot) {
      p.cards90 = [];
      if (db.players[p.name]) {
        db.players[p.name].cards90 = [];
        saveDB(db);
      }
    }
  }

  io.to(roomId).emit('room-reset');
  broadcastRoomState(roomId);
  broadcastPlayerList(roomId);
  broadcastRanking(roomId);
  broadcastPot(roomId);
}

// Iniciar backup
require('./backup');

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
