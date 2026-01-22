// backup.js — Backup automático do banco de dados
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');
const BACKUP_DIR = path.join(__dirname, 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

function createBackup() {
  if (!fs.existsSync(DB_PATH)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, `backup-${timestamp}.json`);

  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    fs.writeFileSync(backupPath, data, 'utf8');
    console.log(`✅ Backup salvo: ${backupPath}`);

    // Manter apenas os últimos 10 backups
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.startsWith('backup-'))
      .sort((a, b) => {
        const aTime = fs.statSync(path.join(BACKUP_DIR, a)).mtime;
        const bTime = fs.statSync(path.join(BACKUP_DIR, b)).mtime;
        return bTime - aTime;
      });

    if (backups.length > 10) {
      for (let i = 10; i < backups.length; i++) {
        fs.unlinkSync(path.join(BACKUP_DIR, backups[i]));
        console.log(`🗑️ Backup antigo removido: ${backups[i]}`);
      }
    }
  } catch (err) {
    console.error('❌ Falha no backup:', err.message);
  }
}

setInterval(createBackup, 5 * 60 * 1000);
createBackup();

module.exports = { createBackup };