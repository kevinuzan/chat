const socket = io();
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageInput');
const displayName = document.getElementById('display-name');

// --- LÓGICA DE IDENTIFICAÇÃO ---
let myName = "";

while (!myName || myName.trim() === "") {
    myName = prompt("Qual é o seu nome?");
}
displayName.innerText = myName;

// Definindo a sala única (Pode ser fixa para um chat global ou dinâmica)
const currentRoom = "chat_geral";

socket.emit('joinRoom', currentRoom);

// --- FUNÇÕES DE RENDERIZAÇÃO ---
// Seleciona o elemento de áudio
const notifSound = document.getElementById('notif-sound');

function renderMessage(data) {
    const isMine = data.sender === myName;

    const div = document.createElement('div');
    div.className = `message ${isMine ? 'mine' : ''}`;

    let content = `<strong>${data.sender}</strong><br>${data.text || ''}`;
    if (data.image) {
        content += `<br><img src="${data.image}" />`;
    }

    div.innerHTML = content;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // --- LÓGICA DO BIP ---
    // Só toca o som se a mensagem NÃO for minha
    if (!isMine) {
        // .play() retorna uma promessa, tratamos o erro caso o browser bloqueie
        notifSound.play().catch(error => {
            console.log("O som foi bloqueado pelo navegador até que haja uma interação.");
        });
    }
}

// --- EVENTOS DO SOCKET ---
socket.on('chatHistory', (messages) => {
    chatContainer.innerHTML = '';
    messages.forEach(renderMessage);
});

socket.on('newMessage', renderMessage);

// --- ENVIO DE MENSAGENS ---
async function send() {
    const text = messageInput.value;
    const file = imageInput.files[0];
    let imageData = null;

    if (file) {
        imageData = await toBase64(file);
    }

    if (text.trim() || imageData) {
        socket.emit('sendMessage', {
            room: currentRoom,
            sender: myName, // Agora usa o nome digitado no prompt
            text: text,
            image: imageData
        });
        messageInput.value = '';
        imageInput.value = '';
    }
}

const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

sendBtn.addEventListener('click', send);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
});