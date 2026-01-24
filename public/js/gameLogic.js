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
    localStorage.setItem('bingo_achievements', JSON.stringify(achievements));
    newAchievements.forEach(msg => {
      showAdminMessage(msg, 'success');
      speak(msg.replace(/[^a-zA-ZÀ-ÿ\s]/g, ''));
    });
  }
}

// ✅ Função corrigida para fase atual
function getBallsLeftForCurrentStage(card, drawnNumbers, stage) {
  if (!card || card.length !== 3) return Infinity;
  const markedInRow = [0, 0, 0];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 9; c++) {
      if (card[r][c] !== null && drawnNumbers.includes(card[r][c])) {
        markedInRow[r]++;
      }
    }
  }
  if (stage === 'linha1') {
    const completedLines = markedInRow.filter(count => count === 5).length;
    if (completedLines >= 1) return 0;
    const ballsForLine1 = Math.min(5 - markedInRow[0], 5 - markedInRow[1], 5 - markedInRow[2]);
    return Math.max(0, ballsForLine1);
  }
  else if (stage === 'linha2') {
    const completedLines = markedInRow.filter(count => count === 5).length;
    if (completedLines >= 2) return 0;
    if (completedLines === 0) {
      const sorted = [...markedInRow].sort((a, b) => b - a);
      return Math.max(0, (5 - sorted[0]) + (5 - sorted[1]));
    } else {
      const incompleteLines = markedInRow.filter(count => count < 5);
      const easiest = Math.min(...incompleteLines);
      return Math.max(0, 5 - easiest);
    }
  }
  else if (stage === 'bingo') {
    const totalMarked = markedInRow.reduce((a, b) => a + b, 0);
    return Math.max(0, 15 - totalMarked);
  }
  return Infinity;
}
