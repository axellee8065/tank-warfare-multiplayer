// ============================================
// TANK WARFARE — AI Controller (v3 Smart AI)
// BFS pathfinding, obstacle avoidance, flanking, prediction
// ============================================

const AI_DIFFICULTY = {
    easy:   { accuracy: 0.30, reactionTime: 0.9, aimTolerance: 0.7,  dodgeChance: 0.15, shootRange: 350, label: '하', labelEn: 'EASY' },
    medium: { accuracy: 0.60, reactionTime: 0.4, aimTolerance: 0.35, dodgeChance: 0.55, shootRange: 450, label: '중', labelEn: 'MEDIUM' },
    hard:   { accuracy: 0.92, reactionTime: 0.08, aimTolerance: 0.12, dodgeChance: 0.92, shootRange: 600, label: '상', labelEn: 'HARD' }
};

class AIController {
    constructor(difficulty = 'medium') {
        const diff = AI_DIFFICULTY[difficulty] || AI_DIFFICULTY.medium;
        Object.assign(this, diff);
        this.diffName = difficulty;

        // Targeting
        this.targetId = -1;
        this.retargetTimer = 0;

        // Movement
        this.stuckTimer = 0;
        this.lastPos = null;
        this.lastDist = Infinity;
        this.wanderAngle = Math.random() * Math.PI * 2;
        this.wanderTimer = 0;
        this.reverseTimer = 0;

        // Pathfinding
        this.path = [];
        this.pathTimer = 0;
        this.pathIdx = 0;

        // Dodge & strafe
        this.dodgeDir = 0;
        this.strafeDir = Math.random() > 0.5 ? 1 : -1;
        this.strafeTimer = 0;
        this.shootDelay = 0;
    }

    update(dt, myTank, enemies, bullets, gameMap) {
        const input = { up: false, down: false, left: false, right: false, shoot: false };
        if (!myTank.alive) return input;

        // Timers
        this.retargetTimer -= dt;
        this.wanderTimer -= dt;
        this.pathTimer -= dt;
        this.strafeTimer -= dt;
        this.reverseTimer -= dt;
        this.shootDelay = Math.max(0, this.shootDelay - dt);

        // ---- Stuck Detection ----
        if (this.lastPos) {
            const movedDist = Math.hypot(myTank.x - this.lastPos.x, myTank.y - this.lastPos.y);
            if (movedDist < 1.5) this.stuckTimer += dt;
            else this.stuckTimer = Math.max(0, this.stuckTimer - dt * 2);
        }
        this.lastPos = { x: myTank.x, y: myTank.y };

        // If stuck, try to unstick
        if (this.stuckTimer > 0.4) {
            return this._unstick(myTank, gameMap, input);
        }

        // If reversing, continue
        if (this.reverseTimer > 0) {
            input.down = true;
            const rd = this._angleDiff(myTank.angle, this.wanderAngle);
            if (Math.abs(rd) > 0.3) { input.left = rd < 0; input.right = rd > 0; }
            return input;
        }

        // ---- Find Enemies ----
        const aliveEnemies = enemies.filter(e => e.alive);
        if (aliveEnemies.length === 0) return this._patrol(myTank, gameMap, input);

        // ---- Pick Target ----
        if (this.retargetTimer <= 0 || !aliveEnemies.find(e => e.index === this.targetId)) {
            this._pickTarget(myTank, aliveEnemies);
        }
        const target = aliveEnemies.find(e => e.index === this.targetId);
        if (!target) return this._patrol(myTank, gameMap, input);

        const dx = target.x - myTank.x;
        const dy = target.y - myTank.y;
        const dist = Math.hypot(dx, dy);
        const angleToTarget = Math.atan2(dy, dx);
        const angleDiff = this._angleDiff(myTank.angle, angleToTarget);
        const hasLOS = this._hasLOS(myTank, target, gameMap);

        // ---- Dodge Bullets (highest priority) ----
        const dodgeResult = this._checkDodge(myTank, bullets);
        if (dodgeResult) {
            this._applyDodge(myTank, dodgeResult, input);
            // Still try to shoot while dodging
            if (hasLOS) this._tryShoot(angleDiff, dist, input);
            return input;
        }

        // ---- COMBAT: Has Line of Sight ----
        if (hasLOS) {
            this.path = []; // Clear path
            this._combat(myTank, target, dist, angleToTarget, angleDiff, gameMap, input);
        }
        // ---- No LOS: Navigate Around Obstacles ----
        else {
            this._navigate(dt, myTank, target, dist, angleToTarget, angleDiff, gameMap, input);
        }

        return input;
    }

    // =============== COMBAT (has LOS) ===============
    _combat(myTank, target, dist, angleToTarget, angleDiff, gameMap, input) {
        // Aim (with prediction for harder bots)
        let aimAngle = angleToTarget;
        if (this.accuracy > 0.5 && dist > 80) {
            aimAngle = this._predictAim(myTank, target, dist);
        }
        const aimDiff = this._angleDiff(myTank.angle, aimAngle);

        // Turn toward target
        if (Math.abs(aimDiff) > 0.08) {
            input.left = aimDiff < 0;
            input.right = aimDiff > 0;
        }

        // Distance-based movement
        if (dist > 200) {
            // Close in
            input.up = Math.abs(aimDiff) < Math.PI * 0.55;
        } else if (dist > 90) {
            // Strafe at medium range
            if (this.strafeTimer <= 0) {
                this.strafeDir *= -1;
                this.strafeTimer = 0.5 + Math.random() * 0.6;
            }
            // Circle strafe: offset aim angle by 20-40deg
            const strafeAngle = angleToTarget + this.strafeDir * (Math.PI * 0.25);
            const strafeDiff = this._angleDiff(myTank.angle, strafeAngle);
            if (!this._isWallAhead(myTank, strafeAngle, 50, gameMap)) {
                if (Math.abs(strafeDiff) > 0.2) {
                    input.left = strafeDiff < 0;
                    input.right = strafeDiff > 0;
                }
                input.up = true;
            } else {
                // Wall blocks strafe, just approach
                input.up = Math.abs(aimDiff) < Math.PI * 0.4;
            }
        } else {
            // Too close, back up
            input.down = true;
        }

        // Shoot
        this._tryShoot(aimDiff, dist, input);
    }

    // =============== NAVIGATION (no LOS) ===============
    _navigate(dt, myTank, target, dist, angleToTarget, angleDiff, gameMap, input) {
        // Recalculate path periodically
        if (this.pathTimer <= 0 || this.path.length === 0) {
            this.path = this._findPath(myTank, target, gameMap);
            this.pathIdx = 0;
            this.pathTimer = 0.6 + Math.random() * 0.4;
        }

        if (this.path.length > 0 && this.pathIdx < this.path.length) {
            const wp = this.path[this.pathIdx];
            const wpDist = Math.hypot(wp.x - myTank.x, wp.y - myTank.y);
            const wpAngle = Math.atan2(wp.y - myTank.y, wp.x - myTank.x);
            const wpDiff = this._angleDiff(myTank.angle, wpAngle);

            // Turn toward waypoint
            if (Math.abs(wpDiff) > 0.12) {
                input.left = wpDiff < 0;
                input.right = wpDiff > 0;
            }

            // Move forward only if roughly facing waypoint
            if (Math.abs(wpDiff) < Math.PI * 0.55) {
                input.up = true;
            }

            // Advance to next waypoint
            const reachDist = Math.max(gameMap.tileW * 0.6, 20);
            if (wpDist < reachDist) {
                this.pathIdx++;
            }

            // Wall avoidance overlay — check 3 directions
            this._wallAvoidance(myTank, gameMap, input, wpDiff);
        } else {
            // No path found — direct approach with wall avoidance
            if (Math.abs(angleDiff) > 0.15) {
                input.left = angleDiff < 0;
                input.right = angleDiff > 0;
            }
            input.up = Math.abs(angleDiff) < Math.PI * 0.5;
            this._wallAvoidance(myTank, gameMap, input, angleDiff);
        }

        // Opportunistic shooting toward target direction
        if (Math.abs(angleDiff) < this.aimTolerance * 1.8 && dist < this.shootRange) {
            this._tryShoot(angleDiff, dist, input);
        }
    }

    // =============== WALL AVOIDANCE ===============
    _wallAvoidance(myTank, gameMap, input, desiredDiff) {
        const checkDist = CONFIG.TANK_HEIGHT * 0.9;
        const angle = myTank.angle;

        const frontBlocked = this._isWallAhead(myTank, angle, checkDist, gameMap);

        if (!frontBlocked) return; // No wall ahead, proceed normally

        input.up = false; // Don't drive into wall

        // Check left and right of current heading
        const leftAngle = angle - Math.PI * 0.45;
        const rightAngle = angle + Math.PI * 0.45;
        const leftClear = !this._isWallAhead(myTank, leftAngle, checkDist * 0.8, gameMap);
        const rightClear = !this._isWallAhead(myTank, rightAngle, checkDist * 0.8, gameMap);

        if (leftClear && rightClear) {
            // Both clear: prefer the direction closer to target
            if (desiredDiff < 0) { input.left = true; input.right = false; }
            else { input.right = true; input.left = false; }
            input.up = true;
        } else if (leftClear) {
            input.left = true; input.right = false; input.up = true;
        } else if (rightClear) {
            input.right = true; input.left = false; input.up = true;
        } else {
            // Both blocked — reverse and turn
            input.down = true;
            input.left = desiredDiff < 0;
            input.right = desiredDiff >= 0;
        }
    }

    _isWallAhead(tank, angle, dist, gameMap) {
        // Check center + both sides of tank body
        const hw = CONFIG.TANK_WIDTH * 0.35;
        const cx = tank.x + Math.cos(angle) * dist;
        const cy = tank.y + Math.sin(angle) * dist;
        if (gameMap.isWallAt(cx, cy)) return true;
        // Left side of tank body
        const perpAngle = angle + Math.PI * 0.5;
        const lx = cx + Math.cos(perpAngle) * hw;
        const ly = cy + Math.sin(perpAngle) * hw;
        if (gameMap.isWallAt(lx, ly)) return true;
        // Right side of tank body
        const rx = cx - Math.cos(perpAngle) * hw;
        const ry = cy - Math.sin(perpAngle) * hw;
        if (gameMap.isWallAt(rx, ry)) return true;
        return false;
    }

    // =============== UNSTICK ===============
    _unstick(myTank, gameMap, input) {
        this.stuckTimer = 0;
        this.path = [];
        this.pathTimer = 0;

        // Try backing up and turning
        this.reverseTimer = 0.3 + Math.random() * 0.3;
        // Pick a random-ish escape angle
        const offsets = [Math.PI * 0.5, -Math.PI * 0.5, Math.PI, Math.PI * 0.75, -Math.PI * 0.75];
        const pick = offsets[Math.floor(Math.random() * offsets.length)];
        this.wanderAngle = myTank.angle + pick;

        input.down = true;
        return input;
    }

    // =============== PATROL ===============
    _patrol(myTank, gameMap, input) {
        if (this.wanderTimer <= 0) {
            this.wanderAngle = Math.random() * Math.PI * 2;
            this.wanderTimer = 1.5 + Math.random() * 2.5;
        }
        const wd = this._angleDiff(myTank.angle, this.wanderAngle);
        if (Math.abs(wd) > 0.15) { input.left = wd < 0; input.right = wd > 0; }
        input.up = Math.abs(wd) < Math.PI * 0.5;
        this._wallAvoidance(myTank, gameMap, input, wd);
        return input;
    }

    // =============== TARGET SELECTION ===============
    _pickTarget(myTank, enemies) {
        let best = null, bestScore = -Infinity;
        for (const e of enemies) {
            const d = Math.hypot(e.x - myTank.x, e.y - myTank.y);
            // Score: prefer close targets with low HP
            const score = 1000 - d + (CONFIG.TANK_HP - e.hp) * 3;
            if (score > bestScore) { bestScore = score; best = e; }
        }
        this.targetId = best ? best.index : -1;
        this.retargetTimer = this.reactionTime + Math.random() * 1.0;
    }

    // =============== DODGE ===============
    _checkDodge(myTank, bullets) {
        if (Math.random() > this.dodgeChance) return null;
        for (const b of bullets) {
            if (b.team === myTank.team) continue;
            const bdx = myTank.x - b.x, bdy = myTank.y - b.y;
            const bdist = Math.hypot(bdx, bdy);
            if (bdist < 150) {
                // Is bullet heading toward us?
                const dot = b.vx * bdx + b.vy * bdy;
                if (dot > 0) {
                    const cross = b.vx * bdy - b.vy * bdx;
                    return cross > 0 ? 1 : -1;
                }
            }
        }
        return null;
    }

    _applyDodge(myTank, dir, input) {
        const dodgeAngle = myTank.angle + dir * Math.PI * 0.5;
        const dd = this._angleDiff(myTank.angle, dodgeAngle);
        if (Math.abs(dd) > 0.2) { input.left = dd < 0; input.right = dd > 0; }
        input.up = true;
    }

    // =============== SHOOTING ===============
    _tryShoot(aimDiff, dist, input) {
        if (Math.abs(aimDiff) < this.aimTolerance && dist < this.shootRange && this.shootDelay <= 0) {
            if (Math.random() < this.accuracy) {
                input.shoot = true;
                this.shootDelay = this.reactionTime * 0.35 + Math.random() * 0.1;
            }
        }
    }

    _predictAim(myTank, target, dist) {
        const bulletTime = dist / CONFIG.BULLET_SPEED;
        const px = target.x + Math.cos(target.angle) * CONFIG.TANK_SPEED * bulletTime * 0.4;
        const py = target.y + Math.sin(target.angle) * CONFIG.TANK_SPEED * bulletTime * 0.4;
        return Math.atan2(py - myTank.y, px - myTank.x);
    }

    // =============== BFS PATHFINDING ===============
    _findPath(from, to, gameMap) {
        if (!gameMap) return [];

        const tw = gameMap.tileW, th = gameMap.tileH;
        const sc = Math.floor(from.x / tw), sr = Math.floor(from.y / th);
        const ec = Math.floor(to.x / tw), er = Math.floor(to.y / th);

        // Clamp
        const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        const sC = cl(sc, 0, gameMap.cols - 1), sR = cl(sr, 0, gameMap.rows - 1);
        const eC = cl(ec, 0, gameMap.cols - 1), eR = cl(er, 0, gameMap.rows - 1);

        if (sC === eC && sR === eR) return [];

        // BFS with flat array visited (fast)
        const cols = gameMap.cols, rows = gameMap.rows;
        const visited = new Uint8Array(cols * rows);
        const parentIdx = new Int16Array(cols * rows).fill(-1);
        const key = (c, r) => r * cols + c;

        const queue = [sC, sR]; // flat queue [c1, r1, c2, r2, ...]
        let head = 0;
        visited[key(sC, sR)] = 1;

        // 8-directional movement
        const dc = [0, 1, 0, -1, 1, 1, -1, -1];
        const dr = [-1, 0, 1, 0, -1, 1, 1, -1];

        let found = false;
        const maxIter = 800;
        let iter = 0;

        while (head < queue.length && iter++ < maxIter) {
            const cc = queue[head++];
            const cr = queue[head++];

            if (cc === eC && cr === eR) { found = true; break; }

            for (let d = 0; d < 8; d++) {
                const nc = cc + dc[d], nr = cr + dr[d];
                if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
                const nk = key(nc, nr);
                if (visited[nk]) continue;
                if (gameMap.isBlockedCell(nc, nr)) continue;

                // Diagonal: check adjacent cells to prevent corner-cutting
                if (d >= 4) {
                    if (gameMap.isBlockedCell(cc + dc[d], cr) ||
                        gameMap.isBlockedCell(cc, cr + dr[d])) continue;
                }

                visited[nk] = 1;
                parentIdx[nk] = key(cc, cr);
                queue.push(nc, nr);
            }
        }

        if (!found) return [];

        // Reconstruct
        const rawPath = [];
        let ck = key(eC, eR);
        const sk = key(sC, sR);
        let safety = 500;
        while (ck !== sk && parentIdx[ck] !== -1 && safety-- > 0) {
            const pr = Math.floor(ck / cols), pc = ck % cols;
            rawPath.unshift({ x: (pc + 0.5) * tw, y: (pr + 0.5) * th });
            ck = parentIdx[ck];
        }

        // Smooth path (skip waypoints that have direct LOS)
        return this._smoothPath(rawPath, gameMap);
    }

    _smoothPath(path, gameMap) {
        if (path.length <= 2) return path;
        const result = [path[0]];
        let cur = 0;
        while (cur < path.length - 1) {
            let far = cur + 1;
            for (let i = path.length - 1; i > cur + 1; i--) {
                if (this._hasLOSWide(path[cur], path[i], gameMap)) {
                    far = i;
                    break;
                }
            }
            result.push(path[far]);
            cur = far;
        }
        return result;
    }

    // =============== UTILITIES ===============
    _angleDiff(from, to) {
        let d = to - from;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    _hasLOS(from, to, gameMap) {
        if (!gameMap) return true;
        const d = Math.hypot(to.x - from.x, to.y - from.y);
        const steps = Math.max(6, Math.ceil(d / (gameMap.tileW * 0.4)));
        const sx = (to.x - from.x) / steps, sy = (to.y - from.y) / steps;
        for (let i = 1; i < steps; i++) {
            if (gameMap.isWallAt(from.x + sx * i, from.y + sy * i)) return false;
        }
        return true;
    }

    // LOS check with width (tank body can pass)
    _hasLOSWide(a, b, gameMap) {
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(4, Math.ceil(d / (gameMap.tileW * 0.5)));
        const sx = (b.x - a.x) / steps, sy = (b.y - a.y) / steps;
        for (let i = 1; i < steps; i++) {
            const px = a.x + sx * i, py = a.y + sy * i;
            if (gameMap.isWallAt(px, py)) return false;
        }
        return true;
    }
}
