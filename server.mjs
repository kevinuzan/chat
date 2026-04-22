import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import webpush from 'web-push';

// --- CONFIGURAÇÕES BÁSICAS ---
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7 // 10MB para fotos
});

const PORT = process.env.PORT || 3000;
const DB_NAME = "planejamento_financeiro"; // Você pode usar o mesmo DB e mudar a collection
const CHAT_COLLECTION = "chat_messages";
const SUBS_COLLECTION = "subscriptions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONGO_URI = process.env.MONGO_PUBLIC_URL || "SUA_URI_LOCAL_DE_TESTE";

// --- MIDDLEWARES ---
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- WEB PUSH CONFIG ---
const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails('mailto:uzankevin93@gmail.com', publicVapidKey, privateVapidKey);
}

// --- CONEXÃO MONGODB & LÓGICA DO CHAT ---
async function startServer() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        await client.connect();
        console.log("Conectado ao MongoDB com sucesso!");
        const db = client.db(DB_NAME);
        const chatColl = db.collection(CHAT_COLLECTION);
        const subsColl = db.collection(SUBS_COLLECTION);

        // Endpoint de Inscrição Push (Seu código original adaptado)
        app.post('/api/subscribe', async (req, res) => {
            const subscription = req.body;
            try {
                await subsColl.updateOne(
                    { endpoint: subscription.endpoint },
                    { $set: subscription },
                    { upsert: true }
                );
                res.status(201).json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        // --- LÓGICA DO SOCKET.IO (CHAT) ---
        io.on('connection', (socket) => {
            
            socket.on('joinRoom', async (room) => {
                socket.join(room);
                
                // Busca histórico usando o driver nativo
                const history = await chatColl
                    .find({ room: room })
                    .sort({ timestamp: -1 })
                    .limit(70)
                    .toArray();
                
                socket.emit('chatHistory', history);
            });

            socket.on('sendMessage', async (data) => {
                const newMessage = {
                    room: data.room,
                    sender: data.sender,
                    text: data.text,
                    image: data.image,
                    timestamp: new Date()
                };
                
                // Salva no MongoDB
                await chatColl.insertOne(newMessage);
                
                // Envia para a sala específica
                io.to(data.room).emit('newMessage', newMessage);
            });
        });

        // Inicia o servidor HTTP (que agora engloba o Express e o Socket.io)
        httpServer.listen(PORT, () => {
            console.log(`Servidor rodando na porta ${PORT}`);
        });

    } catch (err) {
        console.error("Erro ao conectar ao MongoDB:", err);
    }
}

startServer();