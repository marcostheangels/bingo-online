const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

// ✅ Conexão com PostgreSQL (Railway)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ✅ Cria tabela se não existir (executa uma vez ao iniciar)
async function createTableIfNotExists() {
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
  try {
    // Inserir/atualizar Markim e Marília
    for (const [name, chips] of Object.entries(specialPlayers)) {
      await pool.query(
        `INSERT INTO persistent_chips (player_name, chips, is_bot)
         VALUES ($1, $2, false)
         ON CONFLICT (player_name) DO UPDATE SET chips = $2, updated_at = NOW()`,
        [name, chips]
      );
    }
    // Inserir/atualizar bots
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
    "Quando alguém leva o jackpot, ele volta a R$ 1.000.000 e recomeça!",
    "💰 O Jackpot é o prêmio máximo! Ele acumula uma pequena parte de cada cartela vendida!",
    "💎 Já pensou em ser o próximo milionário? O Jackpot está esperando por um mestre!",
    "🎯 Fique de olho no contador de bolas: passou da 60ª, o Jackpot fica para a próxima!",
    "🚀 A velocidade é tudo! Complete a cartela rápido e capture o prêmio acumulado!",
    "🌟 O Jackpot é dividido se mais de um humano fizer bingo na mesma bola premiada!",
    "🏦 O valor do Jackpot é real e atualizado em tempo real no topo da sua tela!",
    "⚡ Nada supera a emoção de ver a 60ª bola e gritar BINGO no Jackpot!",
    "🏆 Entrar para o Hall da Fama do Bingo Master Pro exige levar um Jackpot!",
    "🔔 O sino toca diferente quando o Jackpot sai! Você está pronto para esse som?",
    "🍀 Dica: Jogar com mais cartelas aumenta suas chances matemáticas de bater o Jackpot!",
    "📈 Ontem o Jackpot estava menor... ele não para de crescer! Aproveite agora!",
    "👑 O Jackpot é o trono do bingo. Quem sentar nele hoje leva uma fortuna!",
    "🌠 Um Jackpot não sai todo dia, por isso ele é o prêmio mais valioso da casa!",
    "💸 Se o Jackpot sair para um bot, o valor acumula ainda mais para os humanos!",
    "🛡️ Segurança total: o pagamento do Jackpot é garantido pelo sistema Master Pro!",
    "🔥 A temperatura sobe quando faltam apenas 2 números para o Jackpot!",
    "🌈 O pote de ouro no fim do arco-íris se chama Jackpot e ele está logo ali!",
    "🧊 Mantenha a calma! O Jackpot exige foco total no sorteio das bolas!",
    "🦾 Markim e Marília estão de olho no Jackpot, não deixe eles ganharem de você!",
    "🎁 O Jackpot é o maior presente que uma rodada de bingo pode te dar!",
    "🗝️ A chave da fortuna está na sua cartela. Será que os números batem com o Jackpot?",
    "💥 BUM! Quando o Jackpot sai, a sala inteira comemora com você!",
    "📊 Sabia que 1% de cada aposta vai direto para o montante do Jackpot?",
    "⏳ O tempo está passando e o Jackpot só aumenta. Garanta suas cartelas!",
    "🥇 Ser campeão é bom, mas levar o Jackpot é outro nível de vitória!",
    "🧵 Cada número sorteado é um fio de esperança para o grande prêmio acumulado!",
    "🥂 Prepare o champanhe: o próximo ganhador do Jackpot pode ser você!",
    "🧩 O Jackpot é o quebra-cabeça mais valioso do mundo. Complete-o!",
    "🧿 Sorte ou destino? No Jackpot, os dois caminham juntos!",
    "🛸 Um prêmio de outro planeta: é assim que chamamos o nosso Jackpot!"
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
app.use(express.static('public'));

let db = loadDB();

let rooms = {
  bingo90: {
>>>>>>> 788fc5f (Adiciona pg e corrige dependências)
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

<<<<<<< HEAD
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
=======
// === Geração de Cartela Corrigida ===
function generateValidBingo90Card() {
  const columns = [
    [1, 9], [10, 19], [20, 29], [30, 39], [40, 49],
    [50, 59], [60, 69], [70, 79], [80, 90]
>>>>>>> 788fc5f (Adiciona pg e corrige dependências)
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

function startAutoRestart(roomType) {
  const room = rooms[roomType];
  if (room.autoRestartTimeout) clearTimeout(room.autoRestartTimeout);
  io.to(roomType).emit('countdown-start', { seconds: 25 });
  room.autoRestartTimeout = setTimeout(() => {
    const fakeSocket = { data: { roomType }, id: 'system' };
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

  const winnerNames = results.map(r => r.playerName).join(', ');
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

  // ✅ Jackpot
  if (wonJackpot) {
    const jackpotNames = jackpotWinners.map(w => w.playerName).join(', ');
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
  const cardCount = getBotCardCount(currentBots + 1);
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

  for (const [id, player] of Object.entries(room.players)) {
    if (player.isBot) {
      const totalBotsNow = Object.keys(room.players).filter(pid => room.players[pid].isBot).length;
      const cardCount = Math.min(getBotCardCount(totalBotsNow), Math.floor(player.chips / PRICE_PER_CARD));
      if (cardCount > 0) {
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
      }
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
  console.log('🔌 Jogador conectado:', socket.id);

  socket.on('join-room', async ({ playerName, roomType, savedChips, savedCards75, savedCards90 }) => {
    if (!rooms[roomType]) {
      socket.emit('error', 'Sala inválida');
      return;
    }

    playerName = sanitizeName(playerName);
    const room = rooms[roomType];

    // ✅ Carregar chips persistentes
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

      // ✅ Usar chips persistentes se for Markim/Marília
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

<<<<<<< HEAD
=======
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
>>>>>>> 788fc5f (Adiciona pg e corrige dependências)
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

    // ✅ Só inicia o sorteio se houver humanos COM CARTELAS
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

<<<<<<< HEAD
      const currentCardCount = cardType === '75' ? player.cards75.length : player.cards90.length;
      if (currentCardCount + count > MAX_CARDS_PER_PLAYER) {
        return socket.emit('error', `Você já tem ${currentCardCount} cartelas. Máximo permitido: ${MAX_CARDS_PER_PLAYER}.`);
=======
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
>>>>>>> 788fc5f (Adiciona pg e corrige dependências)
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
    const fakeSocket = { data: { roomType }, id: 'manual' };
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

<<<<<<< HEAD
function validatePlayerState(player, roomType) {
  if (player.chips == null || typeof player.chips !== 'number' || player.chips < 0) player.chips = INITIAL_CHIPS;
  if (!Array.isArray(player.cards90)) player.cards90 = [];
  if (!Array.isArray(player.cards75)) player.cards75 = [];
  if (player.cards90.length > MAX_CARDS_PER_PLAYER) {
    player.cards90 = player.cards90.slice(0, MAX_CARDS_PER_PLAYER);
  }
  if (player.cards75.length > MAX_CARDS_PER_PLAYER) {
    player.cards75 = player.cards75.slice(0, MAX_CARDS_PER_PLAYER);
=======
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
>>>>>>> 788fc5f (Adiciona pg e corrige dependências)
  }
  if (roomType === 'bingo90') player.cards90 = player.cards90.map(card => validateAndFixBingo90Card(card));
  return player;
}

<<<<<<< HEAD
// ✅ Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await createTableIfNotExists();
  console.log(`✅ Servidor rodando em http://localhost:${PORT}`);
=======
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
>>>>>>> 788fc5f (Adiciona pg e corrige dependências)
});
