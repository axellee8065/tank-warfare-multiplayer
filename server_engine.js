const utils = require('./js/utils.js');
global.CONFIG = utils.CONFIG;
global.Vec2 = utils.Vec2;
global.MathUtil = utils.MathUtil || {
    clamp: (v, min, max) => Math.max(min, Math.min(max, v)),
    lerp: (a, b, t) => a + (b - a) * t
};
global.ParticleSystem = utils.ParticleSystem;
global.AudioManager = utils.AudioManager;

const shells = require('./js/shells.js');
global.SHELL_TYPES = shells.SHELL_TYPES;

const map = require('./js/map.js');
global.GameMap = map.GameMap;
global.MAP_DATA = map.MAP_DATA;

const entities = require('./js/entities.js');
global.Tank = entities.Tank;
global.Bullet = entities.Bullet;
global.PowerUp = entities.PowerUp;

const ai = require('./js/ai.js');
global.AIController = ai.AIController || ai;

class ServerEngine {
    constructor(roomId, io, mode = '1v1') {
        this.roomId = roomId;
        this.io = io;
        this.mode = mode;
        
        this.running = false;
        this.tanks = [];
        this.bullets = [];
        this.powerups = [];
        this.map = null;
        
        this.round = 1;
        this.scores = { alpha: 0, bravo: 0 };
        this.roundOver = false;
        this.gameOver = false;
        this.powerupTimer = 0;
        this.gameTime = 0;
        this.aiControllers = [];
        this.inputs = {}; // { playerId: { up, down, left, right, shoot, angle, shellSlot } }
        
        this.lastTime = 0;
        this.tickInterval = null;
        this.tickRate = 1000 / 30; // 30 Hz
        
        this.canvasWidth = 1080; // Default logical map width
        this.canvasHeight = 1920; // Default logical map height
    }

    init(playerSetup, mapIndex) {
        // playerSetup = [{ id: 'socketId1', team: 0, isHuman: true }, { id: 'bot1', team: 1, isHuman: false }]
        this.map = new GameMap(mapIndex, this.canvasWidth, this.canvasHeight);
        this.playerSetup = playerSetup;
        this._createTanks();
        this.startRound();
    }

    _createTanks() {
        this.tanks = [];
        this.aiControllers = [];
        this.inputs = {};
        let alphaIdx = 0, bravoIdx = 0;
        
        for (let i = 0; i < this.playerSetup.length; i++) {
            const p = this.playerSetup[i];
            const teamIdx = p.team === 0 ? alphaIdx++ : bravoIdx++;
            const sp = this.map.getSpawnPos(p.team, teamIdx);
            
            const cx = this.canvasWidth / 2, cy = this.canvasHeight / 2;
            const angle = Math.atan2(cy - sp.y, cx - sp.x);
            let botClass = 'standard';
            
            if (!p.isHuman) {
                const rnd = Math.random();
                if (rnd < 0.3) botClass = 'scout';
                else if (rnd < 0.6) botClass = 'heavy';
            }

            const tank = new Tank(sp.x, sp.y, angle, i, p.team, p.isHuman, botClass);
            tank.socketId = p.id;
            this.tanks.push(tank);
            
            if (!p.isHuman) {
                this.aiControllers.push(new AIController('hard', botClass)); // Hard AI in MP
                this.inputs[i] = null;
            } else {
                this.aiControllers.push(null);
                this.inputs[i] = { up: false, down: false, left: false, right: false, shoot: false };
            }
        }
    }

    processInput(socketId, inputData) {
        const idx = this.tanks.findIndex(t => t.socketId === socketId);
        if (idx !== -1) {
            this.inputs[idx] = inputData;
        }
    }

    startRound() {
        this.bullets = [];
        this.powerups = [];
        this.roundOver = false;
        this.powerupTimer = CONFIG.POWERUP_INTERVAL;
        this.map.reset();

        let alphaIdx = 0, bravoIdx = 0;
        for (const tank of this.tanks) {
            const teamIdx = tank.team === 0 ? alphaIdx++ : bravoIdx++;
            const sp = this.map.getSpawnPos(tank.team, teamIdx);
            tank.spawnX = sp.x; tank.spawnY = sp.y;
            const cx = this.canvasWidth / 2, cy = this.canvasHeight / 2;
            tank.spawnAngle = Math.atan2(cy - sp.y, cx - sp.x);
            tank.respawn();
        }

        this.io.to(this.roomId).emit('round_start', { round: this.round, tanks: this._getTanksState() });
        
        setTimeout(() => {
            this.running = true;
            this.lastTime = Date.now();
            this.tickInterval = setInterval(() => this._loop(), this.tickRate);
        }, 1800);
    }

    _loop() {
        const now = Date.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        
        if (this.running && !this.roundOver) {
            this._update(dt);
            this._broadcastState();
        }
    }

    _update(dt) {
        this.gameTime += dt;

        // Update tanks
        for (let i = 0; i < this.tanks.length; i++) {
            const tank = this.tanks[i];
            if (!tank.alive) continue;

            let input;
            if (tank.isHuman) {
                input = this.inputs[i] || { up: false, down: false, left: false, right: false, shoot: false };
                
                // Process timers (buffs, cooldowns) but discard local dx/dy
                const movement = tank.update(dt, input);
                
                // Client-Authoritative position mapping
                if (input.clientPos && !this.roundOver) {
                    tank.x = input.clientPos.x;
                    tank.y = input.clientPos.y;
                    tank.angle = input.clientPos.angle;
                } else if (input.angle !== undefined) {
                    tank.angle = input.angle;
                }

                if (movement && movement.wantShoot) {
                    const bullet = tank.shoot();
                    if (bullet) {
                        this.bullets.push(bullet);
                        this.io.to(this.roomId).emit('sound', { type: 'shoot', x: tank.x, y: tank.y, angle: tank.angle, shellColor: bullet.shellColor });
                    }
                }
            } else {
                const enemies = this.tanks.filter(t => t.team !== tank.team && t.alive);
                input = this.aiControllers[i].update(dt, tank, enemies, this.bullets, this.map);
                
                const movement = tank.update(dt, input);
                if (movement) {
                    tank.applyMove(movement.dx, 0);
                    this.map.resolveCollision(tank);
                    this._resolveTankCollisions(tank);

                    tank.applyMove(0, movement.dy);
                    this.map.resolveCollision(tank);
                    this._resolveTankCollisions(tank);

                    if (movement.wantShoot) {
                        const bullet = tank.shoot();
                        if (bullet) {
                            this.bullets.push(bullet);
                            this.io.to(this.roomId).emit('sound', { type: 'shoot', x: tank.x, y: tank.y, angle: tank.angle, shellColor: bullet.shellColor });
                        }
                    }
                }
            }
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(dt);

            if (this.map.isWallAt(b.x, b.y)) {
                if (b.bouncesLeft > 0) {
                    const prevX = b.x - b.vx * dt;
                    const prevY = b.y - b.vy * dt;
                    if (this.map.isWallAt(b.x, prevY) && !this.map.isWallAt(prevX, b.y)) {
                        b.bounceX(); b.x = prevX;
                    } else if (this.map.isWallAt(prevX, b.y) && !this.map.isWallAt(b.x, prevY)) {
                        b.bounceY(); b.y = prevY;
                    } else {
                        b.bounceX(); b.bounceY();
                        b.x = prevX; b.y = prevY;
                    }
                } else if (b.piercing && this.map.breakWallAt(b.x, b.y)) {
                    this.io.to(this.roomId).emit('sound', { type: 'hit' });
                } else {
                    if (this.map.breakWallAt(b.x, b.y)) {
                        this.io.to(this.roomId).emit('sound', { type: 'hit' });
                    }
                    if (b.explosive) this._splashDamage(b);
                    b.alive = false;
                }
            }

            for (const tank of this.tanks) {
                if (!tank.alive || tank.team === b.team) continue;
                const dist = Math.hypot(tank.x - b.x, tank.y - b.y);
                if (dist < tank.getCollisionRadius() + b.radius) {
                    const killed = tank.takeDamage(b.damage);
                    const shooter = this.tanks[b.owner];
                    
                    if (shooter) { shooter.stats.hits++; shooter.stats.damage += b.damage; }
                    if (b.dot) tank.applyDot(b.dot);
                    
                    this.io.to(this.roomId).emit('sound', { type: 'hit' });
                    if (b.explosive) this._splashDamage(b);

                    if (killed) {
                        if (shooter) shooter.stats.kills++;
                        this.io.to(this.roomId).emit('sound', { type: 'explode', x: tank.x, y: tank.y });
                    }
                    b.alive = false;
                    break;
                }
            }
            if (!b.alive) this.bullets.splice(i, 1);
        }

        // Power-ups
        this.powerupTimer -= dt;
        if (this.powerupTimer <= 0) {
            this.powerupTimer = CONFIG.POWERUP_INTERVAL + Math.random() * 4;
            const types = ['health', 'speed', 'rapid', 'shield'];
            const type = types[Math.floor(Math.random() * types.length)];
            const pos = this.map.getRandomEmptyPos();
            this.powerups.push(new PowerUp(pos.x, pos.y, type));
            if (this.powerups.length > 5) this.powerups.shift();
        }

        for (let i = this.powerups.length - 1; i >= 0; i--) {
            const pu = this.powerups[i];
            pu.update(dt);
            for (const tank of this.tanks) {
                if (!tank.alive) continue;
                if (Math.hypot(tank.x - pu.x, tank.y - pu.y) < tank.getCollisionRadius() + pu.radius) {
                    tank.applyPowerUp(pu.type);
                    this.io.to(this.roomId).emit('sound', { type: 'powerup' });
                    this.powerups.splice(i, 1);
                    break;
                }
            }
        }

        this._checkRoundEnd();
    }

    _resolveTankCollisions(tank) {
        for (const other of this.tanks) {
            if (other === tank || !other.alive) continue;
            const dist = Math.hypot(tank.x - other.x, tank.y - other.y);
            const minDist = tank.getCollisionRadius() + other.getCollisionRadius();
            if (dist < minDist && dist > 0) {
                const push = (minDist - dist) / dist * 0.5;
                const dx = (tank.x - other.x) * push;
                const dy = (tank.y - other.y) * push;
                tank.x += dx; tank.y += dy;
                other.x -= dx; other.y -= dy;
            }
        }
    }

    _splashDamage(bullet) {
        const r = bullet.splashRadius || 45;
        const dmg = bullet.splashDamage || 12;
        for (const tank of this.tanks) {
            if (!tank.alive || tank.team === bullet.team) continue;
            const dist = Math.hypot(tank.x - bullet.x, tank.y - bullet.y);
            if (dist < r) {
                const falloff = 1 - (dist / r);
                tank.takeDamage(Math.round(dmg * falloff));
            }
        }
    }

    _checkRoundEnd() {
        if (this.roundOver || this.gameOver) return;

        let alphaAlive = false, bravoAlive = false;
        for (const t of this.tanks) {
            if (t.alive) {
                if (t.team === 0) alphaAlive = true;
                else bravoAlive = true;
            }
        }

        if (!alphaAlive || !bravoAlive) {
            this.roundOver = true;
            this.running = false;
            clearInterval(this.tickInterval);

            let resultParams = { alphaAlive, bravoAlive };
            if (!alphaAlive && !bravoAlive) { // Draw
            } else if (alphaAlive) {
                this.scores.alpha++;
            } else {
                this.scores.bravo++;
            }

            // Sync final state before round logic triggers
            this._broadcastState();

            setTimeout(() => {
                const winThreshold = CONFIG.ROUNDS_TO_WIN || 2;
                if (this.scores.alpha >= winThreshold || this.scores.bravo >= winThreshold) {
                    this.gameOver = true;
                    // Game Over event
                    this.io.to(this.roomId).emit('game_over', { 
                        scores: this.scores, 
                        winner: this.scores.alpha > this.scores.bravo ? 'alpha' : 'bravo',
                        tanks: this._getTanksState() 
                    });
                } else {
                    this.round++;
                    this.startRound();
                }
            }, 3000);
            
            this.io.to(this.roomId).emit('round_end', {
                round: this.round,
                scores: this.scores,
                winner: alphaAlive && bravoAlive ? 'draw' : (alphaAlive ? 'alpha' : 'bravo')
            });
        }
    }

    _getTanksState() {
        return this.tanks.map(t => ({
            id: t.index,
            x: t.x, y: t.y, angle: t.angle,
            hp: t.hp, maxHp: t.maxHp, alive: t.alive, team: t.team, isHuman: t.isHuman,
            socketId: t.socketId,
            buffs: t.buffs,
            stats: t.stats
        }));
    }

    _broadcastState() {
        const state = {
            tanks: this._getTanksState(),
            bullets: this.bullets.map(b => ({
                id: b.id || Math.random(), 
                x: b.x, y: b.y, vx: b.vx, vy: b.vy, radius: b.radius, color: b.shellColor
            })),
            powerups: this.powerups.map(p => ({
                x: p.x, y: p.y, type: p.type
            })),
            breakables: this.map.breakables.filter(b => b.alive)
        };
        this.io.to(this.roomId).emit('sync', state);
    }
}

module.exports = { ServerEngine };
