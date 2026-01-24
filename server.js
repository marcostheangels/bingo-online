const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const app = express();
const server = http.createServer(app);

// ✅ Conexão com PostgreSQL (Railway)
let pool;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
} else {
  console.warn('⚠️ DATABASE_URL não definida. Persistência desativada.');
  global.loadPersistedChips = async () => ({ specialPlayers: { 'Markim': 10000, 'Marília': 10000 }, bots: {} });
  global.savePersistedChips = async () => {};
}

// ✅ Cria tabela se não existir
async function createTableIfNotExists() {
  if (!pool) return;
  const query = `
    CREATE TABLE IF NOT EXISTS persistent_chips (
      id SERIAL PRIMARY KEY,
      player_name VARCHAR(50) UNIQUE NOT NULL,
      chips INTEGER NOT NULL DEFAULT 10000,
      is_bot BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `;
  try {
    await pool.query(query);
    console.log('✅ Tabela persistent_chips verificada/criada.');
  } catch (err) {
    console.error('❌ Erro ao criar tabela:', err);
  }
}

// ✅ Carregar chips do banco
async function loadPersistedChips() {
  if (!pool) return { specialPlayers: { 'Markim': 10000, 'Marília': 10000 }, bots: {} };
  try {
    const result = await pool.query(
      'SELECT player_name, chips, is_bot FROM persistent_chips'
    );
    const specialPlayers = {};
    const bots = {};
    result.rows.forEach(row => {
      if (!row.is_bot && (row.player_name === 'Markim' || row.player_name === 'Marília')) {
        specialPlayers[row.player_name] = parseInt(row.chips);
      } else if (row.is_bot) {
        bots[row.player_name] = parseInt(row.chips);
      }
    });
    return { specialPlayers, bots };
  } catch (err) {
    console.error('Erro ao carregar chips do banco:', err);
    return { specialPlayers: { 'Markim': 10000, 'Marília': 10000 }, bots: {} };
  }
}

// ✅ Salvar chips no banco
async function savePersistedChips(specialPlayers, bots) {
  if (!pool) return;
  try {
    for (const [name, chips] of Object.entries(specialPlayers)) {
      await pool.query(
        `INSERT INTO persistent_chips (player_name, chips, is_bot)
         VALUES ($1, $2, false)
         ON CONFLICT (player_name) DO UPDATE SET chips = $2, updated_at = NOW()`,
        [name, chips]
      );
    }
    for (const [name, chips] of Object.entries(bots)) {
      await pool.query(
        `INSERT INTO persistent_chips (player_name, chips, is_bot)
         VALUES ($1, $2, true)
         ON CONFLICT (player_name) DO UPDATE SET chips = $2, updated_at = NOW()`,
        [name, chips]
      );
    }
  } catch (err) {
    console.error('Erro ao salvar chips no banco:', err);
  }
}

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
app.use(express.json());

// ✅ Função de sanitização
function sanitizeName(name) {
  if (typeof name !== 'string') return 'Anônimo';
  let clean = name.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
  clean = clean.substring(0, 15);
  return clean || 'Anônimo';
}

// ✅ Endpoint de feedback com rate limiting
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
const INITIAL_CHIPS = 10000;
const MAX_CARDS_PER_PLAYER = 10;
const JACKPOT_BALL_LIMIT = 60;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '0589';
const MAX_BOTS_ALLOWED = 10;

// ✅ Palavras-chave e respostas da IA
const AI_KEYWORDS = [
  'como', 'regra', 'funciona', 'ganhar', 'prêmio', 'pote', 'jackpot',
  'cartela', 'bingo', 'linha', 'número', 'sorteio', 'chips', 'comprar',
  'bot', 'humano','pix','saque','retirar','depósito','pagar','saldo','dinheiro','moeda','bônus',
  'grátis', 'vitória', 'dica', 'estratégia', 'ajuda', '?'
];

const AI_RESPONSES = {
  general: [
    "No bingo, cada cartela é uma chance! Quanto mais você tem, maiores suas chances!",
    "As regras são simples: complete linhas ou o bingo completo para levar prêmios!",
    "Estratégia real? Compre até 10 cartelas — é o máximo permitido para todos!",
    "Fique de olho nas cartelas que estão perto de completar! Elas aparecem no topo!",
    "O jackpot só é liberado se você fizer bingo em até 60 bolas sorteadas!",
    "Humanos e bots jogam com as mesmas regras — total transparência!",
    "Cada fase distribui parte do pote: linha 1 (20%), linha 2 (30%) e bingo (50%)!",
    "Seu nome fica em verde quando você vence — todos veem seu brilho! ✨",
    "A sala entra em standby se não houver humanos. Estamos sempre esperando por você!",
    "Ganhou várias vezes seguidas? Você é um(a) verdadeiro(a) campeão(ã)!",
    "O segredo do mestre: paciência e persistência. A próxima bola pode ser a sua! 🍀",
    "Sentindo falta de um número? O universo do bingo adora uma surpresa de última hora!",
    "Lembre-se: o Bingo Master Pro é pura adrenalina! Divirta-se acima de tudo. 🎡",
    "As chances são iguais para todos. A sorte não escolhe lado, ela escolhe quem insiste!",
    "Já reparou como o pote cresce rápido? Quanto mais gente, maior a festa! 💰",
    "Dica: Suas melhores cartelas sobem sozinhas para o topo da tela! Fique atento! 📈",
    "Sabia que você pode personalizar seu avatar no menu de Perfil? Mostre seu estilo! 😎",
    "Problemas de conexão? Verifique seu Wi-Fi para não perder nenhum número importante! 📶",
    "O chat é o coração do jogo. Comemore suas vitórias e faça novos amigos! 🗣️",
    "O som do sorteio te ajuda a manter o foco. Não esqueça de ligar o áudio! 🔊",
    "O prêmio acumulado (Jackpot) é o sonho de todos! Complete a cartela rápido para levar! 💎",
    "Linha 1 é só o começo! O verdadeiro tesouro está no grito final de BINGO! 🏆",
    "Nossos bots Markim e Marília são feras, mas nada supera o talento de um humano! 🦾",
    "Se houver empate na linha, o prêmio é dividido igualmente entre os vencedores. Justo, né? ⚖️",
    "Bônus diários de login ajudam você a manter suas fichas sempre carregadas! 🎁",
    "Sua senha é pessoal e intransferível. Proteja sua conta do Bingo Master Pro! 🔐",
    "Vi algum erro? Reporte ao suporte e ajude a melhorar nossa arena de diversão! 🛠️",
    "Mantenha seu cadastro atualizado para receber notificações de eventos especiais! 📝",
    "O sistema de login garante que seus prêmios e conquistas fiquem salvos para sempre! 💾",
    "Jogar como convidado é legal, mas ter uma conta registrada te dá muito mais moral! 🏅",
    "Dizem que quem grita 'BINGO' na frente da tela ganha mais rápido... quer testar? 🤣",
    "O recorde de vitórias seguidas nesta sala é impressionante! Será que você bate? 🥇",
    "Os bots não dormem, mas você tem a intuição humana a seu favor! 🧠",
    "Cada número sorteado é gerado de forma 100% aleatória pelo nosso algoritmo. 🎰",
    "O Bingo Master Pro é a casa dos grandes campeões. Bem-vindo à elite! 👑",
    "Não desanime se a linha não veio. O Bingo completo ainda está em jogo! 🌈",
    "A vitória de hoje pode ser o começo de uma sequência épica de conquistas! 🌠",
    "O mestre do bingo nunca desiste na bola 89. O 90 pode ser o seu! 🎯",
    "Obrigado por escolher o Bingo Master Pro! Você faz nossa comunidade brilhar! ✨",
    "Prepare os dedos! A próxima rodada começa em poucos segundos... 🚀"
  ],
  jackpot: [
    "O jackpot começa em R$ 1.000.000 e cresce a cada cartela comprada!",
    "Só é possível ganhar o jackpot se o bingo for feito em até 60 bolas!",
    "Quando alguém leva o jackpot, ele volta a R$ 1.000.000 e recomeça!"
  ],
  strategy: [
    "Compre cartelas no início da rodada para garantir seu lugar!",
    "Cartelas com menos bolas faltando aparecem no topo — foque nelas!",
    "Não espere o último número: às vezes, a vitória vem antes do fim!"
  ]
};

let lastAiResponse = '';

function getSmartAiResponse(message) {
  const lower = message.toLowerCase();
  if (lower.includes('jackpot')) {
    return getRandomUnique(AI_RESPONSES.jackpot, 'jackpot');
  } else if (lower.includes('estratégia') || lower.includes('dica') || lower.includes('como ganhar')) {
    return getRandomUnique(AI_RESPONSES.strategy, 'strategy');
  } else {
    return getRandomUnique(AI_RESPONSES.general, 'general');
  }
}

function getRandomUnique(list, category) {
  let response;
  do {
    response = list[Math.floor(Math.random() * list.length)];
  } while (response === lastAiResponse && list.length > 1);
  lastAiResponse = response;
  return response;
}

// ✅ Salas em memória
const rooms = {
  'bingo75': {
    name: 'Bingo 75 (Americano)',
    players: {},
    drawnNumbers: [],
    gameActive: false,
    lastNumber: null,
    maxBots: 3,
    pot: 0,
    drawInterval: null,
    currentStage: 'linha1',
    stageCompleted: { linha1: false, linha2: false, bingo: false },
    jackpot: 1000000,
    gameCompleted: false,
    addBotOnNextRestart: false,
    autoRestartTimeout: null,
    currentWinnerId: null,
    autoMessageInterval: null
  },
  'bingo90': {
    name: 'Bingo 90 (Brasileiro)',
    players: {},
    drawnNumbers: [],
    gameActive: false,
    lastNumber: null,
    maxBots: 3,
    pot: 0,
    drawInterval: null,
    currentStage: 'linha1',
    stageCompleted: { linha1: false, linha2: false, bingo: false },
    jackpot: 1000000,
    gameCompleted: false,
    addBotOnNextRestart: false,
    autoRestartTimeout: null,
    currentWinnerId: null,
    autoMessageInterval: null
  }
};

// ✅ Função para verificar se vencedor é Markim ou Marília
function shouldAddBotOnWin(winnerNames) {
  const winners = winnerNames.split(', ').map(name => name.trim());
  return winners.some(name => name === 'Markim' || name === 'Marília');
}

// ✅ Função adaptativa: quantas cartelas o bot deve comprar?
function getBotCardCount(totalBots) {
  if (totalBots <= 6) return 3;
  if (totalBots <= MAX_BOTS_ALLOWED) return 2;
  return 1;
}

// ✅ Verifica se há humanos COM CARTELAS na sala
function hasHumanWithCards(roomType) {
  const room = rooms[roomType];
  return Object.values(room.players).some(p =>
    !p.isBot &&
    ((roomType === 'bingo90' && p.cards90 && p.cards90.length > 0) ||
      (roomType === 'bingo75' && p.cards75 && p.cards75.length > 0))
  );
}

// ✅ Mensagens automáticas a cada 45s
function startAutoMessages(roomType) {
  const room = rooms[roomType];
  if (room.autoMessageInterval) clearInterval(room.autoMessageInterval);
  room.autoMessageInterval = setInterval(() => {
    if (!hasHumanWithCards(roomType)) return;
    const messages = [
      "✨ Alguém está prestes a fazer BINGO! Fiquem atentos!",
      "💰 O pote está crescendo! Quem será o próximo vencedor?",
      "🎯 Dica: cartelas com menos bolas faltando têm prioridade!",
      "🔥 A disputa está acirrada! Humanos vs Bots — quem leva?",
      "💎 Já pensou em ganhar o JACKPOT? Está quase lá!",
      "🚀 Nova rodada, novas chances! Compre suas cartelas!",
      "👑 O trono está vazio... Quem vai conquistá-lo hoje?",
      "🎉 Não desista! Às vezes, a vitória vem na última bola!",
      "⚡ O coração bate mais forte a cada número! Falta pouco?",
      "🥊 A arena está quente! Quem vai derrubar os bots desta vez?",
      "🏁 Reta final! A última bola pode mudar o destino do prêmio!",
      "⚔️ Desafio aceito! Mostre que você é o mestre das cartelas!",
      "😤 Por um triz! A sorte está rondando a sua mesa!",
      "🧨 Explosão de prêmios! A rodada está apenas começando!",
      "🏟️ Sala cheia, pote gigante! É agora ou nunca!",
      "🌪️ O furacão do Bingo passou por aqui! Quem sobreviveu?",
      "🏃‍♂️ Corra para marcar! O tempo não espera por ninguém!",
      "🥇 Lugar de campeão é no topo do ranking do Bingo Multiplayer!",
      "💸 O cofre abriu! O Jackpot está pedindo para ser levado!",
      "🏦 Sua conta bancária no jogo agradece por essa rodada!",
      "🤑 Sentindo o cheiro de vitória (e de moedas) no ar!",
      "💳 Saldo atualizado: a sorte depositou um prêmio para você!",
      "💎 Pedras preciosas e bolas numeradas: a combinação do sucesso!",
      "📈 O multiplicador subiu! Ganhe mais nesta rodada especial!",
      "💰 O prêmio acumulado está de cair o queixo! Vai encarar?",
      "👑 Realeza do Bingo: o trono vem acompanhado de um belo pote!",
      "💹 Invista em mais cartelas e colha os frutos do Jackpot!",
      "🗝️ Você encontrou a chave para a fortuna de hoje!",
      "💡 Dica de mestre: cartelas extras aumentam sua probabilidade!",
      "🧐 Olho vivo! A distração é o maior inimigo do jogador.",
      "📊 Analise o jogo: quais números estão saindo mais hoje?",
      "🛡️ Mantenha sua conta segura e seu foco no marcador!",
      "🧠 Bingo também é estratégia! Organize suas cartelas com sabedoria.",
      "🔋 Bateria carregada e sorte preparada? Vamos ao sorteio!",
      "🧘 Mantenha a calma... o Bingo vem para quem sabe esperar.",
      "🔄 Rodada nova, estratégia nova! Tente algo diferente agora.",
      "🧩 Cada bola sorteada é uma peça do seu quebra-cabeça vitorioso!",
      "🛰️ Radar ligado: detectamos uma grande chance de Bingo na sua área!"
    ];
    const msg = messages[Math.floor(Math.random() * messages.length)];
    io.to(roomType).emit('chat-message', {
      message: msg,
      sender: "🤖 SYSTEM",
      isBot: true,
      type: "auto-message"
    });
  }, 45000);
}

// ✅ Funções de validação e geração (mantidas)
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

// ✅ CORREÇÃO: Nome correto da função
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

// ✅ NOVA FUNÇÃO: Contar cartelas "na boa" (faltando exatamente 1 bola)
function countCardsOneBallAway(roomType) {
  const room = rooms[roomType];
  let stats = {
    line1: 0,
    line2: 0,
    bingo: 0
  };

  const drawnCount = room.drawnNumbers.length;

  for (const player of Object.values(room.players)) {
    const cards = roomType === 'bingo90' ? player.cards90 : player.cards75;
    if (!cards || cards.length === 0) continue;

    for (const card of cards) {
      const ballsLeft = calculateBallsLeftForCard(card, room.drawnNumbers);
      
      if (ballsLeft.forLine1 === 1) stats.line1++;
      if (ballsLeft.forLine2 === 1) stats.line2++;
      if (ballsLeft.forBingo === 1) stats.bingo++;
    }
  }

  return stats;
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
    console.log(`[VITÓRIA] Sala: ${roomType}, Etapa: ${currentStage}, Vencedores:`, allWinners.map(w => rooms[roomType].players[w.playerId]?.name).join(', '));
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
  // ✅ Verificar se há humanos com cartelas
  let humanHasCards = false;
  for (const player of Object.values(room.players)) {
    if (!player.isBot &&
      ((roomType === 'bingo90' && player.cards90.length > 0) ||
        (roomType === 'bingo75' && player.cards75.length > 0))) {
      humanHasCards = true;
      break;
    }
  }

  // ✅ Só adicionar bots e comprar cartelas se houver humanos com cartelas
  if (humanHasCards && !room.gameActive && !room.gameCompleted) {
    // Adicionar bots faltantes
    let currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
    while (currentBots < room.maxBots) {
      addBotToRoom(roomType);
      currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
    }

    // ✅ Função: Fazer bots comprarem cartelas AGORA
    for (const [id, player] of Object.entries(room.players)) {
      if (player.isBot) {
        const totalBotsNow = Object.keys(room.players).filter(pid => room.players[pid].isBot).length;
        const cardCount = Math.min(getBotCardCount(totalBotsNow), Math.floor(player.chips / PRICE_PER_CARD));
        if (cardCount > 0 && player.cards90.length === 0 && player.cards75.length === 0) {
          const totalCost = cardCount * PRICE_PER_CARD;
          player.chips -= totalCost;
          room.pot += totalCost;
          room.jackpot += Math.floor(totalCost * 0.5);
          if (roomType === 'bingo90') {
            player.cards90 = Array(cardCount).fill().map(() => validateAndFixBingo90Card(generateBingo90Card()));
            player.cards75 = [];
          } else {
            player.cards75 = Array(cardCount).fill().map(() => generateBingo75Card());
            player.cards90 = [];
          }
          console.log(`🤖 Bot ${player.name} comprou ${cardCount} cartelas. Chips restantes: ${player.chips}`);
        }
      }
    }

    // ✅ EMITIR ATUALIZAÇÃO DO POTE E JACKPOT PARA TODOS OS JOGADORES
    io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });

    // ✅ FORÇAR ENVIO DO ESTADO COMPLETO PARA ATUALIZAR CHIPS DOS BOTS
    io.to(roomType).emit('room-state', {
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
  }

  if (!hasHumanWithCards(roomType)) {
    console.log(`⏸️ Standby: nenhum humano com cartela na sala ${roomType}`);
    room.gameActive = false;
    return;
  }

  if (room.gameActive || room.drawnNumbers.length >= (roomType === 'bingo75' ? 75 : 90)) return;

  room.gameActive = true;
  room.drawInterval = setInterval(() => {
    const number = drawNumber(roomType);
    if (number === null) {
      clearInterval(room.drawInterval);
      room.drawInterval = null;
      room.gameActive = false;
      io.to(roomType).emit('game-end', 'Todos os números foram sorteados!');
      startAutoRestart(roomType);
      return;
    }

    io.to(roomType).emit('number-drawn', {
      number,
      drawnNumbers: room.drawnNumbers,
      lastNumber: number
    });

    // ✅ Emitir estatísticas "na boa" após cada número
    const nearWinStats = countCardsOneBallAway(roomType);
    io.to(roomType).emit('near-win-stats', nearWinStats);

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
  }, 5000); // 👈 INTERVALO AUMENTADO PARA 5 SEGUNDOS
}

function startAutoRestart(roomType) {
  const room = rooms[roomType];
  if (room.autoRestartTimeout) clearTimeout(room.autoRestartTimeout);
  io.to(roomType).emit('countdown-start', { seconds: 25 });
  room.autoRestartTimeout = setTimeout(() => {
    // ✅ CORREÇÃO: Objeto fakeSocket com estrutura válida
    const fakeSocket = { emit: () => {},  { roomType }, id: 'system' };
    handleAutoRestart(fakeSocket, roomType);
  }, 25000);
}

async function handleWin(roomType, allWinners) {
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

  // ✅ REMOVER NOMES DUPLICADOS
  const uniqueWinnerNames = [...new Set(results.map(r => r.playerName))];
  const winnerNames = uniqueWinnerNames.join(', ');

  // ✅ CORREÇÃO: totalPrize DEVE SER CALCULADO ANTES DE SER USADO
  const totalPrize = results.reduce((sum, r) => sum + r.prize, 0);

  if (results.length > 0) {
    room.currentWinnerId = results[0].playerId;
  }

  if (shouldAddBotOnWin(winnerNames)) {
    room.addBotOnNextRestart = true;
    console.log(`✅ Vitória de Markim ou Marília! Bot será adicionado no próximo restart.`);
  }

  // ✅ Mensagem de vitória
  let formattedMessage = "";
  if (currentStage === 'linha1') {
    const msgs = [
      `[L1]🎉 Parabéns, ${winnerNames}! Você ganhou R$ ${totalPrize.toLocaleString('pt-BR')} com a primeira linha![/L1]`,
      `[L1]✨ Primeira etapa concluída! ${winnerNames} faturou R$ ${totalPrize.toLocaleString('pt-BR')}![/L1]`
    ];
    formattedMessage = msgs[Math.floor(Math.random() * msgs.length)];
  } else if (currentStage === 'linha2') {
    const msgs = [
      `[L2]🎊 Dupla vitória! ${winnerNames} levou R$ ${totalPrize.toLocaleString('pt-BR')} pelas duas linhas![/L2]`,
      `[L2]🌓 Metade do caminho! ${winnerNames} levou a Linha Dupla: R$ ${totalPrize.toLocaleString('pt-BR')}![/L2]`
    ];
    formattedMessage = msgs[Math.floor(Math.random() * msgs.length)];
  } else if (currentStage === 'bingo') {
    const msgs = [
      `[BINGO]🏆🏆🏆 BINGO ÉPICO! ${winnerNames} faturou R$ ${totalPrize.toLocaleString('pt-BR')}![/BINGO]`,
      `[BINGO]👑👑 O REI DO BINGO! ${winnerNames} limpou a banca com R$ ${totalPrize.toLocaleString('pt-BR')}![/BINGO]`
    ];
    formattedMessage = msgs[Math.floor(Math.random() * msgs.length)];
  }

  io.to(roomType).emit('chat-message', {
    message: formattedMessage,
    sender: "Sistema",
    isBot: false,
    type: currentStage
  });

  // ✅ Verificar vitórias consecutivas (apenas humanos)
  const humanWinners = results.filter(r => !room.players[r.playerId].isBot);
  for (const hw of humanWinners) {
    const player = room.players[hw.playerId];
    if (player.currentWins >= 2) {
      const streakMsgs = [
        `🔥 ${player.name} está ON FIRE! ${player.currentWins} vitórias seguidas!`,
        `🚀 ${player.name} não para de vencer! Já são ${player.currentWins} prêmios!`
      ];
      const streakMsg = streakMsgs[Math.floor(Math.random() * streakMsgs.length)];
      setTimeout(() => {
        io.to(roomType).emit('chat-message', {
          message: streakMsg,
          sender: "🤖 SYSTEM",
          isBot: true,
          type: "streak"
        });
      }, 2000);
    }
  }

  // ✅ Mensagem especial para humanos que fazem bingo
  if (currentStage === 'bingo' && humanWinners.length > 0) {
    const humanNames = humanWinners.map(h => h.playerName).join(', ');
    setTimeout(() => {
      io.to(roomType).emit('chat-message', {
        message: `✨✨✨ CARTÃO DOURADO ATIVADO! ${humanNames} fez BINGO! ✨✨✨`,
        sender: "Sistema",
        isBot: false,
        special: "golden-bingo"
      });
    }, 1000);
  }

  // ✅ Jackpot com nomes únicos
  if (wonJackpot) {
    const jackpotUniqueNames = [...new Set(jackpotWinners.map(w => w.playerName))];
    const jackpotNames = jackpotUniqueNames.join(', ');
    const jackpotAmount = room.jackpot; // valor ANTES do reset
    setTimeout(() => {
      io.to(roomType).emit('chat-message', {
        message: `[JACKPOT]💰💰💰 JACKPOT HISTÓRICO! ${jackpotNames} levaram R$ ${jackpotAmount.toLocaleString('pt-BR')}![/JACKPOT]`,
        sender: "Sistema",
        isBot: false,
        type: "jackpot"
      });
    }, 1500);
  }

  io.to(roomType).emit('player-won', {
    winners: results,
    winnerNames,
    totalPrize,
    newStage: room.currentStage,
    jackpotWinners: wonJackpot ? jackpotWinners : null,
    ballsCount: room.drawnNumbers.length,
    wonJackpot: wonJackpot,
    currentWinnerId: room.currentWinnerId
  });

  broadcastPlayerList(roomType);
  broadcastRanking(roomType);
  pauseDraw(roomType);

  if (currentStage === 'bingo' || room.drawnNumbers.length >= (roomType === 'bingo75' ? 75 : 90)) {
    startAutoRestart(roomType);
  } else {
    resumeDraw(roomType);
  }
}

async function addBotToRoom(roomType, initialChips = INITIAL_CHIPS) {
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
  // ✅ Bots entram SEM cartelas e COM todos os chips
  room.players[botId] = {
    name: name,
    chips: initialChips,
    isBot: true,
    cards75: [],
    cards90: [],
    winsCount: 0,
    currentWins: 0
  };
  console.log(`🤖 Bot adicionado: ${name} entrou com ${initialChips} chips.`);
}

function broadcastPlayerList(roomType) {
  const room = rooms[roomType];
  if (!room) return;
  const players = Object.entries(room.players).map(([id, p]) => ({
    id,
    name: p.name,
    chips: p.chips,
    isBot: p.isBot,
    winsCount: p.winsCount || 0,
    currentWins: p.currentWins || 0,
    isCurrentWinner: id === room.currentWinnerId
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
    .map((player, index) => {
      const position = index + 1;
      let rankStyle = { color: '#ffffff', trophy: '' };
      if (position === 1) {
        rankStyle = { color: '#FFD700', trophy: '🥇' };
      } else if (position === 2) {
        rankStyle = { color: '#CD7F32', trophy: '🥉' };
      } else if (position === 3) {
        rankStyle = { color: '#C0C0C0', trophy: '🥈' };
      }
      return { ...player, position, rankStyle };
    });
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

async function handleAutoRestart(socket, roomType) {
  const room = rooms[roomType];
  if (!room) return;
  const playersToKeep = {};
  let activeBots = 0;
  for (const [id, player] of Object.entries(room.players)) {
    if (player.isBot && player.chips <= 0) continue;
    playersToKeep[id] = player;
    if (player.isBot) activeBots++;
  }

  if (room.addBotOnNextRestart && room.maxBots < MAX_BOTS_ALLOWED) {
    room.maxBots += 1;
    room.addBotOnNextRestart = false;
  }

  room.maxBots = Math.min(room.maxBots, MAX_BOTS_ALLOWED);
  room.players = playersToKeep;

  let currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
  while (currentBots < room.maxBots) {
    await addBotToRoom(roomType, INITIAL_CHIPS);
    currentBots = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
  }

  // ✅ Salvar chips persistentes ANTES de reiniciar
  const specialPlayers = {};
  const bots = {};
  for (const [id, player] of Object.entries(room.players)) {
    if (!player.isBot && (player.name === 'Markim' || player.name === 'Marília')) {
      specialPlayers[player.name] = player.chips;
    } else if (player.isBot) {
      bots[player.name] = player.chips;
    }
  }
  await savePersistedChips(specialPlayers, bots);

  room.drawnNumbers = [];
  room.lastNumber = null;
  room.pot = 0;
  room.currentStage = 'linha1';
  room.stageCompleted = { linha1: false, linha2: false, bingo: false };
  room.gameCompleted = false;
  room.gameActive = false;
  room.autoRestartTimeout = null;
  room.currentWinnerId = null;

  // ✅ CORREÇÃO: Bots NÃO compram cartelas no restart
  for (const [id, player] of Object.entries(room.players)) {
    if (player.isBot) {
      player.cards75 = [];
      player.cards90 = [];
    } else {
      player.cards75 = [];
      player.cards90 = [];
    }
  }

  io.to(roomType).emit('pot-update', { pot: room.pot, jackpot: room.jackpot });
  io.to(roomType).emit('room-reset');
  broadcastPlayerList(roomType);
  broadcastRanking(roomType);
  console.log(`🔄 Jogo reiniciado automaticamente. Bots: ${currentBots} (máximo: ${room.maxBots})`);
}

io.on('connection', (socket) => {
  socket.on('start-draw', () => {
    const roomType = socket.data?.roomType;
    if (roomType && !rooms[roomType].gameActive) {
      if (hasHumanWithCards(roomType)) {
        resumeDraw(roomType);
      } else {
        socket.emit('error', 'Nenhum jogador humano com cartela na sala.');
      }
    }
  });

  // ✅ Novo evento: desenhar próxima bola (chamado pelo cliente em mobile)
  socket.on('draw-next-number', () => {
    const roomType = socket.data?.roomType;
    if (!roomType || !rooms[roomType]) return;
    const room = rooms[roomType];
    if (!room.gameActive) return;
    const number = drawNumber(roomType);
    if (number === null) {
      io.to(roomType).emit('game-end', 'Todos os números foram sorteados!');
      startAutoRestart(roomType);
      return;
    }

    io.to(roomType).emit('number-drawn', {
      number,
      drawnNumbers: room.drawnNumbers,
      lastNumber: number
    });

    // ✅ Emitir estatísticas "na boa" após cada número
    const nearWinStats = countCardsOneBallAway(roomType);
    io.to(roomType).emit('near-win-stats', nearWinStats);

    // Atualiza cartelas dos humanos (só para Bingo 90)
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
  });

  console.log('🔌 Jogador conectado:', socket.id);

  socket.on('join-room', async ({ playerName, roomType, savedChips, savedCards75, savedCards90 }) => {
    if (!rooms[roomType]) {
      socket.emit('error', 'Sala inválida');
      return;
    }
    playerName = sanitizeName(playerName);
    const room = rooms[roomType];
    const persisted = await loadPersistedChips();
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
      let initialChips;
      if (savedChips != null && savedChips >= 0) {
        initialChips = savedChips;
      } else if (playerName === 'Markim' || playerName === 'Marília') {
        initialChips = persisted.specialPlayers[playerName] || INITIAL_CHIPS;
      } else {
        initialChips = INITIAL_CHIPS;
      }
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
      await addBotToRoom(roomType);
      const newBotCount = Object.keys(room.players).filter(id => id.startsWith('bot_')).length;
      if (newBotCount === currentBots) break;
      currentBots = newBotCount;
    }

    if (!room.players[playerId].isBot) {
      io.to(roomType).emit('chat-message', {
        message: `👋 Bem-vindo(a), ${playerName}! Preparado(a) para ganhar?`,
        sender: "🤖 SYSTEM",
        isBot: true,
        type: "welcome"
      });
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

    if (!room.autoMessageInterval) {
      startAutoMessages(roomType);
    }

    if (hasHumanWithCards(roomType) && !room.gameActive && !room.gameCompleted) {
      setTimeout(() => {
        if (hasHumanWithCards(roomType)) {
          resumeDraw(roomType);
        }
      }, 1000);
    }
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
    if (roomType && !rooms[roomType].gameActive) {
      if (hasHumanWithCards(roomType)) {
        resumeDraw(roomType);
      } else {
        socket.emit('error', 'Nenhum jogador humano com cartela na sala.');
      }
    }
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
    // ✅ CORREÇÃO: Objeto fakeSocket com estrutura válida
    const fakeSocket = {  { roomType }, id: 'manual' };
    handleAutoRestart(fakeSocket, roomType);
  });

  socket.on('chat-message', ({ message, sender, isBot }) => {
    const roomType = socket.data?.roomType;
    if (!roomType || !rooms[roomType]) return;
    if (!isBot) {
      io.to(roomType).emit('chat-message', { message, sender, isBot: false });
      const lowerMsg = message.toLowerCase();
      const hasKeyword = AI_KEYWORDS.some(kw => lowerMsg.includes(kw));
      if (hasKeyword) {
        const aiMessage = getSmartAiResponse(message);
        setTimeout(() => {
          io.to(roomType).emit('chat-message', {
            message: aiMessage,
            sender: "🤖 SYSTEM",
            isBot: true,
            type: "ai-response"
          });
        }, 1200 + Math.random() * 800);
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
      if (!hasHumanWithCards(roomType)) {
        pauseDraw(roomType);
        if (rooms[roomType].autoMessageInterval) {
          clearInterval(rooms[roomType].autoMessageInterval);
          rooms[roomType].autoMessageInterval = null;
        }
        console.log(`⏸️ Sala ${roomType} em standby: sem humanos com cartela.`);
      }
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

// ✅ Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await createTableIfNotExists();
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
});
