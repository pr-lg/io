require('dotenv').config();
const { io } = require('socket.io-client');
const fs = require('fs');
const path = require('path');

const host = process.env.WEBSOCKET_HOST || 'localhost';
const port = process.env.WEBSOCKET_PORT || 3000;

// Путь к файлу логов клиента
const clientLogPath = path.join(__dirname, 'client-events.log');

// Создаем файл логов, если он не существует
if (!fs.existsSync(clientLogPath)) {
    fs.writeFileSync(clientLogPath, '', 'utf8');
    console.log('Created new client log file');
}

// Функция для логирования событий
function logEvent(event, data) {
    const timestamp = new Date().toISOString();
    const logEntry = `${timestamp} - ${event}: ${JSON.stringify(data)}\n`;
    
    fs.appendFile(clientLogPath, logEntry, (err) => {
        if (err) {
            console.error('Error writing to log file:', err);
        }
    });
    console.log(`${timestamp} - ${event}:`, data);
}

// Создаем уникальный ID клиента
const clientId = 'client_' + Math.random().toString(36).substr(2, 9);

// Инициализируем соединение
const socket = io(`http://${host}:${port}`, {
    query: { clientId },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
});

// Обработчики событий
socket.on('connect', () => {
    logEvent('connect', { 
        clientId,
        socketId: socket.id,
        status: 'Connected to server'
    });
});

socket.on('disconnect', (reason) => {
    logEvent('disconnect', { 
        clientId,
        socketId: socket.id,
        reason 
    });
});

socket.on('reconnect_attempt', (attemptNumber) => {
    logEvent('reconnect_attempt', { 
        clientId,
        socketId: socket.id,
        attemptNumber 
    });
});

socket.on('reconnect', (attemptNumber) => {
    logEvent('reconnect', { 
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

socket.on('reconnect_failed', () => {
    logEvent('reconnect_failed', { 
        clientId,
        socketId: socket.id 
    });
});

socket.on('message', (message) => {
    logEvent('message_received', { 
        clientId,
        socketId: socket.id,
        message 
    });
});

socket.on('error', (error) => {
    logEvent('error', { 
        clientId,
        socketId: socket.id,
        error: error.message 
    });
});

// Обработка прерывания процесса
process.on('SIGINT', () => {
    logEvent('shutdown', { 
        clientId,
        socketId: socket.id,
        reason: 'Process interrupted' 
    });
    socket.close();
    process.exit();
});

// Отправка тестового сообщения каждые 10 секунд
setInterval(() => {
    if (socket.connected) {
        const message = `Test message from ${clientId} at ${new Date().toISOString()}`;
        socket.emit('message', message);
        logEvent('message_sent', { 
            clientId,
            socketId: socket.id,
            message 
        });
    }
}, 10 * 1000); // 10 seconds in milliseconds
