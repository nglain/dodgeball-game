const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const Game = require('./game');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from client folder
app.use(express.static(path.join(__dirname, '../client')));

// Game rooms
const rooms = new Map();

io.on('connection', (socket) => {
  console.log('Player connected:', socket.id);

  // Create room
  socket.on('createRoom', (data) => {
    const playerName = data.playerName || data;
    const playerColor = data.playerColor || '#FF0000';

    const roomCode = generateRoomCode();
    const game = new Game(roomCode);
    game.addPlayer(socket.id, playerName, playerColor);
    rooms.set(roomCode, game);
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomCreated', {
      roomCode,
      playerId: socket.id,
      players: game.getPlayersInfo()
    });
    console.log(`Room ${roomCode} created by ${playerName}`);
  });

  // Join room
  socket.on('joinRoom', ({ roomCode, playerName, playerColor }) => {
    const game = rooms.get(roomCode);

    if (!game) {
      socket.emit('error', { message: 'Комната не найдена' });
      return;
    }

    if (game.players.size >= 4) {
      socket.emit('error', { message: 'Комната полная (макс 4 игрока)' });
      return;
    }

    if (game.isStarted) {
      socket.emit('error', { message: 'Игра уже началась' });
      return;
    }

    game.addPlayer(socket.id, playerName, playerColor || '#FF0000');
    socket.join(roomCode);
    socket.roomCode = roomCode;

    socket.emit('roomJoined', {
      roomCode,
      playerId: socket.id,
      players: game.getPlayersInfo()
    });

    io.to(roomCode).emit('playerJoined', {
      players: game.getPlayersInfo()
    });

    console.log(`${playerName} joined room ${roomCode}`);
  });

  // Start game
  socket.on('startGame', (settings) => {
    const game = rooms.get(socket.roomCode);
    if (!game) return;

    if (game.players.size < 2) {
      socket.emit('error', { message: 'Нужно минимум 2 игрока' });
      return;
    }

    const roundTime = (settings && settings.roundTime) || 60;
    game.roundTime = roundTime;
    game.timeLeft = roundTime;

    game.start();
    io.to(socket.roomCode).emit('gameStarted', {
      state: game.getState(),
      roundTime: roundTime
    });

    // Start game loop
    game.loopInterval = setInterval(() => {
      game.update();
      io.to(socket.roomCode).emit('gameState', game.getState());

      // Check time
      game.timeLeft -= 1/60;
      if (game.timeLeft <= 0) {
        // Time's up - survivors win!
        const survivors = game.getSurvivors();
        if (survivors.length > 0) {
          io.to(socket.roomCode).emit('gameEnd', {
            winners: survivors,
            message: survivors.length === 1
              ? `${survivors[0].name} победил!`
              : `Выжили: ${survivors.map(s => s.name).join(', ')}`
          });
        } else {
          const voda = game.getVoda();
          io.to(socket.roomCode).emit('gameEnd', {
            winners: [voda],
            message: `${voda.name} (вода) победил!`
          });
        }
        clearInterval(game.loopInterval);
        game.isStarted = false;
      }

      if (game.checkWinner()) {
        const voda = game.getVoda();
        io.to(socket.roomCode).emit('gameEnd', {
          winners: [voda],
          message: `${voda.name} выбил всех!`
        });
        clearInterval(game.loopInterval);
        game.isStarted = false;
      }
    }, 1000 / 60); // 60 FPS
  });

  // Player movement
  socket.on('move', (direction) => {
    const game = rooms.get(socket.roomCode);
    if (game && game.isStarted) {
      game.movePlayer(socket.id, direction);
    }
  });

  // Throw ball
  socket.on('throw', (target) => {
    const game = rooms.get(socket.roomCode);
    if (game && game.isStarted) {
      game.throwBall(socket.id, target);
    }
  });

  // Disconnect
  socket.on('disconnect', () => {
    console.log('Player disconnected:', socket.id);

    if (socket.roomCode) {
      const game = rooms.get(socket.roomCode);
      if (game) {
        game.removePlayer(socket.id);

        if (game.players.size === 0) {
          if (game.loopInterval) clearInterval(game.loopInterval);
          rooms.delete(socket.roomCode);
          console.log(`Room ${socket.roomCode} deleted`);
        } else {
          io.to(socket.roomCode).emit('playerLeft', {
            players: game.getPlayersInfo()
          });
        }
      }
    }
  });
});

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
