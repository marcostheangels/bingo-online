// ✅ Web Worker embutido
const workerCode = `
self.onmessage = function(e) {
const { cards, drawnNumbers } = e.data;
function validateAndFixBingo90Card(card) {
if (!Array.isArray(card) || card.length !== 3) return null;
let count = 0;
for (let r = 0; r < 3; r++) {
if (!Array.isArray(card[r]) || card[r].length !== 9) return null;
for (let c = 0; c < 9; c++) {
if (typeof card[r][c] === 'number' && card[r][c] >= 1 && card[r][c] <= 90) count++;
}
}
return count === 15 ? card : null;
}
function checkCardAchievements(card, drawnNumbers) {
const markedInRow = [0, 0, 0];
for (let r = 0; r < 3; r++) {
for (let c = 0; c < 9; c++) {
const num = card[r][c];
if (num !== null && drawnNumbers.includes(num)) markedInRow[r]++;
}
}
const completeLines = markedInRow.filter(c => c === 5).length;
return { linha1: completeLines >= 1, linha2: completeLines >= 2, bingo: completeLines === 3 };
}
const results = [];
for (let i = 0; i < cards.length; i++) {
const validCard = validateAndFixBingo90Card(cards[i]);
if (validCard) {
const win = checkCardAchievements(validCard, drawnNumbers);
results.push({ index: i, valid: true, win });
} else {
results.push({ index: i, valid: false, win: null });
}
}
self.postMessage(results);
};
`;
let validationWorker = null;
if (window.Worker) {
const blob = new Blob([workerCode], { type: 'application/javascript' });
validationWorker = new Worker(URL.createObjectURL(blob));
}
// ✅ Áudio
let audioContext = null;
function playSound(type, number = null) {
try {
if (!audioContext) {
const AudioContext = window.AudioContext || window.webkitAudioContext;
if (!AudioContext) return;
audioContext = new AudioContext();
}
if (audioContext.state === 'suspended') audioContext.resume();
const ctx = audioContext;
const now = ctx.currentTime;
if (type === 'sorteio') {
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.type = 'sine';
osc.frequency.setValueAtTime(300 + (number % 10) * 20, now);
gain.gain.setValueAtTime(0.15, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
osc.connect(gain);
gain.connect(ctx.destination);
osc.start(now);
osc.stop(now + 0.4);
} else if (type === 'linha1') {
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.type = 'sine';
osc.frequency.setValueAtTime(880, now);
gain.gain.setValueAtTime(0.3, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
osc.connect(gain);
gain.connect(ctx.destination);
osc.start(now);
osc.stop(now + 0.3);
} else if (type === 'linha2') {
const osc1 = ctx.createOscillator();
const osc2 = ctx.createOscillator();
const gain = ctx.createGain();
osc1.type = 'sine';
osc2.type = 'triangle';
osc1.frequency.setValueAtTime(660, now);
osc2.frequency.setValueAtTime(1320, now);
gain.gain.setValueAtTime(0.25, now);
gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
osc1.connect(gain);
osc2.connect(gain);
gain.connect(ctx.destination);
osc1.start(now);
osc2.start(now);
osc1.stop(now + 0.5);
osc2.stop(now + 0.5);
} else if (type === 'bingo') {
const notes = [523, 659, 784, 1046];
notes.forEach((freq, i) => {
const osc = ctx.createOscillator();
const gain = ctx.createGain();
osc.type = 'sine';
osc.frequency.setValueAtTime(freq, now + i * 0.15);
gain.gain.setValueAtTime(0.2, now + i * 0.15);
gain.gain.exponentialRampToValueAtTime(0.01, now + i * 0.15 + 0.2);
osc.connect(gain);
gain.connect(ctx.destination);
osc.start(now + i * 0.15);
osc.stop(now + i * 0.15 + 0.2);
});
}
} catch (e) { console.warn('Erro ao reproduzir som:', e); }
}
function speak(text) {
