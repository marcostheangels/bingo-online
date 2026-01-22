// public/validate.worker.js
self.onmessage = function(e) {
  const { cards, drawnNumbers, cardType } = e.data;
  
  function validateAndFixBingo90Card(card) {
    if (!Array.isArray(card) || card.length !== 3) return null;
    let count = 0;
    for (let r = 0; r < 3; r++) {
      if (!Array.isArray(card[r]) || card[r].length !== 9) return null;
      for (let c = 0; c < 9; c++) {
        if (typeof card[r][c] === 'number' && card[r][c] >= 1 && card[r][c] <= 90) {
          count++;
        }
      }
    }
    return count === 15 ? card : null;
  }

  function checkCardAchievements(card, drawnNumbers) {
    const markedInRow = [0, 0, 0];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 9; c++) {
        const num = card[r][c];
        if (num !== null && drawnNumbers.includes(num)) {
          markedInRow[r]++;
        }
      }
    }
    const completeLines = markedInRow.filter(c => c === 5).length;
    return {
      linha1: completeLines >= 1,
      linha2: completeLines >= 2,
      bingo: completeLines === 3
    };
  }

  const results = [];
  for (let i = 0; i < cards.length; i++) {
    if (cardType === '90') {
      const validCard = validateAndFixBingo90Card(cards[i]);
      if (validCard) {
        const win = checkCardAchievements(validCard, drawnNumbers);
        results.push({ index: i, valid: true, win });
      } else {
        results.push({ index: i, valid: false, win: null });
      }
    }
  }

  self.postMessage(results);
};