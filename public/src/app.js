const socket = io();
const chatContainer = document.getElementById('chat-container');
const messageInput = document.getElementById('messageInput');
const sendBtn = document.getElementById('sendBtn');
const imageInput = document.getElementById('imageInput');
const displayName = document.getElementById('display-name');
const notifSound = document.getElementById('notif-sound');

// Elementos de Preview de Imagem
const previewContainer = document.getElementById('preview-container');
const imgPreview = document.getElementById('img-preview');
const removePreviewBtn = document.getElementById('remove-preview');

// --- LÓGICA DE IDENTIFICAÇÃO ---
let myName = "";
while (!myName || myName.trim() === "") {
    myName = prompt("Qual é o seu nome?");
}
displayName.innerText = myName;

const currentRoom = "chat_geral";

// --- RESOLVE O PROBLEMA DE NÃO CARREGAR/ATUALIZAR ---
// Dispara o joinRoom SEMPRE que conectar ou reconectar
socket.on('connect', () => {
    socket.emit('joinRoom', currentRoom);
});

// Variáveis de controle de data
let lastRenderedDate = "";
let pendingImageData = null; 

// Formatação de data (Hoje, Ontem, DD/MM/AAAA)
function getFormattedDateLabel(dateObj) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (dateObj.toDateString() === today.toDateString()) return "Hoje";
    if (dateObj.toDateString() === yesterday.toDateString()) return "Ontem";
    
    return dateObj.toLocaleDateString('pt-BR');
}

function renderMessage(data) {
    const isMine = data.sender === myName;
    
    // Tratamento de Data e Hora
    const msgDate = data.timestamp ? new Date(data.timestamp) : new Date();
    const dateLabel = getFormattedDateLabel(msgDate);
    const timeLabel = msgDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Verifica se precisa renderizar o divisor de dias
    if (dateLabel !== lastRenderedDate) {
        const sepDiv = document.createElement('div');
        sepDiv.className = 'date-separator';
        sepDiv.innerHTML = `<span>${dateLabel}</span>`;
        chatContainer.appendChild(sepDiv);
        lastRenderedDate = dateLabel;
    }

    // Criando a mensagem
    const div = document.createElement('div');
    div.className = `message ${isMine ? 'mine' : ''}`;

    let content = `<div class="msg-sender">${data.sender}</div>`;
    
    if (data.text) {
        content += `<div class="msg-text">${data.text}</div>`;
    }

    if (data.image) {
        content += `<img src="${data.image}" class="chat-image" onclick="openModal('${data.image}')" />`;
    }

    content += `<div class="msg-time">${timeLabel}</div>`;

    div.innerHTML = content;
    chatContainer.appendChild(div);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Toca som apenas se não for minha e se tiver interações no dom
    if (!isMine) {
        notifSound.play().catch(() => {});
    }
}

// --- EVENTOS DO SOCKET ---
socket.on('chatHistory', (messages) => {
    chatContainer.innerHTML = '';
    lastRenderedDate = ""; // Reseta a data para re-renderizar corretamente os divisores
    messages.forEach(renderMessage);
});

socket.on('newMessage', renderMessage);

// --- LÓGICA DE PREVIEW E COPIAR/COLAR (CTRL+V) ---
const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
});

async function handleImageSelection(file) {
    if (!file) return;
    pendingImageData = await toBase64(file);
    imgPreview.src = pendingImageData;
    previewContainer.style.display = 'block';
    messageInput.focus();
}

// Ao selecionar do ícone 📷
imageInput.addEventListener('change', (e) => {
    handleImageSelection(e.target.files[0]);
});

// Ao dar Ctrl+V na página
document.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            handleImageSelection(blob);
            e.preventDefault(); // Evita bugar o input de texto
            break; 
        }
    }
});

// Botão de fechar preview
removePreviewBtn.addEventListener('click', () => {
    pendingImageData = null;
    imageInput.value = '';
    previewContainer.style.display = 'none';
});

// --- ENVIO DE MENSAGENS ---
function send() {
    const text = messageInput.value;

    if (text.trim() || pendingImageData) {
        socket.emit('sendMessage', {
            room: currentRoom,
            sender: myName,
            text: text,
            image: pendingImageData
            // O backend injetará o timestamp na hora de salvar
        });
        
        // Limpa o form
        messageInput.value = '';
        imageInput.value = '';
        pendingImageData = null;
        previewContainer.style.display = 'none';
    }
}

sendBtn.addEventListener('click', send);
messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send();
});

// Modal de visualização de imagem
const modal = document.getElementById('imageModal');
const expandedImg = document.getElementById('expandedImg');

function openModal(src) {
    expandedImg.src = src;
    modal.style.display = "flex";
}

modal.addEventListener('click', () => {
    modal.style.display = "none";
});


// ==========================================
// LÓGICA DE PWA E NOTIFICAÇÕES PUSH
// ==========================================

// Função auxiliar para converter a chave VAPID
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

async function registerServiceWorkerAndSubscribe(username) {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
            // Registra o Service Worker
            const register = await navigator.serviceWorker.register('/service-worker.js');
            
            // Pede permissão para mostrar notificações
            const permission = await Notification.requestPermission();
            
            if (permission === 'granted') {
                // Pega a chave pública do servidor
                const response = await fetch('/api/vapidPublicKey');
                const vapidPublicKey = await response.text();
                const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
                
                // Inscreve o navegador no serviço de Push
                const subscription = await register.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertedVapidKey
                });
                
                // Envia a inscrição + nome do usuário para o seu banco de dados
                await fetch('/api/subscribe', {
                    method: 'POST',
                    body: JSON.stringify({ subscription: subscription, username: username }),
                    headers: { 'content-type': 'application/json' }
                });
                
                console.log('Push notification ativado com sucesso!');
            }
        } catch (error) {
            console.error('Erro ao registrar SW ou Push:', error);
        }
    }
}

// Chama a função passando o nome que o usuário digitou no prompt lá no começo do script
registerServiceWorkerAndSubscribe(myName);