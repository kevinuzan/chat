import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { MongoClient, ObjectId } from 'mongodb';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import webpush from 'web-push';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    maxHttpBufferSize: 1e7 // 10MB para fotos
});

const PORT = process.env.PORT || 3000;
const DB_NAME = "planejamento_financeiro"; 
const CHAT_COLLECTION = "chat_messages";
const SUBS_COLLECTION = "subscriptions";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MONGO_URI = process.env.MONGO_PUBLIC_URL || "SUA_URI_LOCAL_DE_TESTE";

app.use(cors());
app.use(express.json());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const publicVapidKey = process.env.VAPID_PUBLIC_KEY;
const privateVapidKey = process.env.VAPID_PRIVATE_KEY;
if (publicVapidKey && privateVapidKey) {
    webpush.setVapidDetails('mailto:uzankevin93@gmail.com', publicVapidKey, privateVapidKey);
}

async function startServer() {
    const client = new MongoClient(MONGO_URI);
    
    try {
        await client.connect();
        console.log("Conectado ao MongoDB com sucesso!");
        const db = client.db(DB_NAME);
        const chatColl = db.collection(CHAT_COLLECTION);
        const subsColl = db.collection(SUBS_COLLECTION);

        // 1. Rota para o frontend pegar a chave pública
        app.get('/api/vapidPublicKey', (req, res) => {
            res.send(process.env.VAPID_PUBLIC_KEY);
        });

        // 2. Rota de inscrição (salva a subscription junto com o nome do usuário)
        app.post('/api/subscribe', async (req, res) => {
            const { subscription, username } = req.body;
            try {
                await subsColl.updateOne(
                    { "subscription.endpoint": subscription.endpoint },
                    { $set: { subscription, username } },
                    { upsert: true }
                );
                res.status(201).json({ success: true });
            } catch (err) {
                res.status(500).json({ error: err.message });
            }
        });

        io.on('connection', (socket) => {
            
            socket.on('joinRoom', async (room) => {
                socket.join(room);
                
                // Busca histórico usando o driver nativo
                const history = await chatColl
                    .find({ room: room })
                    .sort({ timestamp: -1 })
                    .limit(70)
                    .toArray();
                
                socket.emit('chatHistory', history.reverse());
            });

            socket.on('sendMessage', async (data) => {
                const newMessage = { ...data, timestamp: new Date() };
                
                // Salva no MongoDB e emite no chat
                await chatColl.insertOne(newMessage);
                io.to(data.room).emit('newMessage', newMessage);

                // 3. ENVIO DE NOTIFICAÇÃO PUSH
                try {
                    // Pega as inscrições de todo mundo, MENOS de quem enviou a mensagem
                    const subscriptions = await subsColl.find({ username: { $ne: data.sender } }).toArray();
                    
                    const payload = JSON.stringify({
                        title: data.sender,
                        body: data.text ? data.text : '📷 Enviou uma imagem'
                    });
                    
                    subscriptions.forEach(sub => {
                        webpush.sendNotification(sub.subscription, payload).catch(err => {
                            // Se der erro (ex: usuário removeu a permissão), removemos do banco
                            if (err.statusCode === 410 || err.statusCode === 404) {
                                subsColl.deleteOne({ _id: sub._id });
                            }
                        });
                    });
                } catch (err) {
                    console.error("Erro ao enviar push:", err);
                }
            });
        });

        httpServer.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));

    } catch (err) {
        console.error("Erro ao conectar ao MongoDB:", err);
    }
}
startServer();