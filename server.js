const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    // Настройки для переподключения
    pingTimeout: 60000,
    pingInterval: 25000
});
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);

// Путь к файлу логов
const logFilePath = path.join(__dirname, 'events.log');

// Создаем файл логов, если он не существует
if (!fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '', 'utf8');
    console.log('Created new log file');
}

// Serve static files
app.use(express.static(__dirname));

// Корневой маршрут для отдачи index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint для получения логов
app.get('/api/logs', async (req, res) => {
    try {
        // Если файл не существует, возвращаем пустой массив
        if (!fs.existsSync(logFilePath)) {
            return res.json([]);
        }

        const logContent = await readFileAsync(logFilePath, 'utf8');
        const logs = logContent.split('\n')
            .filter(line => line.trim())
            .map(line => {
                try {
                    const [timestamp, ...rest] = line.split(' - ');
                    const [event, dataStr] = rest.join(' - ').split(': ');
                    const data = JSON.parse(dataStr);
                    return { timestamp, event, data };
                } catch (error) {
                    return null;
                }
            })
            .filter(log => log !== null);
        
        res.json(logs);
    } catch (error) {
        console.error('Error reading logs:', error);
        res.status(500).json({ error: 'Failed to read logs', details: error.message });
    }
});

// Функция для логирования событий
function logEvent(event, data) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${event}: ${JSON.stringify(data)}\n`;
    
    fs.appendFile(logFilePath, logEntry, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
}

// Хранение информации о подключенных клиентах
const connectedClients = new Map();

// Обработка подключений Socket.IO
io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    const clientId = socket.handshake.query.clientId || socket.id;
    
    // Сохраняем информацию о клиенте
    connectedClients.set(clientId, {
        socketId: socket.id,
        connectionTime: new Date(),
        reconnectCount: connectedClients.has(clientId) 
            ? connectedClients.get(clientId).reconnectCount + 1 
            : 0
    });

    const clientInfo = connectedClients.get(clientId);
    console.log(`Client connected from ${clientIp} (ID: ${clientId}, Reconnects: ${clientInfo.reconnectCount})`);
    
    logEvent('connection', { 
        clientIp, 
        clientId, 
        socketId: socket.id,
        reconnectCount: clientInfo.reconnectCount 
    });

    // Отправляем информацию о подключении клиенту
    socket.emit('connectionInfo', {
        clientId,
        reconnectCount: clientInfo.reconnectCount,
        serverTime: new Date().toISOString()
    });

    // Обработка входящих сообщений
    socket.on('message', (message) => {
        try {
            console.log(`Received message from ${clientId}: ${message}`);
            logEvent('message', { 
                clientIp, 
                clientId,
                socketId: socket.id, 
                message 
            });

            // Отправляем сообщение обратно клиенту
            socket.emit('message', `Server received: ${message}`);
        } catch (error) {
            console.error('Error processing message:', error);
            logEvent('error', { 
                clientIp, 
                clientId,
                socketId: socket.id, 
                error: error.message 
            });
        }
    });

    // Обработка переподключения
    socket.on('reconnect_attempt', (attemptNumber) => {
        logEvent('reconnect_attempt', { 
            clientId,
            socketId: socket.id,
            attemptNumber 
        });
    });

    socket.on('reconnect', (attemptNumber) => {
        logEvent('reconnect_success', { 
            clientId,
            socketId: socket.id,
            attemptNumber 
        });
    });

    socket.on('reconnect_error', (error) => {
        logEvent('reconnect_error', { 
            clientId,
            socketId: socket.id,
            error: error.message 
        });
    });

    // Обработка отключения клиента
    socket.on('disconnect', (reason) => {
        console.log(`Client ${clientId} disconnected (reason: ${reason})`);
        logEvent('disconnection', { 
            clientIp, 
            clientId,
            socketId: socket.id,
            reason 
        });
    });

    // Обработка ошибок
    socket.on('error', (error) => {
        console.error('Socket error:', error);
        logEvent('error', { 
            clientIp, 
            clientId,
            socketId: socket.id, 
            error: error.message 
        });
    });
});

// Запускаем сервер на порту 3000
const PORT = 3000;
http.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
