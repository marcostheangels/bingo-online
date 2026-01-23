// ✅ Variáveis globais
let socket = null;
let isAdminMode = false;
let currentRoom = '';
let cardType = '';
let playerCards = [];
let roomsDrawnNumbers = [];
let gameEnded = false;
let playerName = '';
let currentStage = 'linha1';
// ✅ CONEXÃO
const SOCKET_URL = 'https://bingo-online-production.up.railway.app'; // ✅ removidos espaços
socket = io(SOCKET_URL, {
transports: ['websocket'],
reconnection: true,
reconnectionAttempts: Infinity
});
