// ============================================
// TANK WARFARE — Main (UI + Init)
// ============================================

(function () {
    // ---- State ----
    let currentScreen = 'title-screen';
    let selectedMode = '1v1';
    let selectedMap = 0;
    let selectedDifficulty = 'medium';
    let gameType = 'pvp';
    let playerSetup = [];
    let engine = null;
    let editor = null;
    let touchCtrl = null;
    let customMaps = MapEditor.loadCustomMaps();
    let allMaps = [];

    // ---- Shell Inventory ----
    const shellInv = new ShellInventory();
    let selectedLoadoutSlot = -1; // for loadout assignment

    // ---- Wallet ----
    const walletMgr = new SuiWalletManager();

    function updateWalletUI() {
        const connectBtn = document.getElementById('btn-wallet-connect');
        const connectedEl = document.getElementById('wallet-connected');
        const addrEl = document.getElementById('wallet-address');
        const guestBadge = document.getElementById('wallet-guest-badge');
        const tradeHint = document.querySelector('.hint-trade');

        if (walletMgr.connected) {
            connectBtn.classList.add('hidden');
            connectedEl.classList.remove('hidden');
            guestBadge.classList.add('hidden');
            addrEl.textContent = walletMgr.shortAddress(walletMgr.address);
            if (tradeHint) tradeHint.textContent = '💎 Wallet connected — Secondary trading active (Data Synced)';
            
            // Sync with backend database
            shellInv.setWallet(walletMgr.address);
        } else {
            connectBtn.classList.remove('hidden');
            connectedEl.classList.add('hidden');
            guestBadge.classList.remove('hidden');
            if (tradeHint) tradeHint.textContent = '💎 Connect wallet to enable secondary item trading';
            
            // Revert or disconnect DB session
            shellInv.setWallet(null);
        }
    }

    function showWalletInstallModal() {
        // Remove any existing modal
        const existing = document.querySelector('.wallet-modal-overlay');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.className = 'wallet-modal-overlay';
        overlay.innerHTML = `
            <div class="wallet-modal">
                <h3>💎 SLUSH WALLET</h3>
                <p>Sui blockchain wallet is required.<br>Please install Slush Wallet.</p>
                <div style="display:flex;justify-content:center;gap:0.5rem;flex-wrap:wrap">
                    <a href="https://chromewebstore.google.com/detail/slush-a-sui-wallet/opcgpfmipidbgpenhmajoajpbobppdil" target="_blank" class="wallet-modal-btn">
                        🔗 Install
                    </a>
                    <button class="wallet-modal-btn btn-ghost" id="btn-modal-close">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay || e.target.id === 'btn-modal-close') overlay.remove();
        });
        document.getElementById('btn-modal-close').addEventListener('click', () => overlay.remove());
    }

    async function onWalletConnect() {
        if (!walletMgr.hasWallet()) {
            showWalletInstallModal();
            return;
        }

        const result = await walletMgr.connect();
        if (result.success) {
            updateWalletUI();
        } else {
            if (result.error === 'no_wallet') showWalletInstallModal();
            else alert("Wallet connect error: " + (result.message || 'Unknown error'));
        }
    }

    async function onWalletDisconnect() {
        await walletMgr.disconnect();
        updateWalletUI();
    }

    walletMgr.on('connected', () => updateWalletUI());
    walletMgr.on('disconnected', () => updateWalletUI());
    walletMgr.on('walletDiscovered', () => updateWalletUI());

    // Init touch controls
    const isTouchDevice = TouchControls.isTouchDevice();

    // ---- BG Animation ----
    const bgCanvas = document.getElementById('bg-canvas');
    const bgCtx = bgCanvas.getContext('2d');
    let bgTanks = [];

    function initBg() {
        bgCanvas.width = bgCanvas.parentElement.clientWidth;
        bgCanvas.height = bgCanvas.parentElement.clientHeight;
        bgTanks = [];
        for (let i = 0; i < 8; i++) {
            bgTanks.push({
                x: Math.random() * bgCanvas.width,
                y: Math.random() * bgCanvas.height,
                angle: Math.random() * Math.PI * 2,
                speed: 12 + Math.random() * 20,
                size: 12 + Math.random() * 12,
                alpha: 0.03 + Math.random() * 0.05,
                color: Math.random() > 0.5 ? '#00e5ff' : '#ff1744',
                rotSpeed: (Math.random() - 0.5) * 0.4
            });
        }
    }

    function animateBg() {
        if (currentScreen !== 'title-screen') { requestAnimationFrame(animateBg); return; }
        bgCtx.fillStyle = '#080c14';
        bgCtx.fillRect(0, 0, bgCanvas.width, bgCanvas.height);

        // Grid
        bgCtx.strokeStyle = 'rgba(255,255,255,0.015)';
        bgCtx.lineWidth = 0.5;
        const gs = 40;
        for (let x = 0; x < bgCanvas.width; x += gs) {
            bgCtx.beginPath(); bgCtx.moveTo(x, 0); bgCtx.lineTo(x, bgCanvas.height); bgCtx.stroke();
        }
        for (let y = 0; y < bgCanvas.height; y += gs) {
            bgCtx.beginPath(); bgCtx.moveTo(0, y); bgCtx.lineTo(bgCanvas.width, y); bgCtx.stroke();
        }

        for (const t of bgTanks) {
            t.x += Math.cos(t.angle) * t.speed * 0.016;
            t.y += Math.sin(t.angle) * t.speed * 0.016;
            t.angle += t.rotSpeed * 0.016;
            if (t.x < -50) t.x = bgCanvas.width + 50;
            if (t.x > bgCanvas.width + 50) t.x = -50;
            if (t.y < -50) t.y = bgCanvas.height + 50;
            if (t.y > bgCanvas.height + 50) t.y = -50;
            bgCtx.save();
            bgCtx.translate(t.x, t.y);
            bgCtx.rotate(t.angle + Math.PI / 2);
            bgCtx.globalAlpha = t.alpha;
            bgCtx.fillStyle = t.color;
            bgCtx.fillRect(-t.size / 2, -t.size * 0.6, t.size, t.size * 1.2);
            bgCtx.fillRect(-2, -t.size * 0.6 - t.size * 0.35, 4, t.size * 0.35);
            bgCtx.globalAlpha = 1;
            bgCtx.restore();
        }
        requestAnimationFrame(animateBg);
    }

    // ---- Screen Navigation ----
    function showScreen(id) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(id).classList.add('active');
        currentScreen = id;
    }

    function rebuildAllMaps() {
        customMaps = MapEditor.loadCustomMaps();
        allMaps = [...MAP_DATA, ...customMaps];
    }

    // ---- Mode Selection ----
    function getPlayersPerTeam() {
        return selectedMode === '1v1' ? 1 : selectedMode === '2v2' ? 2 : 3;
    }

    function openModeScreen(type) {
        gameType = type;
        if (type === 'online') {
            // Bypass wallet for debug testing
            startMatchmaking('3v3');
            return;
        }

        const diffSection = document.getElementById('difficulty-section');
        const title = document.getElementById('mode-screen-title');
        if (type === 'vsbot') {
            diffSection.classList.remove('hidden');
            title.innerHTML = 'VS BOT <span class="title-ko">봇 대전</span>';
        } else {
            diffSection.classList.add('hidden');
            title.innerHTML = 'MODE <span class="title-ko">모드 선택</span>';
        }
        showScreen('mode-screen');
    }

    function startMatchmaking(mode) {
        if (!window.socket) {
            window.socket = io(window.location.origin);
            
            window.socket.on('queue_update', (d) => {
                document.getElementById('queue-status').textContent = `Queue Position: ${d.position}`;
            });
            
            window.socket.on('match_found', (d) => {
                console.log("MATCH FOUND!", d);
                playerSetup = d.setup;
                selectedMap = d.mapIndex;
                selectedMode = mode;
                
                showScreen('game-screen');
                const canvas = document.getElementById('game-canvas');
                if (engine) engine.stop();

                if (!touchCtrl) touchCtrl = new TouchControls();
                if (isTouchDevice) touchCtrl.show();
                else touchCtrl.hide();

                engine = new GameEngine(canvas);
                engine.shellInventory = shellInv;
                // Add online overrides
                engine.socket = window.socket;
                engine.roomId = d.roomId;
                
                engine.init(selectedMode, playerSetup, selectedMap, 'medium', 'online', touchCtrl);
                engine.onGameEnd = (winTeam, scores, tanks) => showResultScreen(winTeam, scores, tanks);
                // The engine won't start local tick loop, but rather binds to socket in engine.js
            });
        }
        
        window.socket.emit('join_queue', {
            walletAddress: walletMgr.address,
            loadout: shellInv.loadout,
            mode: mode
        });
        
        document.getElementById('queue-status').textContent = 'Joining Queue...';
        showScreen('matchmaking-screen');
    }

    document.getElementById('btn-cancel-queue').addEventListener('click', () => {
        if (window.socket) window.socket.disconnect();
        window.socket = null;
        showScreen('main-screen');
    });

    function selectMode(mode) {
        selectedMode = mode;
        document.querySelectorAll('.mode-card').forEach(c => c.classList.remove('selected'));
        const el = document.querySelector(`.mode-card[data-mode="${mode}"]`);
        if (el) el.classList.add('selected');
        if (gameType === 'vsbot') buildVsBotSetup();
        else buildPvpSetup();
        showScreen('setup-screen');
    }

    function buildPvpSetup() {
        playerSetup = [];
        const ppt = getPlayersPerTeam();
        let hc = 0;
        for (let i = 0; i < ppt * 2; i++) {
            const team = i < ppt ? 0 : 1;
            const isHuman = hc < 2;
            playerSetup.push({ team, isHuman, index: i });
            if (isHuman) hc++;
        }
        renderSlots();
    }

    function buildVsBotSetup() {
        playerSetup = [];
        const ppt = getPlayersPerTeam();
        for (let i = 0; i < ppt; i++) {
            playerSetup.push({ team: 0, isHuman: i === 0, index: i });
        }
        for (let i = 0; i < ppt; i++) {
            playerSetup.push({ team: 1, isHuman: false, index: ppt + i });
        }
        renderSlots();
    }

    function renderSlots() {
        const alphaSlots = document.getElementById('team-alpha-slots');
        const bravoSlots = document.getElementById('team-bravo-slots');
        alphaSlots.innerHTML = '';
        bravoSlots.innerHTML = '';

        for (let i = 0; i < playerSetup.length; i++) {
            const p = playerSetup[i];
            const slot = document.createElement('div');
            slot.className = 'player-slot';
            const label = p.isHuman ? `P${getHumanNumber(i)}` : 'BOT';
            slot.innerHTML = `
                <span class="slot-label">${label}</span>
                <button class="slot-toggle ${p.isHuman ? 'human' : 'ai'}" data-idx="${i}">
                    ${p.isHuman ? '👤 HUMAN' : '🤖 AI'}
                </button>
            `;
            if (p.team === 0) alphaSlots.appendChild(slot);
            else bravoSlots.appendChild(slot);
        }

        document.querySelectorAll('.slot-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.idx);
                const cur = playerSetup.filter(p => p.isHuman).length;
                if (!playerSetup[idx].isHuman && cur >= 2) return;
                playerSetup[idx].isHuman = !playerSetup[idx].isHuman;
                renderSlots();
            });
        });

        buildMapSelect();
    }

    function getHumanNumber(idx) {
        return playerSetup.filter((p, i) => p.isHuman && i <= idx).length;
    }

    function buildMapSelect() {
        rebuildAllMaps();
        const container = document.getElementById('map-cards');
        container.innerHTML = '';

        allMaps.forEach((m, i) => {
            const card = document.createElement('div');
            card.className = `map-card ${i === selectedMap ? 'selected' : ''} ${m.custom ? 'custom-map' : ''}`;
            card.innerHTML = `
                <div class="map-preview"><canvas id="map-preview-${i}" width="140" height="60"></canvas></div>
                <div class="map-card-name">${m.name} <span style="color:var(--text-muted);font-weight:400;font-size:0.5rem">${m.nameKo || ''}</span></div>
            `;
            card.addEventListener('click', () => {
                selectedMap = i;
                document.querySelectorAll('.map-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
            });
            container.appendChild(card);
            setTimeout(() => drawMiniMap(i), 50);
        });

        // Add new map card
        const nc = document.createElement('div');
        nc.className = 'map-card new-map-card';
        nc.innerHTML = `<div class="new-map-icon">➕</div><div class="new-map-label">EDITOR</div>`;
        nc.addEventListener('click', openEditor);
        container.appendChild(nc);
    }

    function drawMiniMap(idx) {
        const canvas = document.getElementById(`map-preview-${idx}`);
        if (!canvas || !allMaps[idx]) return;
        const ctx = canvas.getContext('2d');
        const data = allMaps[idx];
        const tw = canvas.width / CONFIG.MAP_COLS;
        const th = canvas.height / CONFIG.MAP_ROWS;

        ctx.fillStyle = '#1a1f2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        for (let r = 0; r < CONFIG.MAP_ROWS; r++) {
            const row = data.grid[r] || '';
            for (let c = 0; c < CONFIG.MAP_COLS; c++) {
                const ch = row[c] || '.';
                if (ch === '#') {
                    ctx.fillStyle = '#2d3548';
                    ctx.fillRect(c * tw, r * th, tw + 0.5, th + 0.5);
                } else if (ch === 'x') {
                    ctx.fillStyle = '#4a3a28';
                    ctx.fillRect(c * tw, r * th, tw + 0.5, th + 0.5);
                }
            }
        }

        for (const key of ['alpha', 'bravo']) {
            if (!data.spawns[key]) continue;
            ctx.fillStyle = key === 'alpha' ? 'rgba(0,229,255,0.6)' : 'rgba(255,23,68,0.6)';
            for (const sp of data.spawns[key]) {
                ctx.beginPath();
                ctx.arc((sp[0] + 0.5) * tw, (sp[1] + 0.5) * th, 2.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    // ---- Map Editor ----
    function openEditor() {
        showScreen('editor-screen');
        if (!editor) editor = new MapEditor();
        setTimeout(() => editor.resize(), 100);
    }

    // ---- Start Game ----
    function startGame() {
        rebuildAllMaps();
        if (selectedMap >= allMaps.length) selectedMap = 0;
        const mapData = allMaps[selectedMap];
        let mapIdx = selectedMap;
        if (selectedMap >= MAP_DATA.length) {
            mapIdx = MAP_DATA.length;
            MAP_DATA.push(mapData);
        }

        showScreen('game-screen');
        const canvas = document.getElementById('game-canvas');
        if (engine) engine.stop();

        // Touch controls
        if (!touchCtrl) touchCtrl = new TouchControls();
        if (isTouchDevice) {
            touchCtrl.show();
        } else {
            touchCtrl.hide();
        }

        engine = new GameEngine(canvas);
        engine.shellInventory = shellInv; // Link shell system
        engine.init(selectedMode, playerSetup, mapIdx, selectedDifficulty, gameType, touchCtrl);
        engine.onGameEnd = (winTeam, scores, tanks) => showResultScreen(winTeam, scores, tanks);
        engine.start();
    }

    function startGameWithEditorMap() {
        if (!editor) return;
        const mapData = editor.toMapData();
        if (mapData.spawns.alpha.length === 0 || mapData.spawns.bravo.length === 0) {
            alert('Place at least 1 spawn point for each team!');
            return;
        }
        const tempIdx = MAP_DATA.length;
        MAP_DATA.push(mapData);
        selectedMap = tempIdx;
        gameType = 'vsbot';
        selectedMode = '1v1';
        playerSetup = [
            { team: 0, isHuman: true, index: 0 },
            { team: 1, isHuman: false, index: 1 }
        ];

        showScreen('game-screen');
        const canvas = document.getElementById('game-canvas');
        if (engine) engine.stop();

        if (!touchCtrl) touchCtrl = new TouchControls();
        if (isTouchDevice) touchCtrl.show();
        else touchCtrl.hide();

        engine = new GameEngine(canvas);
        engine.shellInventory = shellInv;
        engine.init(selectedMode, playerSetup, tempIdx, selectedDifficulty, gameType, touchCtrl);
        engine.onGameEnd = (winTeam, scores, tanks) => {
            if (MAP_DATA.length > 3 && MAP_DATA[MAP_DATA.length - 1].custom) MAP_DATA.pop();
            showResultScreen(winTeam, scores, tanks);
        };
        engine.start();
    }

    function showResultScreen(winTeam, scores, tanks) {
        if (engine) { engine.stop(); engine = null; }
        if (touchCtrl) touchCtrl.hide();
        showScreen('result-screen');

        const isAlpha = winTeam === 'alpha';
        const wt = document.getElementById('winner-text');
        wt.textContent = isAlpha ? 'ALPHA WINS!' : 'BRAVO WINS!';
        wt.style.background = isAlpha
            ? 'linear-gradient(135deg, #00e5ff, #fff)' : 'linear-gradient(135deg, #ff1744, #fff)';
        wt.style.webkitBackgroundClip = 'text';
        wt.style.webkitTextFillColor = 'transparent';
        wt.style.backgroundClip = 'text';
        document.getElementById('winner-sub').textContent = isAlpha ? 'VICTORY!' : 'VICTORY!';
        document.getElementById('score-alpha').textContent = scores.alpha;
        document.getElementById('score-bravo').textContent = scores.bravo;

        let totalShots = 0, totalHits = 0, totalKills = 0;
        tanks.forEach(t => { totalShots += t.stats.shots; totalHits += t.stats.hits; totalKills += t.stats.kills; });
        const acc = totalShots > 0 ? Math.round((totalHits / totalShots) * 100) : 0;
        document.getElementById('stats-grid').innerHTML = `
            <div class="stat-card"><div class="stat-label">SHOTS</div><div class="stat-value">${totalShots}</div></div>
            <div class="stat-card"><div class="stat-label">HITS</div><div class="stat-value">${totalHits}</div></div>
            <div class="stat-card"><div class="stat-label">ACCURACY</div><div class="stat-value">${acc}%</div></div>
            <div class="stat-card"><div class="stat-label">KILLS</div><div class="stat-value">${totalKills}</div></div>
        `;

        if (walletMgr && walletMgr.connected) {
            const myTank = tanks.find(t => t.isHuman);
            const myTeam = myTank ? (myTank.team === 0 ? 'alpha' : 'bravo') : null;
            const isWin = myTeam === winTeam;
            const myKills = myTank ? myTank.stats.kills : 0;

            const API_URL = window.location.port === '8080' ? 'http://localhost:3000/api/stats/update' : '/api/stats/update';
            fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: walletMgr.address,
                    isWin: isWin,
                    kills: myKills
                })
            }).catch(e => console.error("Stats push failed:", e));
        }
    }

    // ---- Shop ----
    function updateCoinsDisplay() {
        const el1 = document.getElementById('title-coins');
        const el2 = document.getElementById('shop-coins');
        if (el1) el1.textContent = `\uD83E\uDE99 ${shellInv.coins}`;
        if (el2) el2.textContent = `\uD83E\uDE99 ${shellInv.coins}`;
    }

    function renderShop() {
        updateCoinsDisplay();
        
        const exportPanel = document.getElementById('fortem-export-panel');
        if (exportPanel) {
            if (walletMgr && walletMgr.connected) {
                exportPanel.style.display = 'flex';
                exportPanel.style.flexDirection = 'column';
                exportPanel.style.gap = '8px';
            } else {
                exportPanel.style.display = 'none';
            }
        }

        const grid = document.getElementById('shop-grid');
        grid.innerHTML = '';

        for (const id of SHELL_ORDER) {
            const st = SHELL_TYPES[id];
            const owned = shellInv.getCount(id);
            const ownedLabel = id === 'standard' ? '\u221E' : owned;
            const canBuy = st.price > 0 && shellInv.coins >= st.price;

            const card = document.createElement('div');
            card.className = `shell-card grade-${st.grade}`;
            card.dataset.shellId = id;
            card.innerHTML = `
                <div class="shell-icon">${st.icon}</div>
                <div class="shell-name">${st.nameEn}</div>
                <div class="shell-grade">${st.gradeLabel} ${st.name}</div>
                <div class="shell-desc">${st.desc}</div>
                <div class="shell-stats">DMG ${st.damage} | SPD ${st.speed} | R ${st.radius}</div>
                <div class="shell-owned">\uD83D\uDCE6 ${ownedLabel}</div>
                ${st.price > 0 ? `<button class="btn-buy" data-shell="${id}" ${canBuy ? '' : 'disabled'}>
                    \uD83E\uDE99 ${st.price} / x${st.packSize}
                </button>` : `<div style="color:#666;font-size:10px;font-family:Orbitron">INF</div>`}
            `;
            grid.appendChild(card);
        }

        // Buy buttons
        grid.querySelectorAll('.btn-buy').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const shellId = btn.dataset.shell;
                const result = shellInv.buyPack(shellId);
                if (result.success) {
                    btn.textContent = '\u2705';
                    btn.classList.add('bought');
                    const card = btn.closest('.shell-card');
                    card.classList.add('buy-flash');
                    setTimeout(() => {
                        card.classList.remove('buy-flash');
                        renderShop();
                        renderLoadout();
                    }, 500);
                }
            });
        });

        // Click card to assign to loadout
        grid.querySelectorAll('.shell-card').forEach(card => {
            card.addEventListener('click', () => {
                const shellId = card.dataset.shellId;
                if (shellId === 'standard') return; // can't reassign standard
                if (shellInv.getCount(shellId) <= 0) return;
                if (selectedLoadoutSlot > 0) {
                    shellInv.setSlot(selectedLoadoutSlot, shellId);
                    selectedLoadoutSlot = -1;
                    renderLoadout();
                }
            });
        });
    }

    function renderLoadout() {
        const container = document.getElementById('loadout-slots');
        container.innerHTML = '';
        const info = shellInv.getLoadoutInfo();

        for (let i = 0; i < info.length; i++) {
            const s = info[i];
            const slot = document.createElement('div');
            slot.className = `loadout-slot ${selectedLoadoutSlot === i ? 'active' : ''} ${i === 0 ? 'locked' : ''}`;
            slot.dataset.slot = i;

            if (s.empty) {
                slot.innerHTML = `
                    <span class="slot-num">${s.slot}</span>
                    <span class="slot-empty">+</span>
                `;
            } else {
                const count = s.id === 'standard' ? '\u221E' : shellInv.getCount(s.id);
                slot.innerHTML = `
                    <span class="slot-num">${s.slot}</span>
                    <span class="slot-icon">${s.icon}</span>
                    <span class="slot-count">${count}</span>
                `;
            }

            if (i > 0) {
                slot.addEventListener('click', () => {
                    if (selectedLoadoutSlot === i) {
                        // Deselect or clear slot
                        shellInv.setSlot(i, null);
                        selectedLoadoutSlot = -1;
                    } else {
                        selectedLoadoutSlot = i;
                    }
                    renderLoadout();
                });
            }

            container.appendChild(slot);
        }
    }

    function openShop() {
        renderShop();
        renderLoadout();
        showScreen('shop-screen');
    }

    // ---- Events ----
    document.getElementById('btn-wallet-connect').addEventListener('click', onWalletConnect);
    document.getElementById('btn-wallet-disconnect').addEventListener('click', onWalletDisconnect);

    document.getElementById('btn-stats-open').addEventListener('click', async () => {
        if (!walletMgr || !walletMgr.connected) return;
        showScreen('stats-screen');
        try {
            const API_URL = window.location.port === '8080' ? 'http://localhost:3000/api/stats/' + walletMgr.address : '/api/stats/' + walletMgr.address;
            const res = await fetch(API_URL);
            const data = await res.json();
            if (data.success) {
                const s = data.stats;
                document.getElementById('stat-matches').textContent = s.total_matches;
                document.getElementById('stat-wins').textContent = s.total_wins;
                document.getElementById('stat-kills').textContent = s.total_kills;
                const winRate = s.total_matches > 0 ? Math.round((s.total_wins / s.total_matches) * 100) : 0;
                document.getElementById('stat-winrate').textContent = winRate + '%';
            }
        } catch(e) { console.error(e); }
    });

    document.getElementById('btn-stats-close').addEventListener('click', () => {
        showScreen('title-screen');
    });

    document.getElementById('btn-multiplayer').addEventListener('click', () => openModeScreen('online'));
    document.getElementById('btn-pvp').addEventListener('click', () => openModeScreen('pvp'));
    document.getElementById('btn-vsbot').addEventListener('click', () => openModeScreen('vsbot'));
    document.getElementById('btn-editor-open').addEventListener('click', openEditor);
    document.getElementById('btn-shop-open').addEventListener('click', openShop);
    document.getElementById('btn-shop-close').addEventListener('click', () => {
        showScreen('title-screen');
        updateCoinsDisplay();
    });
    
    // Listen for inventory updates from server sync
    window.addEventListener('inventory-updated', () => {
        updateCoinsDisplay();
        if (currentScreen === 'shop-screen') {
            renderLoadout();
        }
    });

    document.getElementById('btn-back-mode').addEventListener('click', () => showScreen('title-screen'));
    document.getElementById('btn-back-setup').addEventListener('click', () => showScreen('mode-screen'));

    document.querySelectorAll('.mode-card').forEach(card => {
        card.addEventListener('click', () => selectMode(card.dataset.mode));
    });

    document.querySelectorAll('.diff-card').forEach(card => {
        card.addEventListener('click', () => {
            selectedDifficulty = card.dataset.diff;
            document.querySelectorAll('.diff-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
        });
    });

    document.getElementById('btn-battle').addEventListener('click', startGame);

    document.getElementById('btn-resume').addEventListener('click', () => { if (engine) engine.togglePause(); });
    document.getElementById('btn-quit').addEventListener('click', () => {
        if (engine) { engine.stop(); engine = null; }
        if (touchCtrl) touchCtrl.hide();
        document.getElementById('pause-overlay').classList.add('hidden');
        showScreen('title-screen');
    });

    document.getElementById('btn-rematch').addEventListener('click', startGame);
    document.getElementById('btn-menu').addEventListener('click', () => {
        if (engine) { engine.stop(); engine = null; }
        showScreen('title-screen');
    });

    // Editor
    document.getElementById('btn-editor-back').addEventListener('click', () => showScreen('title-screen'));
    document.getElementById('btn-editor-save').addEventListener('click', () => {
        if (!editor) return;
        const name = document.getElementById('editor-map-name').value.trim() || 'CUSTOM MAP';
        editor.mapName = name;
        const mapData = editor.toMapData();
        if (mapData.spawns.alpha.length === 0 || mapData.spawns.bravo.length === 0) {
            alert('Place spawn points for both teams!');
            return;
        }
        customMaps.push(mapData);
        MapEditor.saveCustomMaps(customMaps);
        alert(`"${name}" saved!`);
    });
    document.getElementById('btn-editor-play').addEventListener('click', startGameWithEditorMap);

    // Prevent space on menus
    document.addEventListener('keydown', (e) => {
        if (e.code === 'Space' && currentScreen !== 'game-screen') e.preventDefault();
    });

    // Resize
    window.addEventListener('resize', () => {
        if (currentScreen === 'title-screen') {
            bgCanvas.width = bgCanvas.parentElement.clientWidth;
            bgCanvas.height = bgCanvas.parentElement.clientHeight;
        }
        if (engine) engine.resize();
        if (editor && currentScreen === 'editor-screen') editor.resize();
    });

    // Fortem Export
    document.getElementById('btn-export-fortem')?.addEventListener('click', async () => {
        if (!walletMgr || !walletMgr.connected) {
            alert('Please connect wallet first!');
            return;
        }
        const amtInput = document.getElementById('export-amount');
        const statusDiv = document.getElementById('export-status');
        const amount = parseInt(amtInput.value, 10);
        
        if (isNaN(amount) || amount <= 0) {
            alert('Please enter a valid amount.');
            return;
        }
        if (shellInv.coins < amount) {
            alert('Not enough coins.');
            return;
        }

        const btn = document.getElementById('btn-export-fortem');
        btn.disabled = true;
        btn.textContent = 'Sending...';
        statusDiv.textContent = 'Requesting ForTem NFT Mint...';
        statusDiv.style.color = '#ffaa00';

        try {
            // Use current URL origin since the frontend and backend are served together
            const API_URL = window.location.port === '8080' ? 'http://localhost:3000/api/fortem/mint' : '/api/fortem/mint';
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    walletAddress: walletMgr.address,
                    amount: amount,
                    gameType: gameType || 'unknown_mode'
                })
            });

            const data = await res.json();
            if (data.success) {
                shellInv.coins -= amount;
                shellInv.save();
                updateCoinsDisplay();
                statusDiv.textContent = `✅ Export success! (Redeem Code: ${data.redeemCode})`;
                statusDiv.style.color = '#00e676';
                amtInput.value = '';
            } else {
                throw new Error(data.message || 'Server error');
            }
        } catch (e) {
            console.error(e);
            statusDiv.textContent = `❌ Export failed: ${e.message}`;
            statusDiv.style.color = '#ff1744';
        } finally {
            btn.disabled = false;
            btn.textContent = 'Mint (Export)';
        }
    });

    // ---- Init ----
    initBg();
    animateBg();
    updateWalletUI();
    updateCoinsDisplay();
    // Delayed check for auto-reconnecting wallet
    setTimeout(() => updateWalletUI(), 1000);
})();
