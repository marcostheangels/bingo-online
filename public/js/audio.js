// ✅ Conquistas
let achievements = JSON.parse(localStorage.getItem('bingo_achievements') || '[]');
let totalCardsBought = 0;
let consecutiveWins = 0;
let lastWinType = null;
function checkAchievements(winType = null, cardsBought = 0, ballsCount = null) {
const newAchievements = [];
totalCardsBought += cardsBought;
if (totalCardsBought >= 1000 && !achievements.includes('coletor')) {
achievements.push('coletor');
newAchievements.push('🏆 Colecionador: Comprou 1.000 cartelas!');
}
if (winType) {
if (winType === lastWinType) consecutiveWins++;
else { consecutiveWins = 1; lastWinType = winType; }
if (consecutiveWins >= 5 && !achievements.includes('invicto')) {
achievements.push('invicto');
newAchievements.push('🔥 Invicto: 5 vitórias seguidas!');
}
}
// ✅ CORRIGIDO: usar 60 bolas
if (winType === 'bingo' && ballsCount <= 60 && !achievements.includes('sortudo')) {
achievements.push('sortudo');
newAchievements.push('🍀 Sortudo: Ganhou o Jackpot!');
}
if (newAchievements.length > 0) {
