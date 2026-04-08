// ============================================
// TANK WARFARE — Entities (Bullet, PowerUp, Tank)
// ============================================
const { CONFIG, Vec2, MathUtil } = typeof window !== 'undefined' ? window : require('./utils.js');
const { SHELL_TYPES } = typeof window !== 'undefined' ? window : require('./shells.js');

class Bullet {
    constructor(x, y, angle, owner, team, shellType) {
        const st = shellType || SHELL_TYPES.standard;
        this.x = x; this.y = y;
        this.angle = angle;
        this.vx = Math.cos(angle) * st.speed;
        this.vy = Math.sin(angle) * st.speed;
        this.owner = owner;
        this.team = team;
        this.radius = st.radius;
        this.alive = true;
        this.life = st.life;
        this.trail = [];
        // Shell properties
        this.shellId = st.id;
        this.shellColor = st.color;
        this.shellGlow = st.glowColor;
        this.damage = st.damage;
        this.explosive = st.explosive || false;
        this.splashRadius = st.splashRadius || 0;
        this.splashDamage = st.splashDamage || 0;
        this.piercing = st.piercing || false;
        this.bouncesLeft = st.bounce || 0;
        this.dot = st.dot ? { ...st.dot } : null;
    }
    update(dt) {
        this.trail.push({ x: this.x, y: this.y, age: 0 });
        if (this.trail.length > 8) this.trail.shift();
        this.trail.forEach(t => t.age += dt);
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
        if (this.life <= 0) this.alive = false;
    }
    // Bounce off wall (for ricochet)
    bounceX() { if (this.bouncesLeft > 0) { this.vx *= -1; this.bouncesLeft--; return true; } return false; }
    bounceY() { if (this.bouncesLeft > 0) { this.vy *= -1; this.bouncesLeft--; return true; } return false; }

    draw(ctx) {
        const color = this.shellColor;
        // Trail
        for (let i = 0; i < this.trail.length; i++) {
            const t = this.trail[i];
            const alpha = (1 - t.age * 3) * (i / this.trail.length) * 0.5;
            if (alpha <= 0) continue;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(t.x, t.y, this.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // Bullet glow
        ctx.shadowColor = this.shellGlow;
        ctx.shadowBlur = 14;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
        // Piercing indicator (small diamond)
        if (this.piercing) {
            ctx.fillStyle = '#fff';
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(Math.PI / 4);
            ctx.fillRect(-2, -2, 4, 4);
            ctx.restore();
        }
        ctx.shadowBlur = 0;
    }
}

class PowerUp {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.type = type; // 'health', 'speed', 'rapid', 'shield'
        this.radius = 14;
        this.alive = true;
        this.time = 0;
        this.colors = { health: '#00e676', speed: '#ffd740', rapid: '#ff9100', shield: '#d500f9' };
        this.icons = { health: '+', speed: '»', rapid: '⚡', shield: '◆' };
    }
    update(dt) { this.time += dt; }
    draw(ctx) {
        const color = this.colors[this.type];
        const bob = Math.sin(this.time * 3) * 3;
        const pulse = 1 + Math.sin(this.time * 4) * 0.1;
        ctx.save();
        ctx.translate(this.x, this.y + bob);
        ctx.scale(pulse, pulse);
        // Outer glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 15;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.stroke();
        // Inner fill
        ctx.fillStyle = color + '33';
        ctx.fill();
        // Icon
        ctx.shadowBlur = 0;
        ctx.fillStyle = color;
        ctx.font = 'bold 14px Rajdhani';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.icons[this.type], 0, 1);
        ctx.restore();
    }
}

class Tank {
    constructor(x, y, angle, index, team, isHuman, botClass = 'standard') {
        this.x = x; this.y = y;
        this.angle = angle;
        this.index = index;
        this.team = team;
        this.isHuman = isHuman;
        
        // Apply class modifiers
        let hpMult = 1.0, spdMult = 1.0, scale = 1.0;
        if (!isHuman && typeof BOT_CLASSES !== 'undefined' && BOT_CLASSES[botClass]) {
            hpMult = BOT_CLASSES[botClass].hpMult;
            spdMult = BOT_CLASSES[botClass].spdMult;
            scale = BOT_CLASSES[botClass].scale;
        }

        this.hp = CONFIG.TANK_HP * hpMult;
        this.maxHp = CONFIG.TANK_HP * hpMult;
        this.alive = true;
        this.speed = CONFIG.TANK_SPEED * spdMult;
        this.rotSpeed = CONFIG.TANK_ROT_SPEED;
        this.shootCooldown = 0;
        this.cooldownTime = CONFIG.SHOOT_COOLDOWN;
        this.w = CONFIG.TANK_WIDTH * scale;
        this.h = CONFIG.TANK_HEIGHT * scale;
        this.color = CONFIG.PLAYER_COLORS[index] || '#ffffff';
        this.teamColor = team === 0 ? CONFIG.TEAM_COLORS.alpha : CONFIG.TEAM_COLORS.bravo;
        // Buffs
        this.buffs = { speed: 0, rapid: 0, shield: 0 };
        // Stats
        this.stats = { shots: 0, hits: 0, kills: 0, damage: 0 };
        // Flash on hit
        this.flashTime = 0;
        // Spawn position
        this.spawnX = x; this.spawnY = y; this.spawnAngle = angle;
        // Shell system
        this.activeShellSlot = 0; // 0-4
        this.shellInventory = null; // set by engine for human players
        // DoT (damage over time)
        this.dots = []; // [{ timeLeft, dps, color }]
    }

    respawn() {
        this.x = this.spawnX; this.y = this.spawnY;
        this.angle = this.spawnAngle;
        this.hp = this.maxHp;
        this.alive = true;
        this.shootCooldown = 0;
        this.buffs = { speed: 0, rapid: 0, shield: 0 };
        this.dots = [];
        this.activeShellSlot = 0;
    }

    update(dt, input) {
        if (!this.alive) return;
        // Buffs timer
        for (const key in this.buffs) {
            if (this.buffs[key] > 0) this.buffs[key] -= dt;
        }
        this.flashTime = Math.max(0, this.flashTime - dt);
        this.shootCooldown = Math.max(0, this.shootCooldown - dt);

        // DoT damage
        for (let i = this.dots.length - 1; i >= 0; i--) {
            const d = this.dots[i];
            d.timeLeft -= dt;
            this.hp -= d.dps * dt;
            if (d.timeLeft <= 0) this.dots.splice(i, 1);
        }
        if (this.hp <= 0 && this.alive) {
            this.hp = 0; this.alive = false;
            return { dx: 0, dy: 0, wantShoot: false, dotKill: true };
        }

        const spd = this.speed * (this.buffs.speed > 0 ? 1.5 : 1);
        if (input.left) this.angle -= this.rotSpeed * dt;
        if (input.right) this.angle += this.rotSpeed * dt;
        let dx = 0, dy = 0;
        if (input.up) { dx = Math.cos(this.angle) * spd * dt; dy = Math.sin(this.angle) * spd * dt; }
        if (input.down) { dx = -Math.cos(this.angle) * spd * 0.6 * dt; dy = -Math.sin(this.angle) * spd * 0.6 * dt; }

        // Shell switching (from input)
        if (input.shellSlot !== undefined && input.shellSlot !== this.activeShellSlot) {
            this.activeShellSlot = input.shellSlot;
        }

        return { dx, dy, wantShoot: input.shoot };
    }

    applyMove(dx, dy) {
        this.x += dx;
        this.y += dy;
    }

    getActiveShellType() {
        if (!this.shellInventory) return SHELL_TYPES.standard;
        const info = this.shellInventory.getSlotType(this.activeShellSlot);
        return info || SHELL_TYPES.standard;
    }

    shoot() {
        if (!this.alive || this.shootCooldown > 0) return null;
        const shellType = this.getActiveShellType();

        // Check ammo (consume from inventory)
        if (this.shellInventory && shellType.id !== 'standard') {
            if (!this.shellInventory.consume(shellType.id)) {
                // Out of ammo — switch to standard
                this.activeShellSlot = 0;
                return this.shoot(); // retry with standard
            }
        }

        const cd = this.cooldownTime * (this.buffs.rapid > 0 ? 0.5 : 1);
        this.shootCooldown = cd;
        this.stats.shots++;
        const bx = this.x + Math.cos(this.angle) * (this.h * 0.6);
        const by = this.y + Math.sin(this.angle) * (this.h * 0.6);
        return new Bullet(bx, by, this.angle, this.index, this.team, shellType);
    }

    applyDot(dotInfo) {
        // Stack DoT or refresh
        this.dots.push({ timeLeft: dotInfo.duration, dps: dotInfo.dps, color: dotInfo.color });
    }

    takeDamage(amount) {
        if (this.buffs.shield > 0) { this.buffs.shield = 0; return false; }
        this.hp -= amount;
        this.flashTime = 0.15;
        if (this.hp <= 0) { this.hp = 0; this.alive = false; return true; }
        return false;
    }

    applyPowerUp(type) {
        switch (type) {
            case 'health': this.hp = Math.min(this.maxHp, this.hp + 50); break;
            case 'speed': this.buffs.speed = 5; break;
            case 'rapid': this.buffs.rapid = 5; break;
            case 'shield': this.buffs.shield = 8; break;
        }
    }

    getCollisionRadius() { return Math.max(this.w, this.h) * 0.45; }

    draw(ctx) {
        if (!this.alive) return;
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle + Math.PI / 2);

        const w = this.w, h = this.h;
        const hw = w / 2, hh = h / 2;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-hw + 2, -hh + 2, w, h);

        // Treads
        ctx.fillStyle = '#333';
        ctx.fillRect(-hw - 3, -hh, 5, h);
        ctx.fillRect(hw - 2, -hh, 5, h);
        // Tread detail
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1;
        for (let i = 0; i < h; i += 5) {
            ctx.beginPath();
            ctx.moveTo(-hw - 3, -hh + i); ctx.lineTo(-hw + 2, -hh + i);
            ctx.moveTo(hw - 2, -hh + i); ctx.lineTo(hw + 3, -hh + i);
            ctx.stroke();
        }

        // Body
        const flash = this.flashTime > 0;
        const bodyColor = flash ? '#ffffff' : this.teamColor;
        ctx.fillStyle = bodyColor;
        ctx.shadowColor = this.teamColor;
        ctx.shadowBlur = flash ? 20 : 8;
        this._roundRect(ctx, -hw, -hh, w, h, 4);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Body detail lines
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-hw + 3, -hh + 3, w - 6, h - 6);

        // Turret base
        ctx.fillStyle = flash ? '#fff' : this._darken(this.teamColor, 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 2);
        ctx.fill();

        // Barrel
        ctx.fillStyle = flash ? '#fff' : '#ddd';
        ctx.fillRect(-2.5, -hh - 8, 5, hh + 2);
        // Barrel tip
        ctx.fillStyle = this.teamColor;
        ctx.fillRect(-3.5, -hh - 10, 7, 4);

        // Shield indicator
        if (this.buffs.shield > 0) {
            ctx.strokeStyle = '#d500f9';
            ctx.lineWidth = 2;
            ctx.shadowColor = '#d500f9';
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(0, 0, Math.max(hw, hh) + 5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();

        // HP bar
        this._drawHPBar(ctx);
        // Player label
        this._drawLabel(ctx);
    }

    _drawHPBar(ctx) {
        const barW = 36, barH = 4;
        const bx = this.x - barW / 2;
        const by = this.y - this.h / 2 - 14;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
        const ratio = this.hp / this.maxHp;
        const hpColor = ratio > 0.5 ? '#00e676' : ratio > 0.25 ? '#ffd740' : '#ff1744';
        ctx.fillStyle = hpColor;
        ctx.fillRect(bx, by, barW * ratio, barH);
    }

    _drawLabel(ctx) {
        const label = this.isHuman ? `P${this.index + 1}` : `AI`;
        ctx.font = 'bold 9px Orbitron';
        ctx.textAlign = 'center';
        ctx.fillStyle = this.teamColor;
        ctx.fillText(label, this.x, this.y - this.h / 2 - 18);
    }

    _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    _darken(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.max(0, (num >> 16) - Math.round(255 * amount));
        const g = Math.max(0, ((num >> 8) & 0xff) - Math.round(255 * amount));
        const b = Math.max(0, (num & 0xff) - Math.round(255 * amount));
        return `rgb(${r},${g},${b})`;
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Tank, Bullet, PowerUp };
}
