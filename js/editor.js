// ============================================
// TANK WARFARE — Map Editor
// ============================================

class MapEditor {
    constructor() {
        this.canvas = document.getElementById('editor-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.cols = CONFIG.MAP_COLS;
        this.rows = CONFIG.MAP_ROWS;
        this.tileW = 0;
        this.tileH = 0;
        this.grid = [];
        this.tool = 'wall';
        this.painting = false;
        this.mapName = 'CUSTOM MAP';
        this.spawnsAlpha = [];
        this.spawnsBravo = [];
        this._initGrid();
        this._bindEvents();
    }

    _initGrid() {
        this.grid = [];
        for (let r = 0; r < this.rows; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.cols; c++) {
                this.grid[r][c] = (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) ? '#' : '.';
            }
        }
        this.spawnsAlpha = [[3, 4], [3, 9], [3, 14]];
        this.spawnsBravo = [[28, 4], [28, 9], [28, 14]];
    }

    resize() {
        const parent = this.canvas.parentElement;
        if (!parent) return;
        const maxW = parent.clientWidth * 0.95;
        const maxH = parent.clientHeight * 0.95;
        const ratio = this.cols / this.rows;
        let w, h;
        if (maxW / maxH > ratio) { h = maxH; w = h * ratio; }
        else { w = maxW; h = w / ratio; }
        this.canvas.width = Math.floor(w);
        this.canvas.height = Math.floor(h);
        this.tileW = this.canvas.width / this.cols;
        this.tileH = this.canvas.height / this.rows;
        this.draw();
    }

    _bindEvents() {
        // Canvas painting
        this.canvas.addEventListener('mousedown', (e) => { this.painting = true; this._paint(e); });
        this.canvas.addEventListener('mousemove', (e) => { if (this.painting) this._paint(e); });
        this.canvas.addEventListener('mouseup', () => this.painting = false);
        this.canvas.addEventListener('mouseleave', () => this.painting = false);

        this.canvas.addEventListener('touchstart', (e) => { e.preventDefault(); this.painting = true; this._paint(e.touches[0]); }, { passive: false });
        this.canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (this.painting) this._paint(e.touches[0]); }, { passive: false });
        this.canvas.addEventListener('touchend', () => this.painting = false);

        // Tool buttons (horizontal toolbar)
        document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
            btn.addEventListener('click', () => {
                this.tool = btn.dataset.tool;
                document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Clear
        document.getElementById('btn-editor-clear').addEventListener('click', () => {
            this._initGrid();
            this.draw();
        });
    }

    _paint(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * (this.canvas.width / rect.width);
        const my = (e.clientY - rect.top) * (this.canvas.height / rect.height);
        const c = Math.floor(mx / this.tileW);
        const r = Math.floor(my / this.tileH);

        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return;
        if (r === 0 || r === this.rows - 1 || c === 0 || c === this.cols - 1) return;

        switch (this.tool) {
            case 'wall':
                this.grid[r][c] = '#'; break;
            case 'breakable':
                this.grid[r][c] = 'x'; break;
            case 'eraser':
                this.grid[r][c] = '.';
                this.spawnsAlpha = this.spawnsAlpha.filter(s => !(s[0] === c && s[1] === r));
                this.spawnsBravo = this.spawnsBravo.filter(s => !(s[0] === c && s[1] === r));
                break;
            case 'spawn_a':
                this.grid[r][c] = '.';
                this.spawnsAlpha = this.spawnsAlpha.filter(s => !(s[0] === c && s[1] === r));
                if (this.spawnsAlpha.length >= 3) this.spawnsAlpha.shift();
                this.spawnsAlpha.push([c, r]);
                this.painting = false;
                break;
            case 'spawn_b':
                this.grid[r][c] = '.';
                this.spawnsBravo = this.spawnsBravo.filter(s => !(s[0] === c && s[1] === r));
                if (this.spawnsBravo.length >= 3) this.spawnsBravo.shift();
                this.spawnsBravo.push([c, r]);
                this.painting = false;
                break;
        }
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const tw = this.tileW, th = this.tileH;

        ctx.fillStyle = '#131825';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 0.5;
        for (let c = 0; c <= this.cols; c++) {
            ctx.beginPath(); ctx.moveTo(c * tw, 0); ctx.lineTo(c * tw, this.rows * th); ctx.stroke();
        }
        for (let r = 0; r <= this.rows; r++) {
            ctx.beginPath(); ctx.moveTo(0, r * th); ctx.lineTo(this.cols * tw, r * th); ctx.stroke();
        }

        // Tiles
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const ch = this.grid[r][c];
                const x = c * tw, y = r * th;
                if (ch === '#') {
                    ctx.fillStyle = '#2d3548';
                    ctx.fillRect(x, y, tw, th);
                    ctx.fillStyle = '#3a4560';
                    ctx.fillRect(x, y, tw, 1.5);
                    ctx.fillRect(x, y, 1.5, th);
                } else if (ch === 'x') {
                    ctx.fillStyle = '#4a3a28';
                    ctx.fillRect(x, y, tw, th);
                    ctx.strokeStyle = '#6b5438';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x + 1, y + 1, tw - 2, th - 2);
                }
            }
        }

        // Spawns
        const drawSpawn = (spawns, color, label) => {
            spawns.forEach((sp, i) => {
                const x = (sp[0] + 0.5) * tw;
                const y = (sp[1] + 0.5) * th;
                ctx.fillStyle = color + '33';
                ctx.fillRect(sp[0] * tw, sp[1] * th, tw, th);
                ctx.strokeStyle = color;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(x, y, Math.min(tw, th) * 0.3, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = color;
                ctx.font = `bold ${Math.max(8, tw * 0.28)}px Orbitron`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(label + (i + 1), x, y);
            });
        };
        drawSpawn(this.spawnsAlpha, '#00e5ff', 'A');
        drawSpawn(this.spawnsBravo, '#ff1744', 'B');
    }

    toMapData() {
        const gridStrings = [];
        for (let r = 0; r < this.rows; r++) {
            gridStrings.push(this.grid[r].join(''));
        }
        return {
            name: this.mapName,
            nameKo: '커스텀',
            grid: gridStrings,
            spawns: {
                alpha: this.spawnsAlpha.map(s => [...s]),
                bravo: this.spawnsBravo.map(s => [...s])
            },
            custom: true
        };
    }

    loadMapData(data) {
        this.mapName = data.name || 'CUSTOM MAP';
        document.getElementById('editor-map-name').value = this.mapName;
        this.spawnsAlpha = (data.spawns.alpha || []).map(s => [...s]);
        this.spawnsBravo = (data.spawns.bravo || []).map(s => [...s]);
        for (let r = 0; r < this.rows; r++) {
            const row = data.grid[r] || '';
            for (let c = 0; c < this.cols; c++) {
                this.grid[r][c] = row[c] || '.';
            }
        }
        this.draw();
    }

    static saveCustomMaps(maps) {
        localStorage.setItem('tankWarfare_customMaps', JSON.stringify(maps));
    }

    static loadCustomMaps() {
        try {
            const data = localStorage.getItem('tankWarfare_customMaps');
            return data ? JSON.parse(data) : [];
        } catch (e) { return []; }
    }
}
