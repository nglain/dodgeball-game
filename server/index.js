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
  socket.on('createRoom', (playerName) => {
    const roomCode = generateRoomCode();
    const game = new Game(roomCode);
    game.addPlayer(socket.id, playerName);
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
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const game = rooms.get(roomCode);

    if (!game) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    if (game.players.size >= 4) {
      socket.emit('error', { message: 'Room is full (max 4 players)' });
      return;
    }

    if (game.isStarted) {
      socket.emit('error', { message: 'Game already started' });
      return;
    }

    game.addPlayer(socket.id, playerName);
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
  socket.on('startGame', () => {
    const game = rooms.get(socket.roomCode);
    if (!game) return;

    if (game.players.size < 2) {
      socket.emit('error', { message: 'Need at least 2 players' });
      return;
    }

    game.start();
    io.to(socket.roomCode).emit('gameStarted', game.getState());

    // Start game loop
    game.loopInterval = setInterval(() => {
      game.update();
      io.to(socket.roomCode).emit('gameState', game.getState());

      if (game.checkWinner()) {
        io.to(socket.roomCode).emit('roundEnd', {
          winner: game.winner,
          players: game.getPlayersInfo()
        });
        game.newRound();
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
