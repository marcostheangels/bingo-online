// server.js — Bingo Multiplayer com correções de áudio, ranking e visibilidade
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

const INITIAL_JACKPOT = 1500000;

let rooms = {
  bingo90: {
    players: {},
    drawnNumbers: [],
    gameStarted: false,
    gameCompleted: false,
    currentStage: 'linha1',
    pot: 0,
    jackpot: INITIAL_JACKPOT,
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
  for (const name in room.players) {
    const player = room.players[name];
    if (player.cards90) {
      for (const card of player.cards90) {
        const win = checkWin(card, room.drawnNumbers);
        if (win[winType]) {
          winners.push({ playerName: player.name });
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
  }
}

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

// 🔥 Função removida: broadcastPlayerList
// A lógica de exibição de jogadores foi unificada com o ranking.

function updateAndBroadcastRanking(roomId) {
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

function aiRespond(message, senderSocketId, room) {
  const msgLower = message.toLowerCase().trim();
  const ranking = Object.values(room.players)
    .map(p => ({ name: p.name, chips: p.chips }))
    .sort((a, b) => b.chips - a.chips);

  const topPlayer = ranking.length > 0 ? ranking[0].name : 'ninguém';
  const topChips = ranking.length > 0 ? ranking[0].chips.toLocaleString('pt-BR') : '0';

  let response = "";

  if (msgLower.includes('boa tarde') || msgLower.includes('boatarde')) {
    response = `👋 Boa tarde, ${getPlayerNameBySocket(senderSocketId, room) || 'amigo'}! Vamos jogar Bingo? 🎰`;
  } else if (msgLower.includes('boa noite') || msgLower.includes('boanoite')) {
    response = `🌙 Boa noite, ${getPlayerNameBySocket(senderSocketId, room) || 'amigo'}! O Bingo não dorme!`;
  } else if (msgLower.includes('bom dia') || msgLower.includes('bomdia')) {
    response = `☀️ Bom dia, ${getPlayerNameBySocket(senderSocketId, room) || 'amigo'}! Que comece a sorte! 🍀`;
  } else if (msgLower.includes('olá') || msgLower.includes('oi') || msgLower.includes('opa') || msgLower.includes('e aí')) {
    response = `👋 Olá, ${getPlayerNameBySocket(senderSocketId, room) || 'amigo'}! Vamos jogar Bingo? 🎰`;
  } else if (msgLower.includes('quem') && (msgLower.includes('lider') || msgLower.includes('primeiro') || msgLower.includes('top'))) {
    response = `🏆 O líder do ranking é ${topPlayer} com R$ ${topChips} em fichas!`;
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
  } else if (msgLower.includes('sorte') || msgLower.includes('ganhar')) {
    response = `🍀 A sorte está lançada! Compre até 10 cartelas e tente seu BINGO hoje!`;
  } else if (msgLower.includes('quantas') && (msgLower.includes('cartelas') || msgLower.includes('comprar'))) {
    response = `🛒 Você pode comprar até 10 cartelas! Cada uma custa 100 fichas.`;
  } else if (msgLower.includes('quantas') && msgLower.includes('bolas')) {
    response = `🔢 Até agora foram sorteadas ${room.drawnNumbers.length} bolas. O próximo número pode ser o seu!`;
  } else if (msgLower.includes('jackpot') || msgLower.includes('jack pot')) {
    response = `💎 Jackpot atual: R$ ${room.jackpot.toLocaleString('pt-BR')}! Ganhe completando sua cartela em 60 bolas ou menos!`;
  } else if (msgLower.includes('regra') || msgLower.includes('regras')) {
    response = `📜 Regras: Compre cartelas, espere o sorteio, complete Linha 1, Linha 2 ou BINGO! Jackpot só se completar em 60 bolas ou menos.`;
  } else if (msgLower.includes('iniciar') || msgLower.includes('começar') || msgLower.includes('sortear')) {
    response = `🎲 Para iniciar, clique em "Iniciar Sorteio" depois de comprar cartelas!`;
  } else if (msgLower.includes('reiniciar') || msgLower.includes('reset')) {
    response = `🔄 Só é possível reiniciar após um Bingo completo. Clique no botão "Reiniciar".`;
  } else if (msgLower.includes('cartela') || msgLower.includes('cartelas')) {
    response = `🎫 Cada cartela custa 100 fichas. Você pode comprar até 10. Os bots também compram até 10!`;
  } else if (msgLower.includes('ganhou') || msgLower.includes('vencedor') || msgLower.includes('quem ganhou')) {
    response = `🏅 O último vencedor foi anunciado no chat! Fique atento às mensagens do Sistema.`;
  } else if (msgLower.includes('chips') || msgLower.includes('fichas')) {
    response = `🪙 Fichas são usadas para comprar cartelas. Ganhe ao completar Linha 1, Linha 2 ou BINGO!`;
  } else if (msgLower.includes('sistema') || msgLower.includes('ai') || msgLower.includes('bot')) {
    response = `🤖 Eu sou o Sistema! Respondo perguntas sobre o jogo. Se quiser conversar com humanos, mande mensagem direta!`;
  } else {
    response = `ℹ️ Não entendi sua pergunta. Tente: "bom dia", "como jogar?", "qual é o jackpot?", "quem é o líder?" ou "quantas cartelas posso comprar?".`;
  }

  return response;
}

function getPlayerNameBySocket(socketId, room) {
  for (const name in room.players) {
    if (room.players[name].id === socketId) {
      return name;
    }
  }
  return null;
}

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
          sender: "Sistema",
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

    if (room.players[playerName]) {
      socket.emit('error', 'Nome já em uso. Escolha outro.');
      return;
    }

    let chips = 10000;
    let cards90 = [];

    if (db.players[playerName]) {
      chips = db.players[playerName].chips || 10000;
      cards90 = db.players[playerName].cards90 || [];
    } else if (savedChips) {
      chips = savedChips;
      cards90 = savedCards90 || [];
    }

    if (cards90.length > 10) cards90 = cards90.slice(0, 10);

    room.players[playerName] = {
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
      for (let i = 0; i < 3; i++) {
        let randomName;
        do {
          randomName = FUNNY_BOT_NAMES[Math.floor(Math.random() * FUNNY_BOT_NAMES.length)];
        } while (room.players[randomName]);

        room.players[randomName] = {
          id: `bot_initial_${i}_${Date.now()}`,
          name: randomName,
          chips: 10000,
          isBot: true,
          cards90: [],
          connected: true
        };
      }
      // 🔁 Chamada unificada para garantir visibilidade total
      updateAndBroadcastRanking('bingo90');
    }

    socket.join(roomId);
    socket.emit('room-welcome', {
      roomId,
      roomName: 'Bingo 90',
      gameCompleted: room.gameCompleted,
      currentStage: room.currentStage
    });

    broadcastRoomState(roomId);
    // 🔁 Chamada unificada para garantir visibilidade total
    updateAndBroadcastRanking('bingo90');
    broadcastPot(roomId);
  });

  socket.on('buy-cards', ({ count, cardType, playerName }) => {
    if (cardType !== '90' || !playerName) return;
    const room = rooms.bingo90;
    const player = room.players[playerName];
    if (!player || room.gameStarted) return;

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
      socket.emit('error', 'Fichas insuficientes!');
      return;
    }

    const newCards = [];
    for (let i = 0; i < finalCount; i++) {
      newCards.push(generateValidBingo90Card());
    }

    player.cards90 = player.cards90.concat(newCards);
    db.players[player.name] = { chips: player.chips, cards90: player.cards90 };
    saveDB(db);

    socket.emit('cards-received', { cards: newCards.map(c => ({ card: c })), cardType: '90' });
    broadcastRoomState('bingo90');
    // 🔁 Chamada unificada para garantir visibilidade total
    updateAndBroadcastRanking('bingo90');
  });

  socket.on('start-draw', ({ playerName }) => {
    const room = rooms.bingo90;
    if (room.gameStarted || room.gameCompleted) return;

    if (pendingBotsToAdd.length > 0) {
      for (let i = 0; i < pendingBotsToAdd.length; i++) {
        let randomName;
        do {
          randomName = FUNNY_BOT_NAMES[Math.floor(Math.random() * FUNNY_BOT_NAMES.length)];
        } while (room.players[randomName]);

        room.players[randomName] = {
          id: `bot_auto_${Date.now()}_${i}`,
          name: randomName,
          chips: 10000,
          isBot: true,
          cards90: [],
          connected: true
        };
      }
      pendingBotsToAdd = [];
      // 🔁 Chamada unificada para garantir visibilidade total
      updateAndBroadcastRanking('bingo90');
    }

    const hasHumanWithCards = Object.values(room.players).some(p => !p.isBot && p.cards90.length > 0);
    if (!hasHumanWithCards) {
      socket.emit('message', 'É necessário pelo menos 1 humano com cartela para iniciar.');
      return;
    }

    const humanCardCounts = {};
    for (const name in room.players) {
      const p = room.players[name];
      if (!p.isBot && p.cards90.length > 0) {
        humanCardCounts[p.name] = p.cards90.length;
      }
    }

    const maxHumanCards = Math.max(...Object.values(humanCardCounts), 0);

    for (const name in room.players) {
      const p = room.players[name];
      if (!p.isBot) {
        const spent = p.cards90.length * 100;
        p.chips -= spent;
        db.players[p.name] = { chips: p.chips, cards90: p.cards90 };
      } else {
        p.cards90 = [];
        if (maxHumanCards > 0) {
          const botNewCards = [];
          for (let i = 0; i < maxHumanCards; i++) {
            botNewCards.push(generateValidBingo90Card());
          }
          p.cards90 = botNewCards;
          p.chips -= maxHumanCards * 100;
          if (p.chips < 0) p.chips = 0;
        }
      }
    }
    saveDB(db);

    room.gameStarted = true;
    room.drawnNumbers = [];
    room.lastNumber = null;
    room.pot = 0;
    room.jackpot = INITIAL_JACKPOT;

    for (const name in room.players) {
      const p = room.players[name];
      const spent = p.cards90.length * 100;
      room.pot += spent;
      room.jackpot += spent;
    }

    broadcastPot('bingo90');
    broadcastRoomState('bingo90');
    // 🔁 Chamada unificada para garantir visibilidade total
    updateAndBroadcastRanking('bingo90');

    drawNextNumber('bingo90', 0);
  });

  socket.on('claim-win', ({ winType, playerName }) => {
    const room = rooms.bingo90;
    if (!room.gameStarted || room.gameCompleted) return;

    const player = room.players[playerName];
    if (!player) return;

    const winners = getWinningPlayers(room, winType);
    const thisPlayerWon = winners.some(w => w.playerName === playerName);
    if (!thisPlayerWon) {
      socket.emit('error', 'Você não completou essa conquista!');
      return;
    }

    processWin(winType, room, winners);
  });

  socket.on('restart-game', ({ playerName }) => {
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
    for (const name in room.players) {
      if (room.players[name].id === socket.id) {
        const player = room.players[name];
        if (!room.gameStarted && player.cards90.length > 0) {
          player.cards90 = [];
          if (db.players[player.name]) {
            db.players[player.name].cards90 = [];
            saveDB(db);
          }
        }
        delete room.players[name];
        // 🔁 Chamada unificada para garantir visibilidade total após desconexão
        updateAndBroadcastRanking('bingo90');
        break;
      }
    }
  });
});

function processWin(winType, room, winners) {
  if (winners.length === 0 || room.gameCompleted) return;

  let prize = 0;
  if (winType === 'linha1') {
    prize = Math.floor(room.pot * 0.2);
  } else if (winType === 'linha2') {
    prize = Math.floor(room.pot * 0.3);
  } else if (winType === 'bingo') {
    prize = Math.floor(room.pot * 0.5);
  }

  const prizePerWinner = Math.floor(prize / winners.length);
  const ballsUsed = room.drawnNumbers.length;
  const jackpotPerWinner = (winType === 'bingo' && ballsUsed <= 60) ? Math.floor(room.jackpot / winners.length) : 0;

  const winnerNames = winners.map(w => w.playerName);
  winnerNames.forEach(name => {
    if (HUMAN_NAMES.includes(name)) {
      maybeAddBotAfterHumanWin(name);
    }
  });

  winners.forEach(w => {
    const player = room.players[w.playerName];
    if (player) {
      player.chips += prizePerWinner;
      if (jackpotPerWinner > 0) player.chips += jackpotPerWinner;
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

  io.to('bingo90').emit('play-sound', { type: winType });

  const winnerData = {
    winners: winners.map(w => ({ playerName: w.playerName, prize: prizePerWinner })),
    winnerNames: winnerNames.join(', '),
    jackpotWinners: jackpotPerWinner ? winners.map(w => ({ playerName: w.playerName, prize: jackpotPerWinner })) : null,
    ballsUsed: ballsUsed
  };

  if (winType === 'linha1') {
    io.to('bingo90').emit('line1-victory-all', winnerData);
  } else if (winType === 'linha2') {
    io.to('bingo90').emit('line2-victory-all', winnerData);
  } else if (winType === 'bingo') {
    io.to('bingo90').emit('bingo-victory-all', winnerData);
    if (ballsUsed <= 60) {
      io.to('bingo90').emit('jackpot-victory-all', winnerData);
    }
  }

  winners.forEach(w => {
    const player = room.players[w.playerName];
    if (player) {
      const msgType = winType === 'bingo' ? 'bingo' : winType;
      const messages = WIN_MESSAGES[msgType] || WIN_MESSAGES.linha1;
      const randomMsg = messages[Math.floor(Math.random() * messages.length)];
      const totalPrize = prizePerWinner + (jackpotPerWinner || 0);
      
      io.to('bingo90').emit('chat-message', {
        sender: "Sistema",
        message: `🎉 ${player.name} ganhou R$ ${totalPrize.toLocaleString('pt-BR')} em ${winType === 'linha1' ? 'Linha 1' : winType === 'linha2' ? 'Linhas Completas' : 'BINGO'}! ${randomMsg}`,
        isBot: false
      });
    }
  });

  io.to('bingo90').emit('player-won', {
    winners: winners.map(w => ({ playerName: w.playerName, prize: prizePerWinner, winType })),
    winnerNames: winnerNames.join(', '),
    jackpotWinners: jackpotPerWinner ? winners.map(w => ({ playerName: w.playerName, prize: jackpotPerWinner })) : null,
    newStage: room.currentStage
  });

  if (winType !== 'bingo' && !room.gameCompleted) {
    setTimeout(() => {
      drawNextNumber('bingo90', room.drawnNumbers.length);
    }, 6000);
  }

  broadcastRoomState('bingo90');
  // 🔁 Chamada unificada para garantir visibilidade total após vitória
  updateAndBroadcastRanking('bingo90');
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

  // 🔊 Emitir som para todos os jogadores com o número sorteado
  io.to(roomId).emit('play-sound', { type: 'sorteio', number });

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

  for (const name in room.players) {
    const p = room.players[name];
    if (!p.isBot) {
      p.cards90 = [];
      if (db.players[p.name]) {
        db.players[p.name].cards90 = [];
        saveDB(db);
      }
    } else {
      p.cards90 = [];
    }
  }

  io.to(roomId).emit('room-reset');
  broadcastRoomState(roomId);
  // 🔁 Chamada unificada para garantir visibilidade total após reinício
  updateAndBroadcastRanking('bingo90');
  broadcastPot('bingo90');
}

require('./backup');

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
