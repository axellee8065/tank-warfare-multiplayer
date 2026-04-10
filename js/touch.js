// ============================================
// TANK WARFARE — Touch Controls
// ============================================

class TouchControls {
    constructor() {
        this.active = false;
        this.state = { up: false, down: false, left: false, right: false, shoot: false };
        this.container = document.getElementById('touch-controls');
        this.joyBase = document.getElementById('joy-base');
        this.joyKnob = document.getElementById('joy-knob');
        this.fireBtn = document.getElementById('fire-btn');
        this.joyActive = false;
        this.joyCenter = { x: 0, y: 0 };
        this.joyRadius = 45;
        this._bind();
    }

    show() {
        this.active = true;
        this.container.classList.remove('hidden');
    }

    hide() {
        this.active = false;
        this.container.classList.add('hidden');
        this.reset();
    }

    reset() {
        this.state = { up: false, down: false, left: false, right: false, shoot: false };
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
    }

    getState() { return this.state; }

    _bind() {
        // Joystick
        const joyArea = this.joyBase;
        const onJoyStart = (x, y) => {
            this.joyActive = true;
            const rect = joyArea.getBoundingClientRect();
            this.joyCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
            this._updateJoy(x, y);
        };
        const onJoyMove = (x, y) => {
            if (!this.joyActive) return;
            this._updateJoy(x, y);
        };
        const onJoyEnd = () => {
            this.joyActive = false;
            this.state.up = this.state.down = this.state.left = this.state.right = false;
            this.joyKnob.style.transform = 'translate(-50%,-50%)';
        };

        joyArea.addEventListener('touchstart', e => { e.preventDefault(); const t = e.touches[0]; onJoyStart(t.clientX, t.clientY); }, { passive: false });
        joyArea.addEventListener('touchmove', e => { e.preventDefault(); const t = e.touches[0]; onJoyMove(t.clientX, t.clientY); }, { passive: false });
        joyArea.addEventListener('touchend', e => { e.preventDefault(); onJoyEnd(); }, { passive: false });
        joyArea.addEventListener('touchcancel', e => { e.preventDefault(); onJoyEnd(); }, { passive: false });

        // Mouse fallback
        joyArea.addEventListener('mousedown', e => onJoyStart(e.clientX, e.clientY));
        window.addEventListener('mousemove', e => onJoyMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', () => onJoyEnd());

        // Fire button
        this.fireBtn.addEventListener('touchstart', e => { e.preventDefault(); this.state.shoot = true; this.fireBtn.classList.add('pressed'); }, { passive: false });
        this.fireBtn.addEventListener('touchend', e => { e.preventDefault(); this.state.shoot = false; this.fireBtn.classList.remove('pressed'); }, { passive: false });
        this.fireBtn.addEventListener('touchcancel', e => { e.preventDefault(); this.state.shoot = false; this.fireBtn.classList.remove('pressed'); }, { passive: false });
        this.fireBtn.addEventListener('mousedown', () => { this.state.shoot = true; this.fireBtn.classList.add('pressed'); });
        this.fireBtn.addEventListener('mouseup', () => { this.state.shoot = false; this.fireBtn.classList.remove('pressed'); });
    }

    _updateJoy(x, y) {
        let dx = x - this.joyCenter.x;
        let dy = y - this.joyCenter.y;
        const dist = Math.hypot(dx, dy);
        const maxDist = this.joyRadius;

        if (dist > maxDist) {
            dx = dx / dist * maxDist;
            dy = dy / dist * maxDist;
        }

        this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;

        const deadZone = 10;
        this.joyAngle = Math.atan2(dy, dx);
        this.joyMagnitude = dist > deadZone ? Math.min(dist / maxDist, 1.0) : 0;

        if (dist > deadZone) {
            // Soft overlap threshold for 8-way diagonal mapping
            const threshold = deadZone;
            this.state.up = dy < -threshold;
            this.state.down = dy > threshold;
            this.state.left = dx < -threshold;
            this.state.right = dx > threshold;
        } else {
            this.state.up = this.state.down = this.state.left = this.state.right = false;
        }
    }

    getJoystick() {
        return {
            active: this.joyActive,
            angle: this.joyAngle || 0,
            magnitude: this.joyMagnitude || 0
        };
    }

    static isTouchDevice() {
        return ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    }
}
