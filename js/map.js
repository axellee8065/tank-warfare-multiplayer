// ============================================
// TANK WARFARE — Game Map
// ============================================

const MAP_DATA = [
    {
        name: 'ARENA',
        nameKo: '아레나',
        grid: [
            '################################',
            '#..............................#',
            '#..............................#',
            '#...##....xx....xx....##.......#',
            '#...##........................##',
            '#..........##....##............#',
            '#..............................#',
            '#..xx......................xx..#',
            '#..xx......##....##......xx...#',
            '#..........##....##...........#',
            '#..xx......................xx..#',
            '#..............................#',
            '#..........##....##............#',
            '#...##.......................##',
            '#...##....xx....xx....##.......#',
            '#..............................#',
            '#..............................#',
            '################################',
        ],
        spawns: {
            alpha: [[2, 2], [5, 1], [1, 5]],
            bravo: [[29, 15], [26, 16], [30, 12]]
        }
    },
    {
        name: 'FORTRESS',
        nameKo: '요새',
        grid: [
            '################################',
            '#..............................#',
            '#.####.......xxxx.......####..#',
            '#.#..#.......x..x.......#..#..#',
            '#.#..#.......xxxx.......#..#..#',
            '#.####.....................####.#',
            '#..............................#',
            '#......xx..............xx......#',
            '#......xx....####....xx.......#',
            '#.............####.............#',
            '#......xx..............xx......#',
            '#..............................#',
            '#.####.....................####.#',
            '#.#..#.......xxxx.......#..#..#',
            '#.#..#.......x..x.......#..#..#',
            '#.####.......xxxx.......####..#',
            '#..............................#',
            '################################',
        ],
        spawns: {
            alpha: [[2, 1], [1, 5], [5, 2]],
            bravo: [[29, 16], [30, 12], [26, 15]]
        }
    },
    {
        name: 'MAZE',
        nameKo: '미로',
        grid: [
            '################################',
            '#......#......#......#.........#',
            '#......#......#......#.........#',
            '#..##..#..##..#..##..#..##..##.#',
            '#......#......#......#.........#',
            '#..............................#',
            '####..####..........####..####.#',
            '#..............................#',
            '#..##......##....##......##....#',
            '#..........##....##............#',
            '#..##......##....##......##....#',
            '#..............................#',
            '####..####..........####..#####',
            '#..............................#',
            '#..##..#..##..#..##..#..##..##.#',
            '#......#......#......#.........#',
            '#......#......#......#.........#',
            '################################',
        ],
        spawns: {
            alpha: [[1, 1], [1, 4], [4, 1]],
            bravo: [[30, 16], [30, 13], [27, 16]]
        }
    }
];

class GameMap {
    constructor(mapIndex, canvasW, canvasH) {
        this.data = MAP_DATA[mapIndex];
        this.cols = CONFIG.MAP_COLS;
        this.rows = CONFIG.MAP_ROWS;
        this.tileW = canvasW / this.cols;
        this.tileH = canvasH / this.rows;
        this.walls = [];
        this.breakables = [];
        this._parse();
    }

    _parse() {
        this.walls = [];
        this.breakables = [];
        // Build O(1) lookup grid
        this._grid = [];
        for (let r = 0; r < this.rows; r++) {
            this._grid[r] = new Uint8Array(this.cols); // 0=empty, 1=wall, 2=breakable
            const row = this.data.grid[r] || '';
            for (let c = 0; c < this.cols; c++) {
                const ch = row[c] || '.';
                if (ch === '#') {
                    this.walls.push({ col: c, row: r, breakable: false });
                    this._grid[r][c] = 1;
                } else if (ch === 'x') {
                    this.breakables.push({ col: c, row: r, alive: true });
                    this._grid[r][c] = 2;
                }
            }
        }
    }

    isWallAt(px, py) {
        const c = Math.floor(px / this.tileW);
        const r = Math.floor(py / this.tileH);
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
        const v = this._grid[r][c];
        if (v === 1) return true;
        if (v === 2) {
            // Check if breakable is still alive
            return this.breakables.some(w => w.col === c && w.row === r && w.alive);
        }
        return false;
    }

    // Fast grid check for AI (col, row based)
    isBlockedCell(c, r) {
        if (c < 0 || c >= this.cols || r < 0 || r >= this.rows) return true;
        const v = this._grid[r][c];
        if (v === 1) return true;
        if (v === 2) return this.breakables.some(w => w.col === c && w.row === r && w.alive);
        return false;
    }

    breakWallAt(px, py) {
        const c = Math.floor(px / this.tileW);
        const r = Math.floor(py / this.tileH);
        const bw = this.breakables.find(w => w.col === c && w.row === r && w.alive);
        if (bw) { bw.alive = false; return true; }
        return false;
    }

    getSpawnPos(team, index) {
        // Alpha = left side, Bravo = right side, random row each time
        let minC, maxC, minR, maxR;
        if (team === 0) {
            // Alpha: left 1/3
            minC = 1; maxC = Math.floor(this.cols / 3);
            minR = 1; maxR = this.rows - 2;
        } else {
            // Bravo: right 1/3
            minC = this.cols - Math.floor(this.cols / 3); maxC = this.cols - 2;
            minR = 1; maxR = this.rows - 2;
        }

        // Try to find a random empty cell within the zone
        let attempts = 150;
        while (attempts-- > 0) {
            const c = minC + Math.floor(Math.random() * (maxC - minC + 1));
            const r = minR + Math.floor(Math.random() * (maxR - minR + 1));
            const px = (c + 0.5) * this.tileW;
            const py = (r + 0.5) * this.tileH;
            if (!this.isWallAt(px, py)) {
                return { x: px, y: py };
            }
        }

        // Fallback to fixed spawn data
        const key = team === 0 ? 'alpha' : 'bravo';
        const spawns = this.data.spawns[key];
        const sp = spawns[index % spawns.length];
        return {
            x: (sp[0] + 0.5) * this.tileW,
            y: (sp[1] + 0.5) * this.tileH
        };
    }

    getRandomEmptyPos() {
        let attempts = 200;
        while (attempts-- > 0) {
            const c = 2 + Math.floor(Math.random() * (this.cols - 4));
            const r = 2 + Math.floor(Math.random() * (this.rows - 4));
            const px = (c + 0.5) * this.tileW;
            const py = (r + 0.5) * this.tileH;
            if (!this.isWallAt(px, py)) return { x: px, y: py };
        }
        return { x: this.tileW * 16, y: this.tileH * 9 };
    }

    resolveCollision(tank) {
        const r = tank.getCollisionRadius();
        const minX = r, maxX = this.cols * this.tileW - r;
        const minY = r, maxY = this.rows * this.tileH - r;
        tank.x = Math.max(minX, Math.min(maxX, tank.x));
        tank.y = Math.max(minY, Math.min(maxY, tank.y));

        // Wall collision
        const allWalls = [...this.walls, ...this.breakables.filter(w => w.alive)];
        for (const w of allWalls) {
            const wx = w.col * this.tileW, wy = w.row * this.tileH;
            const ww = this.tileW, wh = this.tileH;
            const closestX = Math.max(wx, Math.min(wx + ww, tank.x));
            const closestY = Math.max(wy, Math.min(wy + wh, tank.y));
            const dx = tank.x - closestX, dy = tank.y - closestY;
            const dist = Math.hypot(dx, dy);
            if (dist < r && dist > 0) {
                const push = (r - dist) / dist;
                tank.x += dx * push;
                tank.y += dy * push;
            }
        }
    }

    draw(ctx) {
        // Floor
        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, this.cols * this.tileW, this.rows * this.tileH);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let c = 0; c <= this.cols; c++) {
            ctx.beginPath();
            ctx.moveTo(c * this.tileW, 0);
            ctx.lineTo(c * this.tileW, this.rows * this.tileH);
            ctx.stroke();
        }
        for (let r = 0; r <= this.rows; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * this.tileH);
            ctx.lineTo(this.cols * this.tileW, r * this.tileH);
            ctx.stroke();
        }

        // Walls
        for (const w of this.walls) {
            const x = w.col * this.tileW, y = w.row * this.tileH;
            // Wall body
            ctx.fillStyle = '#2d3548';
            ctx.fillRect(x, y, this.tileW, this.tileH);
            // Top highlight
            ctx.fillStyle = '#3a4560';
            ctx.fillRect(x, y, this.tileW, 2);
            ctx.fillRect(x, y, 2, this.tileH);
            // Bottom shadow
            ctx.fillStyle = '#1a1f2e';
            ctx.fillRect(x, y + this.tileH - 2, this.tileW, 2);
            ctx.fillRect(x + this.tileW - 2, y, 2, this.tileH);
        }

        // Breakable walls
        for (const w of this.breakables) {
            if (!w.alive) continue;
            const x = w.col * this.tileW, y = w.row * this.tileH;
            ctx.fillStyle = '#4a3a28';
            ctx.fillRect(x, y, this.tileW, this.tileH);
            ctx.strokeStyle = '#6b5438';
            ctx.lineWidth = 1;
            ctx.strokeRect(x + 1, y + 1, this.tileW - 2, this.tileH - 2);
            // Crack marks
            ctx.strokeStyle = '#3a2a18';
            ctx.beginPath();
            ctx.moveTo(x + this.tileW * 0.3, y);
            ctx.lineTo(x + this.tileW * 0.5, y + this.tileH * 0.5);
            ctx.lineTo(x + this.tileW * 0.7, y + this.tileH);
            ctx.stroke();
        }

        // Spawn area indicators
        const shimmer = Math.sin(Date.now() / 500) * 0.03 + 0.05;
        for (const key of ['alpha', 'bravo']) {
            const color = key === 'alpha' ? '0,229,255' : '255,23,68';
            const spawns = this.data.spawns[key];
            for (const sp of spawns) {
                const x = sp[0] * this.tileW, y = sp[1] * this.tileH;
                ctx.fillStyle = `rgba(${color},${shimmer})`;
                ctx.fillRect(x - this.tileW, y - this.tileH, this.tileW * 3, this.tileH * 3);
            }
        }
    }

    reset() {
        for (const b of this.breakables) b.alive = true;
    }
}
