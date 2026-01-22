// server.js — Bingo Multiplayer com limite de 10 cartelas, IA, moderação e lógica justa
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

const FUNNY_BOT_NAMES = [
  "Tio do Mução", "Zé do Caixão", "Seu Creysson", "Dona Biscoito",
  "Mané Treme-Treme", "Maria Espetinho", "Chico Furacão", "Tonhão da Lata",
  "Seu Madruga Rico", "Dona Cotinha", "Zé Gotinha", "Seu Lunga",
  "Biscoito Amargo", "Tia Nastácia", "Seu Barriga"
];

const WIN_MESSAGES = {
  linha1: [
    "🔥 Que rápido! Linha 1 garantida!",
    "🎯 Acertou em cheio! Linha 1 na lata!",
    "✨ Sortudo(a)! Primeira linha completa!",
    "🚀 Começou bem! Linha 1 conquistada!"
  ],
  linha2: [
    "🎊 Dupla vitória! Duas linhas completas!",
    "💥 Não para mais! Linhas 1 e 2 fechadas!",
    "🌟 Quase lá! Só falta o Bingo agora!",
    "🏆 Dominando o jogo! Duas linhas no bolso!"
  ],
  bingo: [
    "🎉 BINGO! O(A) campeão(ã) chegou!",
    "💎 INCRÍVEL! Cartela completa — BINGO!",
    "👑 REI/RAINHA DO BINGO! Parabéns!",
    "🎁 BINGO! A sorte está ao seu lado!"
  ],
  jackpot: [
    "💰 JACKPOT! Você levou tudo!",
    "🤑 MEGA PRÊMIO! O Jackpot é seu!",
    "💫 FORTUNA! Jackpot garantido!",
    "🏆 LENDÁRIO! Você acertou o Jackpot!"
  ]
};

let pendingBotsToAdd = [];
const mutedPlayers = new Map();
const BAD_WORDS = [
  'merda', 'caralho', 'puta', 'filho da puta', 'fdp', 'bosta', 'idiota', 'burro', 'otário',
  'cuzão', 'vai se foder', 'se foder', 'arrombado', 'desgraça', 'porra', 'cacete'
];

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
    pendingBotsToAdd.push(true);
    console.log(`✅ Bot pendente adicionado após vitória de ${winnerName}`);
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
  return ranking;
}

function broadcastPot(roomId) {
  const room = rooms[roomId];
  io.to(roomId).emit('pot-update', {
    pot: room.pot,
    jackpot: room.jackpot
  });
}

// ✅ IA Inteligente no Chat
function aiRespond(message, senderSocketId, room) {
  const msgLower = message.toLowerCase().trim();
  const ranking = Object.values(room.players)
    .map(p => ({ name: p.name, chips: p.chips }))
    .sort((a, b) => b.chips - a.chips);

  const topPlayer = ranking.length > 0 ? ranking[0].name : 'ninguém';
  const topChips = ranking.length > 0 ? ranking[0].chips.toLocaleString('pt-BR') : '0';

  let response = "";

  if (msgLower.includes('quem') && (msgLower.includes('lider') || msgLower.includes('primeiro') || msgLower.includes('top'))) {
    response = `🏆 O líder do ranking é ${topPlayer} com R$ ${topChips} em chips!`;
  } else if (msgLower.includes('como') && (msgLower.includes('jogar') || msgLower.includes('bingo'))) {
    response = `🎲 Compre até 10 cartelas, inicie o sorteio e marque os números! Complete Linha 1, Linha 2 ou BINGO para ganhar prêmios!`;
  } else if (msgLower.includes('dica') || msgLower.includes('conselho')) {
    response = `💡 Dica: compre até 10 cartelas para maximizar suas chances! Mas cuidado com os bots — eles também compram até 10!`;
  } else if (msgLower.includes('bot') || msgLower.includes('quem tá jogando')) {
    const bots = Object.values(room.players).filter(p => p.isBot).map(p => p.name);
    const humans = Object.values(room.players).filter(p => !p.isBot).map(p => p.name);
    response = `👥 Humanos: ${humans.length > 0 ? humans.join(', ') : 'nenhum'} | Bots: ${bots.length > 0 ? bots.join(', ') : 'nenhum'}`;
  } else if (msgLower.includes('pote') || msgLower.includes('prêmio')) {
    response = `💰 Pote atual: R$ ${room.pot.toLocaleString('pt-BR')} | Jackpot: R$ ${room.jackpot.toLocaleString('pt-BR')}`;
  } else if (msgLower.includes('ajuda') || msgLower.includes('help')) {
    response = `❓ Digite: "quem é o líder?", "como jogar?", "dica", "quem tá jogando?", "pote" ou "prêmio"!`;
  } else if (msgLower.includes('olá') || msgLower.includes('oi') || msgLower.includes('opa')) {
    response = `👋 Olá, ${room.players[senderSocketId]?.name || 'amigo'}! Vamos jogar Bingo? 🎰`;
  } else if (msgLower.includes('sorte') || msgLower.includes('ganhar')) {
    response = `🍀 A sorte está lançada! Compre até 10 cartelas e tente seu BINGO hoje!`;
  } else {
    const encouragements = [
      `🌟 ${room.players[senderSocketId]?.name || 'Jogador'}, compre até 10 cartelas! Sua sorte pode estar a uma bola de distância!`,
      `🎯 O próximo número pode ser o seu! Não desista!`,
      `💥 Bots estão atentos... mas você é humano! Mostre quem manda!`,
      `🎰 Seu BINGO está quase lá! Continue jogando!`
    ];
    response = encouragements[Math.floor(Math.random() * encouragements.length)];
  }

  return response;
}

// === Socket.IO ===
io.on('connection', (socket) => {
  console.log('🔌 Novo jogador conectado:', socket.id);

  socket.on('chat-message', ({ message, sender, isBot }) => {
    const now = Date.now();
    if (mutedPlayers.has(socket.id)) {
      const unmuteTime = mutedPlayers.get(socket.id);
      if (now < unmuteTime) {
        const remaining = Math.ceil((unmuteTime - now) / 60000);
        socket.emit('error', `Você está silenciado por ${remaining} minuto(s).`);
        return;
      } else {
        mutedPlayers.delete(socket.id);
      }
    }

    const msgLower = message.toLowerCase();
    const hasBadWord = BAD_WORDS.some(word => msgLower.includes(word));
    if (hasBadWord) {
      mutedPlayers.set(socket.id, now + 5 * 60 * 1000);
      socket.emit('error', '⚠️ Mensagem bloqueada! Você foi silenciado por 5 minutos por uso de linguagem inadequada.');
      io.to('bingo90').emit('chat-message', {
        sender: "Sistema",
        message: `🔇 ${sender} foi silenciado por 5 minutos.`,
        isBot: false
      });
      return;
    }

    io.to('bingo90').emit('chat-message', { message, sender, isBot });

    if (!isBot && sender !== "Sistema") {
      const room = rooms.bingo90;
      const aiResponse = aiRespond(message, socket.id, room);
      setTimeout(() => {
        io.to('bingo90').emit('chat-message', {
          sender: "IA do Bingo",
          message: aiResponse,
          isBot: true
        });
      }, 1000 + Math.random() * 2000);
    }
  });

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

    // Garantir limite de 10 cartelas ao carregar
    if (cards90.length > 10) cards90 = cards90.slice(0, 10);

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

    const currentBots = Object.values(room.players).filter(p => p.isBot);
    if (currentBots.length === 0 && (playerName === 'Markim' || playerName === 'Marília')) {
      console.log(`🤖 Adicionando 3 bots iniciais para ${playerName}...`);
      for (let i = 0; i < 3; i++) {
        const randomName = FUNNY_BOT_NAMES[Math.floor(Math.random() * FUNNY_BOT_NAMES.length)];
        const botId = `bot_initial_${i}_${Date.now()}`;
        room.players[botId] = {
          id: botId,
          name: randomName,
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

    // ✅ LIMITE DE 10 CARTELAS
    if (player.cards90.length >= 10) {
      socket.emit('error', 'Você já atingiu o limite de 10 cartelas!');
      return;
    }

    const remaining = 10 - player.cards90.length;
    const finalCount = Math.min(count, remaining);
    if (finalCount <= 0) {
      socket.emit('error', 'Você já tem 10 cartelas!');
      return;
    }

    const cost = finalCount * 100;
    if (player.chips < cost) {
      socket.emit('error', 'Chips insuficientes!');
      return;
    }

    const newCards = [];
    for (let i = 0; i < finalCount; i++) {
      newCards.push(generateValidBingo90Card());
    }

    player.cards90 = player.cards90.concat(newCards);
    player.chips -= cost;

    db.players[player.name] = { chips: player.chips, cards90: player.cards90 };
    saveDB(db);

    // Bots também respeitam o limite de 10
    for (const id in room.players) {
      const p = room.players[id];
      if (p.isBot && !room.gameStarted) {
        const botRemaining = 10 - p.cards90.length;
        const botFinalCount = Math.min(finalCount, botRemaining);
        if (botFinalCount > 0) {
          const botNewCards = [];
          for (let i = 0; i < botFinalCount; i++) {
            botNewCards.push(generateValidBingo90Card());
          }
          p.cards90 = p.cards90.concat(botNewCards);
          p.chips -= botFinalCount * 100;
          if (p.chips < 0) p.chips = 0;
        }
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

    if (pendingBotsToAdd.length > 0) {
      console.log(`🤖 Adicionando ${pendingBotsToAdd.length} bot(s) pendente(s)...`);
      for (let i = 0; i < pendingBotsToAdd.length; i++) {
        const randomName = FUNNY_BOT_NAMES[Math.floor(Math.random() * FUNNY_BOT_NAMES.length)];
        const botId = `bot_auto_${Date.now()}_${i}`;
        room.players[botId] = {
          id: botId,
          name: randomName,
          chips: 10000,
          isBot: true,
          cards90: [],
          connected: true
        };
      }
      pendingBotsToAdd = [];
      broadcastPlayerList('bingo90');
      broadcastRanking('bingo90');
    }

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
    if (HUMAN_NAMES.includes(name)) {
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

  winners.forEach(w => {
    const player = room.players[w.id];
    if (player) {
      const msgType = winType === 'bingo' ? 'bingo' : winType;
      const messages = WIN_MESSAGES[msgType] || WIN_MESSAGES.linha1;
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      const totalPrize = prize + (jackpotPrize || 0);
      
      io.to('bingo90').emit('chat-message', {
        sender: "Sistema",
        message: `🎉 ${player.name} ganhou R$ ${totalPrize.toLocaleString('pt-BR')} em ${winType === 'linha1' ? 'Linha 1' : winType === 'linha2' ? 'Linhas Completas' : 'BINGO'}! ${randomMsg}`,
        isBot: false
      });
    }
  });

  io.to('bingo90').emit('player-won', {
    winners: winners.map(w => ({ playerName: w.playerName, prize, winType })),
    winnerNames: winnerNames.join(', '),
    jackpotWinners: jackpotPrize ? winners.map(w => ({ playerName: w.playerName, prize: jackpotPrize })) : null,
    newStage: room.currentStage
  });

  if (winType !== 'bingo' && !room.gameCompleted) {
    setTimeout(() => {
      drawNextNumber('bingo90', room.drawnNumbers.length);
    }, 6000);
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
