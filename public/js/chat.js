// ✅ Adicionar mensagem no chat
function addChatMessage(text, sender, isBot = false, isSystem = false) {
const chatMessages = document.getElementById('chat-messages');
const p = document.createElement('p');
p.textContent = `${sender}: ${text}`;
if (isSystem) {
p.className = 'system';
} else if (isBot) {
p.className = 'bot';
} else {
p.className = 'human';
}
chatMessages.appendChild(p);
chatMessages.scrollTop = chatMessages.scrollHeight;
}

// ✅ Enviar mensagem do usuário
document.getElementById('chat-send').addEventListener('click', () => {
const input = document.getElementById('chat-input');
const msg = input.value.trim();
if (!msg) return;
socket.emit('chat-message', {
message: msg,
sender: playerName,
isBot: false
});
input.value = '';
});

document.getElementById('chat-input').addEventListener('keypress', (e) => {
if (e.key === 'Enter') {
document.getElementById('chat-send').click();
}
});
