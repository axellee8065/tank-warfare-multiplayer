// ============================================
// TANK WARFARE — Game Engine
// ============================================

class GameEngine {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.running = false;
        this.paused = false;
        this.tanks = [];
        this.bullets = [];
        this.powerups = [];
        this.particles = new ParticleSystem();
        this.audio = new AudioManager();
        this.audio.init();
        this.map = null;
        this.mode = '1v1';
        this.shakeX = 0;
        this.shakeY = 0;
        this.shakeIntensity = 0;
        this.round = 1;
        this.scores = { alpha: 0, bravo: 0 };
        this.roundOver = false;
        this.gameOver = false;
        this.powerupTimer = 0;
        this.gameTime = 0;
        this.aiControllers = [];
        this.inputState = {};
        this.shellInventory = null; // set from main.js
        this.lastTime = 0;
        this.animFrameId = null;
        this.onRoundEnd = null;
        this.onGameEnd = null;
        this.gameActive = false;
        this._keyDown = null;
        this._keyUp = null;
        this.aiDifficulty = 'medium';
        this.touchControls = null;
        this.gameType = 'pvp';
    }

    init(mode, playerSetup, mapIndex, difficulty, gameType, touchCtrl) {
        this.mode = mode;
        this.round = 1;
        this.scores = { alpha: 0, bravo: 0 };
        this.gameOver = false;
        this.gameTime = 0;
        this.gameActive = false;
        this.aiDifficulty = difficulty || 'medium';
        this.gameType = gameType || 'pvp';
        this.touchControls = touchCtrl || null;
        
        // Fixed logical resolution for Cross-Platform Sync
        this.canvas.width = 1920;
        this.canvas.height = 1080;
        
        this.map = new GameMap(mapIndex, this.canvas.width, this.canvas.height);
        this._createTanks(playerSetup);
        this._setupInput();

        if (this.gameType === 'online' && this.socket) {
            this._setupSocketListeners();
        } else {
            this.startRound(); // Trigger local start
        }
    }

    _setupSocketListeners() {
        this.socket.on('round_start', (data) => {
            console.log('Server round_start', data);
            this.round = data.round;
            this.bullets = [];
            this.powerups = [];
            this.roundOver = false;
            this.gameOver = false;
            this.gameActive = false;
            this.map.reset();
            this.audio.roundStart();
            this._showBanner(`ROUND ${this.round}`, '준비!');
            this._syncTanks(data.tanks);
            setTimeout(() => {
                this._hideBanner();
                this.gameActive = true;
                if (!this.running) this.start();
            }, 1800);
        });

        this.socket.on('sync', (data) => {
            if (!this.running || this.roundOver) return;
            this._syncTanks(data.tanks);
            this.bullets = (data.bullets || []).map(b => {
                const bullet = new Bullet(b.x, b.y, b.angle, null, b.team, b.shellType);
                bullet.vx = b.vx;
                bullet.vy = b.vy;
                return bullet;
            });
            this.powerups = (data.powerups || []).map(pu => new PowerUp(pu.x, pu.y, pu.type));
            if (data.breakables) {
                // sync breakable states
                for (let i = 0; i < this.map.breakables.length; i++) {
                    const bw = this.map.breakables[i];
                    bw.alive = data.breakables.some(db => db.col === bw.col && db.row === bw.row);
                }
            }
        });

        this.socket.on('sound', (data) => {
            if (data.type === 'shoot') {
                this.audio.shoot();
                this.particles.emit(data.x, data.y, 5, { color: ['#ffaa00', '#fff'], speed: 80, life: 0.2, size: 2, angle: data.angle, spread: 0.5 });
            } else if (data.type === 'hit') {
                this.audio.hit();
            } else if (data.type === 'explode') {
                this.audio.explode();
                this.shakeIntensity = 12;
                this.particles.explosion(data.x, data.y, true);
            } else if (data.type === 'powerup') {
                this.audio.powerup();
            }
        });

        this.socket.on('round_end', (data) => {
            this.roundOver = true;
            this.gameActive = false;
            this.scores = data.scores;
            this._updateHUD();
            this._showBanner('OVER', data.winner === 'draw' ? 'DRAW!' : 'TEAM ' + data.winner.toUpperCase() + ' WIN!');
            setTimeout(() => this._hideBanner(), 2500);
        });

        this.socket.on('game_over', (data) => {
            this._syncTanks(data.tanks);
            if (this.onGameEnd) {
                this.onGameEnd(data.winner, data.scores, this.tanks);
            }
        });
    }

    _syncTanks(serverTanks) {
        for (const st of serverTanks) {
            const tk = this.tanks[st.id];
            if (tk) {
                if (tk.targetX === undefined) {
                    tk.x = st.x; tk.targetX = st.x;
                    tk.y = st.y; tk.targetY = st.y;
                    tk.angle = st.angle; tk.targetAngle = st.angle;
                } else {
                    // Update Interpolation targets
                    tk.targetX = st.x;
                    tk.targetY = st.y;
                    let diff = st.angle - tk.angle;
                    // Normalize difference for shortest path Slerp
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    tk.targetAngle = tk.angle + diff;
                }
                // Instant properties
                tk.hp = st.hp; tk.maxHp = st.maxHp; tk.alive = st.alive;
                tk.buffs = st.buffs; tk.stats = st.stats;
            }
        }
    }

    _createTanks(playerSetup) {
        this.tanks = [];
        this.aiControllers = [];
        let alphaIdx = 0, bravoIdx = 0;
        for (let i = 0; i < playerSetup.length; i++) {
            const p = playerSetup[i];
            const teamIdx = p.team === 0 ? alphaIdx++ : bravoIdx++;
            const sp = this.map.getSpawnPos(p.team, teamIdx);
            // Face toward map center (diagonal corners)
            const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
            const angle = Math.atan2(cy - sp.y, cx - sp.x);
            let botClass = 'standard';
            if (!p.isHuman) {
                const rnd = Math.random();
                if (rnd < 0.3) botClass = 'scout';
                else if (rnd < 0.6) botClass = 'heavy';
            }

            const tank = new Tank(sp.x, sp.y, angle, i, p.team, p.isHuman, botClass);
            this.tanks.push(tank);
            if (!p.isHuman) {
                this.aiControllers.push(new AIController(this.aiDifficulty, botClass));
            } else {
                this.aiControllers.push(null);
                // Link shell inventory to human tanks
                if (this.shellInventory) {
                    tank.shellInventory = this.shellInventory;
                }
            }
        }
    }

    _setupInput() {
        this.inputState = {};
        // Remove old listeners if any
        if (this._keyDown) window.removeEventListener('keydown', this._keyDown);
        if (this._keyUp) window.removeEventListener('keyup', this._keyUp);

        this._keyDown = (e) => {
            // Prevent default for game keys to avoid scrolling/form actions
            const gameKeys = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Slash', 'Period', 'ShiftRight',
                'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];
            if (gameKeys.includes(e.code) && this.gameActive) {
                e.preventDefault();
            }
            if (e.code === 'Escape') {
                this.togglePause();
                return;
            }
            // Only set input state when game is active
            if (this.gameActive) {
                this.inputState[e.code] = true;
            }
        };
        this._keyUp = (e) => {
            this.inputState[e.code] = false;
        };
        window.addEventListener('keydown', this._keyDown);
        window.addEventListener('keyup', this._keyUp);
    }

    _getHumanInput(playerIndex) {
        if (!this.gameActive) return { up: false, down: false, left: false, right: false, shoot: false };

        // Touch controls override everything
        if (this.touchControls && this.touchControls.active) {
            const ts = this.touchControls.getState();
            const ks = this.inputState;
            return {
                up: ts.up || ks['ArrowUp'] || ks['KeyW'] || false,
                down: ts.down || ks['ArrowDown'] || ks['KeyS'] || false,
                left: ts.left || ks['ArrowLeft'] || ks['KeyA'] || false,
                right: ts.right || ks['ArrowRight'] || ks['KeyD'] || false,
                shoot: ts.shoot || ks['Space'] || false
            };
        }

        const ks = this.inputState;
        const humanPlayers = this.tanks.filter(t => t.isHuman);
        const humanIdx = humanPlayers.indexOf(this.tanks[playerIndex]);

        // VS BOT: primary player uses Arrow Keys + Space
        // Shell slot switching (1-5 keys)
        let shellSlot = undefined;
        for (let s = 0; s < 5; s++) {
            if (ks[`Digit${s + 1}`]) { shellSlot = s; ks[`Digit${s + 1}`] = false; break; }
        }

        if (this.gameType === 'vsbot') {
            return {
                up: ks['ArrowUp'] || ks['KeyW'] || false,
                down: ks['ArrowDown'] || ks['KeyS'] || false,
                left: ks['ArrowLeft'] || ks['KeyA'] || false,
                right: ks['ArrowRight'] || ks['KeyD'] || false,
                shoot: ks['Space'] || false,
                shellSlot
            };
        }

        // PVP: P1 = WASD+Space, P2 = Arrows+Slash
        if (humanIdx === 0) {
            return {
                up: ks['KeyW'] || false,
                down: ks['KeyS'] || false,
                left: ks['KeyA'] || false,
                right: ks['KeyD'] || false,
                shoot: ks['Space'] || false
            };
        } else if (humanIdx === 1) {
            return {
                up: ks['ArrowUp'] || false,
                down: ks['ArrowDown'] || false,
                left: ks['ArrowLeft'] || false,
                right: ks['ArrowRight'] || false,
                shoot: ks['Slash'] || ks['Period'] || ks['ShiftRight'] || false
            };
        }
        return { up: false, down: false, left: false, right: false, shoot: false };
    }

    startRound() {
        this.bullets = [];
        this.powerups = [];
        this.particles.clear();
        this.roundOver = false;
        this.powerupTimer = CONFIG.POWERUP_INTERVAL;
        this.shakeIntensity = 0;
        this.gameActive = false;
        this.inputState = {};
        this.map.reset();

        let alphaIdx = 0, bravoIdx = 0;
        for (const tank of this.tanks) {
            const teamIdx = tank.team === 0 ? alphaIdx++ : bravoIdx++;
            const sp = this.map.getSpawnPos(tank.team, teamIdx);
            tank.spawnX = sp.x; tank.spawnY = sp.y;
            const cx = this.canvas.width / 2, cy = this.canvas.height / 2;
            tank.spawnAngle = Math.atan2(cy - sp.y, cx - sp.x);
            tank.respawn();
        }

        this.audio.roundStart();
        this._showBanner(`ROUND ${this.round}`, '준비!');
        setTimeout(() => {
            this._hideBanner();
            this.gameActive = true;
        }, 1800);
    }

    _showBanner(text, sub) {
        const banner = document.getElementById('round-banner');
        document.getElementById('round-banner-text').textContent = text;
        document.getElementById('round-banner-sub').textContent = sub || '';
        banner.classList.remove('hidden');
    }

    _hideBanner() {
        document.getElementById('round-banner').classList.add('hidden');
    }

    togglePause() {
        if (!this.gameActive && !this.paused) return;
        this.paused = !this.paused;
        document.getElementById('pause-overlay').classList.toggle('hidden', !this.paused);
    }

    start() {
        this.running = true;
        this.lastTime = performance.now();
        this._loop();
    }

    stop() {
        this.running = false;
        this.gameActive = false;
        if (this.animFrameId) cancelAnimationFrame(this.animFrameId);
        if (this._keyDown) window.removeEventListener('keydown', this._keyDown);
        if (this._keyUp) window.removeEventListener('keyup', this._keyUp);
        this._keyDown = null;
        this._keyUp = null;
    }

    _loop() {
        if (!this.running) return;
        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.05);
        this.lastTime = now;
        
        if (this.gameType === 'online') {
            this._updateOnline(dt);
        } else {
            if (!this.paused && !this.roundOver) {
                this._update(dt);
            }
        }
        
        this._draw();
        this.animFrameId = requestAnimationFrame(() => this._loop());
    }

    _updateOnline(dt) {
        if (!this.gameActive) return;
        this.gameTime += dt;
        
        const myIndex = this.tanks.findIndex(t => t.isHuman);
        if (myIndex !== -1 && this.socket) {
            const input = this._getHumanInput(myIndex);
            
            // Mouse/touch aim overrides
            if (this.touchControls && this.touchControls.active) {
                const joy = this.touchControls.getJoystick();
                if (joy.active) input.angle = joy.angle;
            } else if (this.mouseX !== undefined && this.mouseY !== undefined) {
                const cx = this.canvas.width / 2;
                const cy = this.canvas.height / 2;
                input.angle = Math.atan2(this.mouseY - cy, this.mouseX - cx);
            }
            
            // Only send if changed, or throttle? For now send at high rate
            this.socket.emit('player_input', { roomId: this.roomId, input });
        }
        
        // INTERPOLATION for Tanks
        const LERP_SPEED = 15; // smooth factor, covers 24% at 60Hz per frame
        for (const tank of this.tanks) {
            if (!tank.alive || tank.targetX === undefined) continue;
            const factor = Math.min(LERP_SPEED * dt, 1.0);
            
            tank.x += (tank.targetX - tank.x) * factor;
            tank.y += (tank.targetY - tank.y) * factor;
            tank.angle += (tank.targetAngle - tank.angle) * factor;
            
            // Keep drawing angle normalized
            while (tank.angle < -Math.PI) tank.angle += Math.PI * 2;
            while (tank.angle > Math.PI) tank.angle -= Math.PI * 2;
        }

        // KINEMATIC INTEGRATION for Bullets
        for (const b of this.bullets) {
            if (b.vx !== undefined && b.vy !== undefined) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
            }
        }
        
        this.particles.update(dt);
        if (this.shakeIntensity > 0) {
            this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= 0.88;
            if (this.shakeIntensity < 0.5) this.shakeIntensity = 0;
        } else { this.shakeX = this.shakeY = 0; }
        
        this._updateHUD();
    }

    _update(dt) {
        if (!this.gameActive) return;
        this.gameTime += dt;

        // Update tanks
        for (let i = 0; i < this.tanks.length; i++) {
            const tank = this.tanks[i];
            if (!tank.alive) continue;

            let input;
            if (tank.isHuman) {
                input = this._getHumanInput(i);
            } else {
                const enemies = this.tanks.filter(t => t.team !== tank.team && t.alive);
                input = this.aiControllers[i].update(dt, tank, enemies, this.bullets, this.map);
            }

            const movement = tank.update(dt, input);
            if (movement) {
                tank.applyMove(movement.dx, 0);
                this.map.resolveCollision(tank);
                this._resolveTankCollisions(tank);

                tank.applyMove(0, movement.dy);
                this.map.resolveCollision(tank);
                this._resolveTankCollisions(tank);

                if (Math.abs(movement.dx) > 0.5 || Math.abs(movement.dy) > 0.5) {
                    this.particles.trail(tank.x, tank.y, tank.teamColor);
                }

                if (movement.wantShoot) {
                    const bullet = tank.shoot();
                    if (bullet) {
                        this.bullets.push(bullet);
                        this.audio.shoot();
                        this.particles.emit(bullet.x, bullet.y, 5, {
                            color: ['#ffaa00', '#fff'],
                            speed: 80, life: 0.2, size: 2,
                            angle: tank.angle, spread: 0.5
                        });
                    }
                }
            }
        }

        // Update bullets
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.update(dt);

            // Wall collision
            if (this.map.isWallAt(b.x, b.y)) {
                // Ricochet: bounce off walls
                if (b.bouncesLeft > 0) {
                    // Determine bounce axis
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
                    this.particles.emit(b.x, b.y, 4, { color: [b.shellColor, '#fff'], speed: 40, life: 0.2, size: 2 });
                } else if (b.piercing && this.map.breakWallAt(b.x, b.y)) {
                    // Piercing: go through breakable walls
                    this.particles.explosion(b.x, b.y);
                    this.audio.hit();
                } else {
                    // Standard wall hit
                    if (this.map.breakWallAt(b.x, b.y)) {
                        this.particles.explosion(b.x, b.y);
                        this.audio.hit();
                    }
                    this.particles.emit(b.x, b.y, 8, { color: ['#aaa', '#666'], speed: 60, life: 0.3, size: 2 });
                    // Explosive: splash even on wall
                    if (b.explosive) this._splashDamage(b);
                    b.alive = false;
                }
            }

            // Tank collision
            for (const tank of this.tanks) {
                if (!tank.alive || tank.team === b.team) continue;
                const dist = Math.hypot(tank.x - b.x, tank.y - b.y);
                if (dist < tank.getCollisionRadius() + b.radius) {
                    const killed = tank.takeDamage(b.damage);
                    const shooter = this.tanks[b.owner];
                    if (shooter) { shooter.stats.hits++; shooter.stats.damage += b.damage; }

                    // Venom DoT
                    if (b.dot) tank.applyDot(b.dot);

                    this.audio.hit();
                    this.shakeIntensity = 5;
                    this.particles.emit(b.x, b.y, 10, {
                        color: [b.shellColor, '#fff', '#ffaa00'], speed: 100, life: 0.3, size: 3
                    });

                    // Explosive splash
                    if (b.explosive) this._splashDamage(b);

                    if (killed) {
                        if (shooter) shooter.stats.kills++;
                        this._onKill(shooter);
                        this.audio.explode();
                        this.shakeIntensity = 12;
                        this.particles.explosion(tank.x, tank.y, true);
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
                    this.audio.powerup();
                    this.particles.emit(pu.x, pu.y, 15, {
                        color: [pu.colors[pu.type], '#fff'], speed: 80, life: 0.4, size: 3
                    });
                    this.powerups.splice(i, 1);
                    break;
                }
            }
        }

        this.particles.update(dt);

        // Screen shake
        if (this.shakeIntensity > 0) {
            this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
            this.shakeIntensity *= 0.88;
            if (this.shakeIntensity < 0.3) this.shakeIntensity = 0;
        } else { this.shakeX = this.shakeY = 0; }

        this._checkRoundEnd();
        this._updateHUD();
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

    // Splash damage for explosive shells
    _splashDamage(bullet) {
        const r = bullet.splashRadius || 45;
        const dmg = bullet.splashDamage || 12;
        for (const tank of this.tanks) {
            if (!tank.alive || tank.team === bullet.team) continue;
            const dist = Math.hypot(tank.x - bullet.x, tank.y - bullet.y);
            if (dist < r) {
                const falloff = 1 - (dist / r);
                const actualDmg = Math.round(dmg * falloff);
                tank.takeDamage(actualDmg);
                this.particles.emit(tank.x, tank.y, 5, {
                    color: ['#ff6600', '#ffaa00'], speed: 60, life: 0.2, size: 2
                });
            }
        }
        // Visual: big explosion ring
        this.particles.explosion(bullet.x, bullet.y, true);
        this.shakeIntensity = Math.max(this.shakeIntensity, 8);
    }

    // Coin reward on kill
    _onKill(shooter) {
        if (this.shellInventory && shooter && shooter.isHuman) {
            const params = typeof getRewardParams === 'function' ? getRewardParams(this.gameType) : {kill: 5};
            this.shellInventory.addCoins(params.kill);
        }
    }

    _checkRoundEnd() {
        const alphaAlive = this.tanks.filter(t => t.team === 0 && t.alive).length;
        const bravoAlive = this.tanks.filter(t => t.team === 1 && t.alive).length;

        if (alphaAlive === 0 || bravoAlive === 0) {
            this.roundOver = true;
            this.gameActive = false;
            const winner = alphaAlive > 0 ? 'alpha' : 'bravo';
            this.scores[winner]++;

            if (this.scores.alpha >= CONFIG.ROUNDS_TO_WIN || this.scores.bravo >= CONFIG.ROUNDS_TO_WIN) {
                this.gameOver = true;
                const winTeam = this.scores.alpha >= CONFIG.ROUNDS_TO_WIN ? 'alpha' : 'bravo';
                // Award coins for game win
                const reward = this._awardCoins(winTeam, 'game');
                const rewardText = reward > 0 ? ` (+${reward} COINS)` : '';
                this._showBanner(`${winTeam.toUpperCase()} WINS!`, `${this.scores.alpha} — ${this.scores.bravo}${rewardText}`);
                setTimeout(() => {
                    this._hideBanner();
                    if (this.onGameEnd) this.onGameEnd(winTeam, this.scores, this.tanks);
                }, 2500);
            } else {
                // Award coins for round win
                const reward = this._awardCoins(winner, 'round');
                const rewardText = reward > 0 ? ` (+${reward} COINS)` : '';
                this._showBanner(`${winner.toUpperCase()} WINS ROUND ${this.round}!`, `${this.scores.alpha} — ${this.scores.bravo}${rewardText}`);
                setTimeout(() => {
                    this._hideBanner();
                    this.round++;
                    this.startRound();
                }, 2500);
            }
        }
    }

    _updateHUD() {
        const alphaDiv = document.getElementById('hud-alpha');
        const bravoDiv = document.getElementById('hud-bravo');
        const roundDiv = document.getElementById('round-info');

        roundDiv.textContent = `ROUND ${this.round}  |  ${this.scores.alpha} — ${this.scores.bravo}`;

        let alphaHTML = '', bravoHTML = '';
        for (const tank of this.tanks) {
            const label = tank.isHuman ? `P${tank.index + 1}` : `BOT`;
            const hpPct = Math.max(0, (tank.hp / tank.maxHp) * 100);
            const hpColor = hpPct > 50 ? '#00e676' : hpPct > 25 ? '#ffd740' : '#ff1744';
            const opacity = tank.alive ? '1' : '0.3';
            const html = `<div class="hud-player" style="opacity:${opacity};border-color:${tank.teamColor}33">
                <span class="hud-player-name" style="color:${tank.teamColor}">${label}</span>
                <div class="hud-hp-bar"><div class="hud-hp-fill" style="width:${hpPct}%;background:${hpColor}"></div></div>
                <span class="hud-hp-text" style="color:${hpColor}">${Math.ceil(tank.hp)}</span>
            </div>`;
            if (tank.team === 0) alphaHTML += html;
            else bravoHTML += html;
        }
        alphaDiv.innerHTML = alphaHTML;
        bravoDiv.innerHTML = bravoHTML;
    }

    // Award coins for round/game wins
    _awardCoins(winTeam, type) {
        if (!this.shellInventory) return 0;
        const humanOnWinTeam = this.tanks.some(t => t.isHuman && (t.team === 0 ? 'alpha' : 'bravo') === winTeam);
        if (humanOnWinTeam) {
            const params = typeof getRewardParams === 'function' ? getRewardParams(this.gameType) : {roundWin: 10, gameWin: 20};
            const amount = type === 'game' ? params.gameWin : params.roundWin;
            this.shellInventory.addCoins(amount);
            return amount;
        }
        return 0;
    }

    _draw() {
        const ctx = this.ctx;
        const w = this.canvas.width, h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.save();
        ctx.translate(this.shakeX, this.shakeY);

        this.map.draw(ctx);
        this.powerups.forEach(pu => pu.draw(ctx));
        this.bullets.forEach(b => b.draw(ctx));
        this.tanks.forEach(t => t.draw(ctx));
        // Draw DoT indicators
        for (const t of this.tanks) {
            if (!t.alive || t.dots.length === 0) continue;
            ctx.save();
            ctx.globalAlpha = 0.4 + Math.sin(this.gameTime * 8) * 0.2;
            ctx.strokeStyle = t.dots[0].color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(t.x, t.y, t.getCollisionRadius() + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
        this.particles.draw(ctx);

        ctx.restore();

        // Shell HUD (bottom of canvas, outside shake)
        this._drawShellHUD(ctx, w, h);
    }

    _drawShellHUD(ctx, w, h) {
        if (!this.shellInventory || !this.gameActive) return;
        const humanTank = this.tanks.find(t => t.isHuman && t.alive);
        if (!humanTank) return;

        const info = this.shellInventory.getLoadoutInfo();
        const slotW = 42, slotH = 42, gap = 6;
        const totalW = info.length * (slotW + gap) - gap;
        const startX = (w - totalW) / 2;
        const startY = h - slotH - 12;

        for (let i = 0; i < info.length; i++) {
            const s = info[i];
            const x = startX + i * (slotW + gap);
            const active = humanTank.activeShellSlot === i;

            // Slot background
            ctx.fillStyle = active ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.5)';
            ctx.strokeStyle = active ? (s.empty ? '#555' : s.color) : 'rgba(255,255,255,0.1)';
            ctx.lineWidth = active ? 2 : 1;
            ctx.beginPath();
            ctx.roundRect(x, startY, slotW, slotH, 6);
            ctx.fill();
            ctx.stroke();

            // Key number
            ctx.fillStyle = active ? '#fff' : '#888';
            ctx.font = 'bold 9px Orbitron';
            ctx.textAlign = 'center';
            ctx.fillText(s.slot, x + slotW / 2, startY + 11);

            if (s.empty) {
                ctx.fillStyle = '#444';
                ctx.font = '16px sans-serif';
                ctx.fillText('—', x + slotW / 2, startY + 30);
            } else {
                // Shell icon
                ctx.font = '16px sans-serif';
                ctx.fillText(s.icon, x + slotW / 2, startY + 30);
                // Count
                if (s.id !== 'standard') {
                    ctx.fillStyle = s.count > 0 ? '#fff' : '#ff4444';
                    ctx.font = 'bold 9px Rajdhani';
                    ctx.fillText(s.count === Infinity ? '∞' : s.count, x + slotW / 2, startY + 40);
                } else {
                    ctx.fillStyle = '#aaa';
                    ctx.font = 'bold 9px Rajdhani';
                    ctx.fillText('∞', x + slotW / 2, startY + 40);
                }
            }
        }

        // Coins display
        ctx.fillStyle = '#ffd740';
        ctx.font = 'bold 11px Orbitron';
        ctx.textAlign = 'right';
        ctx.fillText(`🪙 ${this.shellInventory.coins}`, w - 12, h - 14);
    }

    resize() {
        if (!this.canvas.parentElement) return;
        this.canvas.width = this.canvas.parentElement.clientWidth;
        this.canvas.height = this.canvas.parentElement.clientHeight;
        if (this.map) {
            this.map.tileW = this.canvas.width / this.map.cols;
            this.map.tileH = this.canvas.height / this.map.rows;
        }
    }
}
