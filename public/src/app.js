const socket = io();
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageInput');

// Definindo a sala única (Exemplo: poderia vir da URL)
const currentRoom = "chat_privado_123"; 
const myName = "Kevin";

socket.emit('joinRoom', currentRoom);

function renderMessage(data) {
    const div = document.createElement('div');
    div.className = `message ${data.sender === myName ? 'mine' : ''}`;
    
    let content = `<strong>${data.sender}</strong><br>${data.text}`;
    if (data.image) {
        content += `<br><img src="${data.image}" />`;
    }
    
    div.innerHTML = content;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

socket.on('chatHistory', (messages) => {
    chatContainer.innerHTML = '';
    messages.forEach(renderMessage);
});

socket.on('newMessage', renderMessage);

async function send() {
    const text = messageInput.value;
    const file = imageInput.files[0];
    let imageData = null;

    if (file) {
        imageData = await toBase64(file);
    }

    if (text || imageData) {
        socket.emit('sendMessage', {
            room: currentRoom,
            sender: myName,
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
messageInput.addEventListener('keypress', (e) => { if(e.key === 'Enter') send(); });