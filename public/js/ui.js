// ✅ Wake Lock
if ('wakeLock' in navigator) {
let wakeLock = null;
const requestWakeLock = async () => {
try { wakeLock = await navigator.wakeLock.request('screen'); } catch (err) { console.warn('Wake Lock:', err); }
};
document.addEventListener('DOMContentLoaded', requestWakeLock);
}
// ✅ Gestos de toque
let touchStartX = 0;
document.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
document.addEventListener('touchend', (e) => {
if (!touchStartX) return;
const diff = touchStartX - e.changedTouches[0].clientX;
const container = document.getElementById('cards-container');
if (Math.abs(diff) > 50) {
container.scrollBy({ left: diff > 0 ? 300 : -300, behavior: 'smooth' });
}
touchStartX = 0;
}, { passive: true });
