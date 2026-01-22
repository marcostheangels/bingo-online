// db.js — Sistema de persistência com JSON
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db.json');

const DEFAULT_DATA = {
  players: {},
  lastBackup: null
};

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      saveDB(DEFAULT_DATA);
      return DEFAULT_DATA;
    }
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('❌ Erro ao carregar DB:', err.message);
    return DEFAULT_DATA;
  }
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('❌ Erro ao salvar DB:', err.message);
  }
}

module.exports = { loadDB, saveDB };