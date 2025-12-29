const GAME_WIDTH = 800;
const GAME_HEIGHT = 600;
const PLAYER_RADIUS = 20;
const BALL_RADIUS = 10;
const PLAYER_SPEED = 5;
const BALL_SPEED = 12;

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4'];
const SPAWN_POSITIONS = [
  { x: 100, y: 100 },
  { x: GAME_WIDTH - 100, y: 100 },
  { x: 100, y: GAME_HEIGHT - 100 },
  { x: GAME_WIDTH - 100, y: GAME_HEIGHT - 100 }
];

class Game {
  constructor(roomCode) {
    this.roomCode = roomCode;
    this.players = new Map();
    this.ball = null;
    this.vodaId = null;
    this.isStarted = false;
    this.winner = null;
    this.loopInterval = null;
  }

  addPlayer(id, name, color) {
    const index = this.players.size;
    const spawn = SPAWN_POSITIONS[index];

    this.players.set(id, {
      id,
      name,
      x: spawn.x,
      y: spawn.y,
      color: color || COLORS[index],
      isAlive: true,
      isVoda: false,
      direction: { x: 0, y: 0 }
    });
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.vodaId === id && this.players.size > 0) {
      this.selectRandomVoda();
    }
  }

  getPlayersInfo() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      color: p.color,
      isAlive: p.isAlive,
      isVoda: p.isVoda
    }));
  }

  start() {
    this.isStarted = true;
    this.selectRandomVoda();
    this.resetBall();
  }

  selectRandomVoda() {
    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive);
    if (alivePlayers.length === 0) return;

    // Reset all voda status
    this.players.forEach(p => p.isVoda = false);

    // Select random voda
    const randomIndex = Math.floor(Math.random() * alivePlayers.length);
    const voda = alivePlayers[randomIndex];
    voda.isVoda = true;
    this.vodaId = voda.id;

    // Move voda to center
    voda.x = GAME_WIDTH / 2;
    voda.y = GAME_HEIGHT / 2;
  }

  resetBall() {
    const voda = this.players.get(this.vodaId);
    if (voda) {
      this.ball = {
        x: voda.x,
        y: voda.y,
        vx: 0,
        vy: 0,
        isFlying: false,
        holderId: this.vodaId
      };
    }
  }

  movePlayer(id, direction) {
    const player = this.players.get(id);
    if (!player || !player.isAlive) return;

    player.direction = direction;
  }

  throwBall(id, target) {
    const player = this.players.get(id);
    if (!player || !player.isVoda || !this.ball || this.ball.isFlying) return;
    if (this.ball.holderId !== id) return;

    // Calculate direction to target
    const dx = target.x - this.ball.x;
    const dy = target.y - this.ball.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > 0) {
      this.ball.vx = (dx / dist) * BALL_SPEED;
      this.ball.vy = (dy / dist) * BALL_SPEED;
      this.ball.isFlying = true;
      this.ball.holderId = null;
    }
  }

  update() {
    if (!this.isStarted) return;

    // Update player positions
    this.players.forEach(player => {
      if (!player.isAlive) return;

      const newX = player.x + player.direction.x * PLAYER_SPEED;
      const newY = player.y + player.direction.y * PLAYER_SPEED;

      // Keep in bounds
      player.x = Math.max(PLAYER_RADIUS, Math.min(GAME_WIDTH - PLAYER_RADIUS, newX));
      player.y = Math.max(PLAYER_RADIUS, Math.min(GAME_HEIGHT - PLAYER_RADIUS, newY));
    });

    // Update ball
    if (this.ball) {
      if (this.ball.isFlying) {
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;

        // Check collision with players (not voda)
        this.players.forEach(player => {
          if (player.isVoda || !player.isAlive) return;

          const dx = this.ball.x - player.x;
          const dy = this.ball.y - player.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < PLAYER_RADIUS + BALL_RADIUS) {
            // Hit!
            player.isAlive = false;
            this.ball.isFlying = false;
            this.resetBall();
          }
        });

        // Ball out of bounds
        if (this.ball.x < 0 || this.ball.x > GAME_WIDTH ||
            this.ball.y < 0 || this.ball.y > GAME_HEIGHT) {
          this.ball.isFlying = false;
          this.resetBall();
        }
      } else if (this.ball.holderId) {
        // Ball follows holder
        const holder = this.players.get(this.ball.holderId);
        if (holder) {
          this.ball.x = holder.x;
          this.ball.y = holder.y;
        }
      }
    }
  }

  checkWinner() {
    const alivePlayers = Array.from(this.players.values()).filter(p => p.isAlive && !p.isVoda);

    if (alivePlayers.length === 0) {
      // Voda wins
      const voda = this.players.get(this.vodaId);
      if (voda) {
        this.winner = { id: voda.id, name: voda.name };
      }
      return true;
    }

    if (alivePlayers.length === 1 && this.players.size > 2) {
      // Last survivor becomes new voda
      this.winner = { id: alivePlayers[0].id, name: alivePlayers[0].name };
      return true;
    }

    return false;
  }

  newRound() {
    // Reset all players
    let index = 0;
    this.players.forEach(player => {
      player.isAlive = true;
      player.isVoda = false;
      player.x = SPAWN_POSITIONS[index].x;
      player.y = SPAWN_POSITIONS[index].y;
      player.direction = { x: 0, y: 0 };
      index++;
    });

    // Winner becomes voda
    if (this.winner) {
      const newVoda = this.players.get(this.winner.id);
      if (newVoda) {
        newVoda.isVoda = true;
        newVoda.x = GAME_WIDTH / 2;
        newVoda.y = GAME_HEIGHT / 2;
        this.vodaId = newVoda.id;
      }
    }

    this.winner = null;
    this.resetBall();
  }

  getState() {
    return {
      players: Array.from(this.players.values()).map(p => ({
        id: p.id,
        name: p.name,
        x: p.x,
        y: p.y,
        color: p.color,
        isAlive: p.isAlive,
        isVoda: p.isVoda
      })),
      ball: this.ball,
      vodaId: this.vodaId,
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT
    };
  }
}

module.exports = Game;
