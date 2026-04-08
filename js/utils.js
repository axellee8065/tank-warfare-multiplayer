// ============================================
// TANK WARFARE — Utilities
// ============================================

class Vec2 {
    constructor(x = 0, y = 0) { this.x = x; this.y = y; }
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    mul(s) { return new Vec2(this.x * s, this.y * s); }
    len() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    norm() { const l = this.len(); return l > 0 ? this.mul(1 / l) : new Vec2(); }
    dot(v) { return this.x * v.x + this.y * v.y; }
    dist(v) { return this.sub(v).len(); }
    angle() { return Math.atan2(this.y, this.x); }
    rotate(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
    }
    clone() { return new Vec2(this.x, this.y); }
    set(x, y) { this.x = x; this.y = y; return this; }
}

// ---- AUDIO MANAGER ----
class AudioManager {
    constructor() {
        this.ctx = null;
        this.enabled = true;
        this.volume = 0.3;
    }
    init() {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch (e) { this.enabled = false; }
    }
    _play(freq, duration, type = 'square', vol = 0.3) {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(vol * this.volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
    _noise(duration, vol = 0.2) {
        if (!this.enabled || !this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        const bufferSize = this.ctx.sampleRate * duration;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        src.buffer = buffer;
        gain.gain.setValueAtTime(vol * this.volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        src.connect(gain);
        gain.connect(this.ctx.destination);
        src.start();
    }
    shoot() { this._noise(0.08, 0.4); this._play(800, 0.06, 'square', 0.2); }
    hit() { this._play(200, 0.15, 'sawtooth', 0.3); this._noise(0.1, 0.2); }
    explode() { this._noise(0.4, 0.5); this._play(60, 0.5, 'sawtooth', 0.4); }
    powerup() { this._play(600, 0.1, 'sine', 0.3); setTimeout(() => this._play(900, 0.15, 'sine', 0.3), 100); }
    roundStart() { this._play(440, 0.15, 'square', 0.2); setTimeout(() => this._play(660, 0.2, 'square', 0.25), 150); }
}

// ---- PARTICLE ----
class Particle {
    constructor(x, y, vx, vy, life, color, size) {
        this.x = x; this.y = y;
        this.vx = vx; this.vy = vy;
        this.life = this.maxLife = life;
        this.color = color;
        this.size = size;
    }
    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.vx *= 0.98;
        this.vy *= 0.98;
        this.life -= dt;
    }
    draw(ctx) {
        const alpha = Math.max(0, this.life / this.maxLife);
        const s = this.size * (0.5 + 0.5 * alpha);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, s, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
    }
    isDead() { return this.life <= 0; }
}

class ParticleSystem {
    constructor() { this.particles = []; }
    emit(x, y, count, opts = {}) {
        const { color = '#ffaa00', speed = 150, life = 0.5, size = 3, spread = Math.PI * 2, angle = 0 } = opts;
        for (let i = 0; i < count; i++) {
            const a = angle - spread / 2 + Math.random() * spread;
            const spd = speed * (0.3 + Math.random() * 0.7);
            const colors = Array.isArray(color) ? color[Math.floor(Math.random() * color.length)] : color;
            this.particles.push(new Particle(x, y, Math.cos(a) * spd, Math.sin(a) * spd, life * (0.5 + Math.random() * 0.5), colors, size * (0.5 + Math.random() * 0.5)));
        }
    }
    explosion(x, y, big = false) {
        const n = big ? 40 : 20;
        this.emit(x, y, n, { color: ['#ff6600', '#ffaa00', '#ffdd00', '#ff3300', '#ffffff'], speed: big ? 250 : 150, life: big ? 0.8 : 0.5, size: big ? 5 : 3 });
        this.emit(x, y, Math.floor(n / 2), { color: ['#666666', '#888888', '#444444'], speed: big ? 100 : 60, life: big ? 1.2 : 0.7, size: big ? 4 : 2 });
    }
    trail(x, y, color) {
        this.emit(x, y, 1, { color: [color, '#666'], speed: 20, life: 0.3, size: 2, spread: Math.PI * 2 });
    }
    update(dt) {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            this.particles[i].update(dt);
            if (this.particles[i].isDead()) this.particles.splice(i, 1);
        }
    }
    draw(ctx) { this.particles.forEach(p => p.draw(ctx)); }
    clear() { this.particles = []; }
}

// ---- CONFIG ----
const CONFIG = {
    TANK_SPEED: 150,
    TANK_ROT_SPEED: 3,
    TANK_HP: 100,
    TANK_WIDTH: 32,
    TANK_HEIGHT: 40,
    BULLET_SPEED: 350,
    BULLET_DAMAGE: 25,
    BULLET_RADIUS: 4,
    SHOOT_COOLDOWN: 0.5,
    POWERUP_INTERVAL: 8,
    ROUNDS_TO_WIN: 2,
    MAX_ROUNDS: 3,
    MAP_COLS: 32,
    MAP_ROWS: 18,
    PLAYER_COLORS: ['#00e5ff', '#4fc3f7', '#00bfa5', '#ff1744', '#ff5252', '#ff6e40'],
    TEAM_COLORS: { alpha: '#00e5ff', bravo: '#ff1744' },
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Vec2, AudioManager, ParticleSystem, CONFIG };
}
