// Game Client
const socket = io();

// Game constants
const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 5;
const BALL_SPEED = 12;

// Rainbow colors
const RAINBOW_COLORS = [
  '#FF0000', // Red
  '#FF7F00', // Orange
  '#FFFF00', // Yellow
  '#00FF00', // Green
  '#0000FF', // Blue
  '#4B0082', // Indigo
  '#9400D3'  // Violet
];

// State
let currentScreen = 'menu';
let gameState = null;
let myId = null;
let isBot = false;
let botGame = null;

// Bot settings
let botSettings = {
  playerName: 'Игрок',
  playerColor: '#FF0000',
  botCount: 2,
  roundTime: 60,
  roundCount: 3
};

// Online settings
let onlineSettings = {
  playerColor: '#FF0000'
};

// Game stats
let gameStats = {
  currentRound: 1,
  totalRounds: 3,
  timeLeft: 60,
  scores: {}
};

let timerInterval = null;
let botAIInterval = null;

// DOM Elements
const screens = {
  menu: document.getElementById('menu'),
  botSettings: document.getElementById('botSettings'),
  onlineMenu: document.getElementById('onlineMenu'),
  lobby: document.getElementById('lobby'),
  gameScreen: document.getElementById('gameScreen')
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const mobileControls = document.getElementById('mobileControls');
const statusText = document.getElementById('statusText');
const errorModal = document.getElementById('errorModal');
const errorText = document.getElementById('errorText');
const gameOverModal = document.getElementById('gameOverModal');
const winnerText = document.getElementById('winnerText');
const gameOverSubtext = document.getElementById('gameOverSubtext');
const finalResultsModal = document.getElementById('finalResultsModal');
const finalStats = document.getElementById('finalStats');
const timerValue = document.getElementById('timerValue');
const currentRoundEl = document.getElementById('currentRound');
const totalRoundsEl = document.getElementById('totalRounds');
const scoreBoard = document.getElementById('scoreBoard');

// Input state
let keys = {};
let mousePos = { x: 0, y: 0 };
let joystickDir = { x: 0, y: 0 };
let isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Initialize canvas
function initCanvas() {
  const scale = Math.min(
    window.innerWidth / GAME_WIDTH,
    (window.innerHeight - 100) / GAME_HEIGHT
  ) * 0.85;

  canvas.width = GAME_WIDTH;
  canvas.height = GAME_HEIGHT;
  canvas.style.width = `${GAME_WIDTH * scale}px`;
  canvas.style.height = `${GAME_HEIGHT * scale}px`;
}

// Screen management
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add('hidden'));
  screens[name].classList.remove('hidden');
  currentScreen = name;

  if (name === 'gameScreen') {
    initCanvas();
    if (isMobile) {
      mobileControls.classList.remove('hidden');
    }
  } else {
    mobileControls.classList.add('hidden');
  }
}

// Get rainbow color by index
function getRainbowColor(index) {
  return RAINBOW_COLORS[index % RAINBOW_COLORS.length];
}

// Update stats display
function updateStatsDisplay() {
  // Timer
  timerValue.textContent = gameStats.timeLeft;
  timerValue.classList.remove('warning', 'danger');
  if (gameStats.timeLeft <= 10) {
    timerValue.classList.add('danger');
  } else if (gameStats.timeLeft <= 20) {
    timerValue.classList.add('warning');
  }

  // Round
  currentRoundEl.textContent = gameStats.currentRound;
  totalRoundsEl.textContent = gameStats.totalRounds;

  // Scoreboard
  const state = isBot ? botGame : gameState;
  if (state) {
    scoreBoard.innerHTML = state.players.map(p => `
      <div class="score-item">
        <div class="score-color" style="background: ${p.color}"></div>
        <span class="score-name">${p.name}</span>
        <span class="score-value">${gameStats.scores[p.id] || 0}</span>
      </div>
    `).join('');
  }
}

// Menu event listeners
document.getElementById('btnBot').addEventListener('click', () => {
  showScreen('botSettings');
});

document.getElementById('btnOnline').addEventListener('click', () => {
  showScreen('onlineMenu');
});

document.getElementById('btnBackOnline').addEventListener('click', () => {
  showScreen('menu');
});

document.getElementById('btnBackBot').addEventListener('click', () => {
  showScreen('menu');
});

// Number selector buttons
document.querySelectorAll('.num-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.target;
    const action = btn.dataset.action;
    const el = document.getElementById(target);
    let value = parseInt(el.textContent);

    const limits = {
      botCount: { min: 1, max: 3 },
      roundTime: { min: 15, max: 180 },
      roundCount: { min: 1, max: 10 }
    };

    if (action === 'plus' && value < limits[target].max) {
      value++;
    } else if (action === 'minus' && value > limits[target].min) {
      value--;
    }

    el.textContent = value;
  });
});

// Color picker - Bot
document.getElementById('botColorPicker').addEventListener('click', (e) => {
  if (e.target.classList.contains('color-option')) {
    document.querySelectorAll('#botColorPicker .color-option').forEach(c => c.classList.remove('selected'));
    e.target.classList.add('selected');
    botSettings.playerColor = e.target.dataset.color;
  }
});

// Color picker - Online
document.getElementById('onlineColorPicker').addEventListener('click', (e) => {
  if (e.target.classList.contains('color-option')) {
    document.querySelectorAll('#onlineColorPicker .color-option').forEach(c => c.classList.remove('selected'));
    e.target.classList.add('selected');
    onlineSettings.playerColor = e.target.dataset.color;
  }
});

document.getElementById('btnStartBot').addEventListener('click', () => {
  botSettings.playerName = document.getElementById('botPlayerName').value.trim() || 'Игрок';
  botSettings.botCount = parseInt(document.getElementById('botCount').textContent);
  botSettings.roundTime = parseInt(document.getElementById('roundTime').textContent);
  botSettings.roundCount = parseInt(document.getElementById('roundCount').textContent);

  startBotGame();
});

document.getElementById('btnCreate').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim() || 'Игрок';
  socket.emit('createRoom', { playerName: name, playerColor: onlineSettings.playerColor });
});

document.getElementById('btnJoin').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim() || 'Игрок';
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (code) {
    socket.emit('joinRoom', { roomCode: code, playerName: name, playerColor: onlineSettings.playerColor });
  }
});

document.getElementById('btnStart').addEventListener('click', () => {
  socket.emit('startGame');
});

document.getElementById('btnLeaveLobby').addEventListener('click', () => {
  location.reload();
});

document.getElementById('btnCloseError').addEventListener('click', () => {
  errorModal.classList.add('hidden');
});

document.getElementById('btnPlayAgain').addEventListener('click', () => {
  finalResultsModal.classList.add('hidden');
  startBotGame();
});

document.getElementById('btnBackToMenu').addEventListener('click', () => {
  finalResultsModal.classList.add('hidden');
  cleanupGame();
  showScreen('menu');
});

// Socket events
socket.on('roomCreated', (data) => {
  myId = data.playerId;
  document.getElementById('lobbyCode').textContent = data.roomCode;
  updatePlayerList(data.players);
  showScreen('lobby');
});

socket.on('roomJoined', (data) => {
  myId = data.playerId;
  document.getElementById('lobbyCode').textContent = data.roomCode;
  updatePlayerList(data.players);
  showScreen('lobby');
});

socket.on('playerJoined', (data) => {
  updatePlayerList(data.players);
});

socket.on('playerLeft', (data) => {
  updatePlayerList(data.players);
});

socket.on('gameStarted', (state) => {
  gameState = state;
  showScreen('gameScreen');
  gameLoop();
});

socket.on('gameState', (state) => {
  gameState = state;
});

socket.on('roundEnd', (data) => {
  winnerText.textContent = `${data.winner.name} победил!`;
  gameOverModal.classList.remove('hidden');
  setTimeout(() => {
    gameOverModal.classList.add('hidden');
  }, 3000);
});

socket.on('error', (data) => {
  errorText.textContent = data.message;
  errorModal.classList.remove('hidden');
});

function updatePlayerList(players) {
  const list = document.getElementById('playerList');
  list.innerHTML = players.map((p, i) =>
    `<span class="player-tag" style="background: ${getRainbowColor(i)}">${p.name}</span>`
  ).join('');

  const startBtn = document.getElementById('btnStart');
  startBtn.disabled = players.length < 2;
}

// Keyboard input
document.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
});

document.addEventListener('keyup', (e) => {
  keys[e.key.toLowerCase()] = false;
});

// Mouse input
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mousePos.x = (e.clientX - rect.left) * scaleX;
  mousePos.y = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener('click', () => {
  if (isBot) {
    botThrow();
  } else {
    socket.emit('throw', mousePos);
  }
});

// Touch input for canvas
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  mousePos.x = (touch.clientX - rect.left) * scaleX;
  mousePos.y = (touch.clientY - rect.top) * scaleY;

  if (isBot) {
    botThrow();
  } else {
    socket.emit('throw', mousePos);
  }
});

// Mobile joystick
const joystick = document.getElementById('joystick');
const joystickKnob = document.getElementById('joystickKnob');
let joystickActive = false;
let joystickCenter = { x: 0, y: 0 };

joystick.addEventListener('touchstart', (e) => {
  e.preventDefault();
  joystickActive = true;
  const rect = joystick.getBoundingClientRect();
  joystickCenter = {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2
  };
});

document.addEventListener('touchmove', (e) => {
  if (!joystickActive) return;

  const touch = e.touches[0];
  const maxDist = 35;

  let dx = touch.clientX - joystickCenter.x;
  let dy = touch.clientY - joystickCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > maxDist) {
    dx = (dx / dist) * maxDist;
    dy = (dy / dist) * maxDist;
  }

  joystickKnob.style.left = `calc(50% + ${dx}px)`;
  joystickKnob.style.top = `calc(50% + ${dy}px)`;

  joystickDir.x = dx / maxDist;
  joystickDir.y = dy / maxDist;
});

document.addEventListener('touchend', () => {
  joystickActive = false;
  joystickKnob.style.left = '50%';
  joystickKnob.style.top = '50%';
  joystickDir = { x: 0, y: 0 };
});

// Throw button
document.getElementById('throwBtn').addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (isBot) {
    botThrow();
  } else {
    socket.emit('throw', { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 });
  }
});

// Game loop
function gameLoop() {
  if (currentScreen !== 'gameScreen') return;

  // Send input
  let dir = { x: 0, y: 0 };

  if (isMobile) {
    dir = joystickDir;
  } else {
    if (keys['w'] || keys['arrowup']) dir.y = -1;
    if (keys['s'] || keys['arrowdown']) dir.y = 1;
    if (keys['a'] || keys['arrowleft']) dir.x = -1;
    if (keys['d'] || keys['arrowright']) dir.x = 1;
  }

  // Normalize
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
  if (len > 0) {
    dir.x /= len;
    dir.y /= len;
  }

  if (isBot) {
    updateBotGame(dir);
  } else {
    socket.emit('move', dir);
  }

  // Update stats
  updateStatsDisplay();

  // Render
  render();

  requestAnimationFrame(gameLoop);
}

function render() {
  const state = isBot ? botGame : gameState;
  if (!state) return;

  ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Background with gradient
  const gradient = ctx.createLinearGradient(0, 0, GAME_WIDTH, GAME_HEIGHT);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

  // Field border with rainbow
  ctx.lineWidth = 4;
  const borderGradient = ctx.createLinearGradient(0, 0, GAME_WIDTH, 0);
  RAINBOW_COLORS.forEach((color, i) => {
    borderGradient.addColorStop(i / (RAINBOW_COLORS.length - 1), color);
  });
  ctx.strokeStyle = borderGradient;
  ctx.strokeRect(10, 10, GAME_WIDTH - 20, GAME_HEIGHT - 20);

  // Center line
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);
  ctx.beginPath();
  ctx.moveTo(GAME_WIDTH / 2, 10);
  ctx.lineTo(GAME_WIDTH / 2, GAME_HEIGHT - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // Center circle
  ctx.beginPath();
  ctx.arc(GAME_WIDTH / 2, GAME_HEIGHT / 2, 60, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.stroke();

  // Players
  state.players.forEach(player => {
    if (!player.isAlive) {
      // Ghost effect for eliminated players
      ctx.globalAlpha = 0.3;
    }

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(player.x + 3, player.y + 5, PLAYER_RADIUS, PLAYER_RADIUS * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body with gradient
    const playerGradient = ctx.createRadialGradient(
      player.x - 5, player.y - 5, 0,
      player.x, player.y, PLAYER_RADIUS
    );
    playerGradient.addColorStop(0, lightenColor(player.color, 30));
    playerGradient.addColorStop(1, player.color);
    ctx.fillStyle = playerGradient;
    ctx.beginPath();
    ctx.arc(player.x, player.y, PLAYER_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Voda indicator (crown effect)
    if (player.isVoda) {
      ctx.strokeStyle = '#FFD700';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(player.x, player.y, PLAYER_RADIUS + 6, 0, Math.PI * 2);
      ctx.stroke();

      // Crown
      ctx.fillStyle = '#FFD700';
      ctx.font = '16px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('👑', player.x, player.y - PLAYER_RADIUS - 12);
    }

    // Name with background
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    const nameWidth = ctx.measureText(player.name).width + 10;
    ctx.fillRect(player.x - nameWidth / 2, player.y - PLAYER_RADIUS - 28, nameWidth, 16);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(player.name, player.x, player.y - PLAYER_RADIUS - 16);

    // You indicator
    const playerId = isBot ? 'player' : myId;
    if (player.id === playerId) {
      ctx.fillStyle = '#4ECDC4';
      ctx.fillText('(ты)', player.x, player.y + 5);
    }

    ctx.globalAlpha = 1;
  });

  // Ball
  if (state.ball) {
    // Ball shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(state.ball.x + 2, state.ball.y + 3, BALL_RADIUS, BALL_RADIUS * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ball with gradient
    const ballGradient = ctx.createRadialGradient(
      state.ball.x - 3, state.ball.y - 3, 0,
      state.ball.x, state.ball.y, BALL_RADIUS
    );
    ballGradient.addColorStop(0, '#FF9999');
    ballGradient.addColorStop(1, '#FF6B6B');
    ctx.fillStyle = ballGradient;
    ctx.beginPath();
    ctx.arc(state.ball.x, state.ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Ball glow when flying
    if (state.ball.isFlying) {
      ctx.shadowColor = '#FF6B6B';
      ctx.shadowBlur = 15;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Trail effect
      ctx.strokeStyle = 'rgba(255, 107, 107, 0.3)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(state.ball.x - state.ball.vx * 3, state.ball.y - state.ball.vy * 3);
      ctx.lineTo(state.ball.x, state.ball.y);
      ctx.stroke();
    }
  }

  // Status
  const me = state.players.find(p => p.id === (isBot ? 'player' : myId));
  if (me) {
    if (me.isVoda) {
      statusText.textContent = '👑 Ты ВОДА! Кликни чтобы бросить мяч';
    } else if (me.isAlive) {
      statusText.textContent = '🏃 Уворачивайся от мяча!';
    } else {
      statusText.textContent = '💀 Ты выбыл. Жди следующий раунд';
    }
  }
}

// Helper function to lighten color
function lightenColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = (num >> 16) + amt;
  const G = (num >> 8 & 0x00FF) + amt;
  const B = (num & 0x0000FF) + amt;
  return '#' + (
    0x1000000 +
    (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
    (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
    (B < 255 ? (B < 1 ? 0 : B) : 255)
  ).toString(16).slice(1);
}

// ========== BOT MODE ==========

const BOT_NAMES = ['Молния', 'Тень', 'Шторм', 'Блиц', 'Вихрь', 'Гром'];
const SPAWN_POSITIONS = [
  { x: 100, y: 300 },
  { x: 700, y: 150 },
  { x: 700, y: 450 },
  { x: 400, y: 100 }
];

function cleanupGame() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (botAIInterval) {
    clearInterval(botAIInterval);
    botAIInterval = null;
  }
  isBot = false;
  botGame = null;
}

function startBotGame() {
  cleanupGame();
  isBot = true;

  // Reset stats
  gameStats = {
    currentRound: 1,
    totalRounds: botSettings.roundCount,
    timeLeft: botSettings.roundTime,
    scores: {}
  };

  // Create players
  const players = [
    {
      id: 'player',
      name: botSettings.playerName,
      x: SPAWN_POSITIONS[0].x,
      y: SPAWN_POSITIONS[0].y,
      color: botSettings.playerColor,
      isAlive: true,
      isVoda: false,
      direction: { x: 0, y: 0 }
    }
  ];

  // Add bots
  for (let i = 0; i < botSettings.botCount; i++) {
    players.push({
      id: `bot${i + 1}`,
      name: BOT_NAMES[i % BOT_NAMES.length],
      x: SPAWN_POSITIONS[i + 1].x,
      y: SPAWN_POSITIONS[i + 1].y,
      color: getRainbowColor(i + 1),
      isAlive: true,
      isVoda: false,
      direction: { x: 0, y: 0 }
    });
  }

  // Initialize scores
  players.forEach(p => {
    gameStats.scores[p.id] = 0;
  });

  // Select random voda
  const randomIndex = Math.floor(Math.random() * players.length);
  players[randomIndex].isVoda = true;
  players[randomIndex].x = GAME_WIDTH / 2;
  players[randomIndex].y = GAME_HEIGHT / 2;

  botGame = {
    players,
    ball: null,
    vodaId: players[randomIndex].id,
    gameWidth: GAME_WIDTH,
    gameHeight: GAME_HEIGHT
  };

  resetBotBall();

  showScreen('gameScreen');
  gameLoop();

  // Start timer
  timerInterval = setInterval(() => {
    gameStats.timeLeft--;
    if (gameStats.timeLeft <= 0) {
      endRoundByTime();
    }
  }, 1000);

  // Bot AI loop
  botAIInterval = setInterval(botAI, 1200 + Math.random() * 800);
}

function updateBotGame(playerDir) {
  // Update player movement
  const player = botGame.players.find(p => p.id === 'player');
  if (player && player.isAlive) {
    player.x = Math.max(PLAYER_RADIUS, Math.min(GAME_WIDTH - PLAYER_RADIUS, player.x + playerDir.x * PLAYER_SPEED));
    player.y = Math.max(PLAYER_RADIUS, Math.min(GAME_HEIGHT - PLAYER_RADIUS, player.y + playerDir.y * PLAYER_SPEED));
  }

  // Update bot movement (improved AI)
  botGame.players.forEach(p => {
    if (p.id === 'player' || !p.isAlive) return;

    // Bots try to dodge the ball
    if (botGame.ball && botGame.ball.isFlying && !p.isVoda) {
      const dx = botGame.ball.x - p.x;
      const dy = botGame.ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 150) {
        // Run away from ball
        p.direction.x = -dx / dist;
        p.direction.y = -dy / dist;
      }
    } else if (Math.random() < 0.03) {
      // Random movement
      p.direction = {
        x: (Math.random() - 0.5) * 2,
        y: (Math.random() - 0.5) * 2
      };
    }

    if (!p.isVoda) {
      const speed = PLAYER_SPEED * 0.6;
      p.x = Math.max(PLAYER_RADIUS, Math.min(GAME_WIDTH - PLAYER_RADIUS, p.x + p.direction.x * speed));
      p.y = Math.max(PLAYER_RADIUS, Math.min(GAME_HEIGHT - PLAYER_RADIUS, p.y + p.direction.y * speed));
    }
  });

  // Update ball
  if (botGame.ball) {
    if (botGame.ball.isFlying) {
      botGame.ball.x += botGame.ball.vx;
      botGame.ball.y += botGame.ball.vy;

      // Check collision
      botGame.players.forEach(p => {
        if (p.isVoda || !p.isAlive) return;

        const dx = botGame.ball.x - p.x;
        const dy = botGame.ball.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < PLAYER_RADIUS + BALL_RADIUS) {
          // Hit!
          p.isAlive = false;
          botGame.ball.isFlying = false;

          // Add score to voda
          gameStats.scores[botGame.vodaId]++;

          resetBotBall();
          checkBotWinner();
        }
      });

      // Out of bounds
      if (botGame.ball.x < 0 || botGame.ball.x > GAME_WIDTH ||
          botGame.ball.y < 0 || botGame.ball.y > GAME_HEIGHT) {
        botGame.ball.isFlying = false;
        resetBotBall();
      }
    } else if (botGame.ball.holderId) {
      const holder = botGame.players.find(p => p.id === botGame.ball.holderId);
      if (holder) {
        botGame.ball.x = holder.x;
        botGame.ball.y = holder.y;
      }
    }
  }
}

function resetBotBall() {
  const voda = botGame.players.find(p => p.isVoda);
  if (voda) {
    botGame.ball = {
      x: voda.x,
      y: voda.y,
      vx: 0,
      vy: 0,
      isFlying: false,
      holderId: voda.id
    };
  }
}

function botAI() {
  if (!botGame || !botGame.ball || botGame.ball.isFlying) return;

  const voda = botGame.players.find(p => p.isVoda);
  if (!voda || voda.id === 'player') return;

  // Bot throws at random alive player
  const targets = botGame.players.filter(p => !p.isVoda && p.isAlive);
  if (targets.length === 0) return;

  const target = targets[Math.floor(Math.random() * targets.length)];

  // Aim with prediction
  const predictX = target.x + target.direction.x * 20;
  const predictY = target.y + target.direction.y * 20;

  // Add some randomness
  const aimX = predictX + (Math.random() - 0.5) * 30;
  const aimY = predictY + (Math.random() - 0.5) * 30;

  const dx = aimX - botGame.ball.x;
  const dy = aimY - botGame.ball.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    botGame.ball.vx = (dx / dist) * BALL_SPEED;
    botGame.ball.vy = (dy / dist) * BALL_SPEED;
    botGame.ball.isFlying = true;
    botGame.ball.holderId = null;
  }
}

function botThrow() {
  if (!botGame || !botGame.ball || botGame.ball.isFlying) return;

  const player = botGame.players.find(p => p.id === 'player');
  if (!player || !player.isVoda) return;

  const dx = mousePos.x - botGame.ball.x;
  const dy = mousePos.y - botGame.ball.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist > 0) {
    botGame.ball.vx = (dx / dist) * BALL_SPEED;
    botGame.ball.vy = (dy / dist) * BALL_SPEED;
    botGame.ball.isFlying = true;
    botGame.ball.holderId = null;
  }
}

function checkBotWinner() {
  const alivePlayers = botGame.players.filter(p => p.isAlive && !p.isVoda);

  if (alivePlayers.length === 0) {
    // Voda wins round
    const voda = botGame.players.find(p => p.isVoda);
    showRoundWinner(voda);
  } else if (alivePlayers.length === 1 && botGame.players.length > 2) {
    // Last survivor wins
    showRoundWinner(alivePlayers[0]);
  }
}

function endRoundByTime() {
  // Time's up - voda wins if any players left, otherwise survivor with most health wins
  const voda = botGame.players.find(p => p.isVoda);
  const alivePlayers = botGame.players.filter(p => p.isAlive && !p.isVoda);

  if (alivePlayers.length > 0) {
    // Survivors win - pick random survivor
    const winner = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    showRoundWinner(winner);
  } else {
    showRoundWinner(voda);
  }
}

function showRoundWinner(winner) {
  // Add bonus point to winner
  gameStats.scores[winner.id]++;

  winnerText.textContent = `${winner.name} победил раунд!`;

  if (gameStats.currentRound >= gameStats.totalRounds) {
    gameOverSubtext.textContent = 'Игра окончена!';
    gameOverModal.classList.remove('hidden');

    setTimeout(() => {
      gameOverModal.classList.add('hidden');
      showFinalResults();
    }, 2000);
  } else {
    gameOverSubtext.textContent = `Следующий раунд через 3 секунды...`;
    gameOverModal.classList.remove('hidden');

    setTimeout(() => {
      gameOverModal.classList.add('hidden');
      nextRound(winner.id);
    }, 3000);
  }
}

function nextRound(newVodaId) {
  gameStats.currentRound++;
  gameStats.timeLeft = botSettings.roundTime;

  // Reset players
  botGame.players.forEach((p, i) => {
    p.isAlive = true;
    p.isVoda = p.id === newVodaId;
    if (p.isVoda) {
      p.x = GAME_WIDTH / 2;
      p.y = GAME_HEIGHT / 2;
    } else {
      p.x = SPAWN_POSITIONS[i].x;
      p.y = SPAWN_POSITIONS[i].y;
    }
    p.direction = { x: 0, y: 0 };
  });

  botGame.vodaId = newVodaId;
  resetBotBall();
}

function showFinalResults() {
  cleanupGame();

  // Sort by score
  const sortedPlayers = [...botGame.players].sort((a, b) =>
    gameStats.scores[b.id] - gameStats.scores[a.id]
  );

  const maxScore = gameStats.scores[sortedPlayers[0].id];

  finalStats.innerHTML = sortedPlayers.map((p, i) => {
    const isWinner = gameStats.scores[p.id] === maxScore;
    return `
      <div class="final-stat-row ${isWinner ? 'winner' : ''}">
        <div class="final-stat-name">
          ${isWinner ? '<span class="trophy">🏆</span>' : ''}
          <div class="final-stat-color" style="background: ${p.color}"></div>
          <span>${p.name}</span>
        </div>
        <span class="final-stat-score">${gameStats.scores[p.id]}</span>
      </div>
    `;
  }).join('');

  finalResultsModal.classList.remove('hidden');
}

// Initialize
showScreen('menu');
window.addEventListener('resize', initCanvas);
