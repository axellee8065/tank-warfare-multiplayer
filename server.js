const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { createFortemClient } = require('@fortemlabs/sdk-js');
const { Pool } = require('pg');
const crypto = require('crypto');
const path = require('path');
const { ServerEngine } = require('./server_engine.js');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(cors());
app.use(express.json());

// 프론트엔드 정적 파일 서빙 (백엔드와 통합하여 단일 서비스로 배포)
app.use(express.static(__dirname));

const API_KEY = process.env.FORTEM_API_KEY;
const COLLECTION_ID = process.env.FORTEM_COLLECTION_ID;

let fortemClient = null;

// ---- Database Setup ----
let pool = null;
if (process.env.DATABASE_URL) {
    console.log("DB 연동 중...");
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
    });

    pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            wallet_address VARCHAR(255) PRIMARY KEY,
            coins INT DEFAULT 500,
            shells JSONB DEFAULT '{}',
            loadout JSONB DEFAULT '["standard", null, null, null, null]',
            total_wins INT DEFAULT 0,
            total_kills INT DEFAULT 0,
            total_matches INT DEFAULT 0
        )
    `).then(() => console.log("DB 테이블 'users' 초기화 성공!"))
      .catch(e => console.error("DB 초기화 실패:", e));
} else {
    console.warn("⚠️ DATABASE_URL이 설정되지 않아, DB 기능이 비활성화됩니다.");
}

// ForTem 클라이언트 초기화 및 인증
async function initFortem() {
    try {
        console.log("ForTem API 초기화 중...");
        fortemClient = createFortemClient({
            apiKey: API_KEY,
            network: 'testnet'
        });
        const getNonceRes = await fortemClient.auth.getNonce();
        await fortemClient.auth.getAccessToken(getNonceRes.nonce);
        console.log('ForTem API 인증 완료!');
    } catch (e) {
        console.error("ForTem 초기화 실패:", e);
    }
}
initFortem();

function generateRedeemCode() {
    const bytes = crypto.randomBytes(8);
    const hex = bytes.toString('hex');
    return `${hex.slice(0,4)}-${hex.slice(4,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}`;
}

// 코인 획득 시 NFT로 민팅하는 API
app.post('/api/fortem/mint', async (req, res) => {
    const { walletAddress, amount, gameType, mode } = req.body;
    
    if (!walletAddress || !amount) {
        return res.status(400).json({ success: false, message: 'walletAddress and amount are required.' });
    }

    if (!fortemClient) {
        return res.status(500).json({ success: false, message: 'ForTem server is not ready.' });
    }

    try {
        // 인증 만료 대비 Re-auth (수명이 5분이므로 호출 시마다 토큰 재발급 권장)
        const getNonceRes = await fortemClient.auth.getNonce();
        await fortemClient.auth.getAccessToken(getNonceRes.nonce);

        const redeemCode = generateRedeemCode();
        
        console.log(`[Mint Request] 지갑: ${walletAddress}, 코인: ${amount}, 모드: ${gameType}`);

        // ForTem에 코인을 NFT 아이템 객체로 생성 (아이템의 quantity를 코인 수량으로 사용)
        const result = await fortemClient.items.create(COLLECTION_ID, {
            name: `Tank Coin Reward`,
            description: `${amount} Coins acquired in ${gameType} mode`,
            quantity: amount,
            redeemCode: redeemCode,
            recipientAddress: walletAddress,
            itemImage: "Qma6rjFA91qfM7tke1JcKbyHwNvUxdvC61fbFpi6Ke7TrR",
            attributes: [
                { name: "Currency", value: "Coin" },
                { name: "Mode", value: gameType },
                { name: "Amount", value: amount.toString() }
            ]
        });

        res.json({ success: true, data: result.data, redeemCode });
    } catch (e) {
        console.error("[Mint Error]", e);
        let message = e.message || 'ForTem minting failed';
        if (message.includes('Recipient user is not a ForTem user')) {
            message = 'Wallet not registered on ForTem Testnet. Please log in at https://testnet.fortem.gg first!';
        }
        res.status(500).json({ success: false, message });
    }
});

// ==== INVENTORY API ====

// 인벤토리 조회
app.get('/api/inventory/:wallet', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB not connected' });
    try {
        const result = await pool.query('SELECT * FROM users WHERE wallet_address = $1', [req.params.wallet]);
        if (result.rows.length > 0) {
            res.json(result.rows[0]);
        } else {
            res.json({ coins: null, shells: null, loadout: null }); // 신규 유저
        }
    } catch (e) {
        console.error("DB Fetch Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// 인벤토리 저장/업데이트
app.post('/api/inventory/:wallet/save', async (req, res) => {
    if (!pool) return res.status(503).json({ error: 'DB not connected' });
    const { coins, shells, loadout } = req.body;
    try {
        await pool.query(`
            INSERT INTO users (wallet_address, coins, shells, loadout)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (wallet_address) DO UPDATE 
            SET coins = EXCLUDED.coins,
                shells = EXCLUDED.shells,
                loadout = EXCLUDED.loadout
        `, [
            req.params.wallet,
            coins !== undefined ? coins : 500,
            JSON.stringify(shells || {}),
            JSON.stringify(loadout || ['standard', null, null, null, null])
        ]);
        res.json({ success: true });
    } catch (e) {
        console.error("DB Save Error:", e);
        res.status(500).json({ error: e.message });
    }
});

// ==== STATS API ====
app.get('/api/stats/:wallet', async (req, res) => {
    const { wallet } = req.params;
    if (!pool) return res.status(500).json({ success: false, message: 'DB Disconnected' });
    
    try {
        const result = await pool.query(
            `SELECT coins, total_wins, total_kills, total_matches FROM users WHERE wallet_address = $1`,
            [wallet]
        );
        if (result.rows.length === 0) {
            return res.json({ success: true, stats: { coins: 500, total_wins: 0, total_kills: 0, total_matches: 0 }});
        }
        res.json({ success: true, stats: result.rows[0] });
    } catch (e) {
        console.error("Stats Fetch Error:", e);
        res.status(500).json({ success: false });
    }
});

app.post('/api/stats/update', async (req, res) => {
    const { walletAddress, isWin, kills } = req.body;
    if (!pool || !walletAddress) return res.status(400).json({ success: false });

    try {
        await pool.query(
            `UPDATE users 
             SET total_matches = total_matches + 1,
                 total_wins = total_wins + $1,
                 total_kills = total_kills + $2
             WHERE wallet_address = $3`,
            [isWin ? 1 : 0, kills || 0, walletAddress]
        );
        res.json({ success: true });
    } catch (e) {
        console.error("Stats Update Error:", e);
        res.status(500).json({ success: false });
    }
});

// ==== MULTIPLAYER LOBBY & MATCMAKING ====
let lobbies = []; // Available waiting rooms
let activeRooms = {}; // Running game rooms

function getPlayersCount(mode) {
    if (mode === '1v1') return 2;
    if (mode === '2v2') return 4;
    return 6; // 3v3 default
}

function broadcastLobbySync(lobby) {
    const syncData = {
        id: lobby.id,
        mode: lobby.mode,
        host: lobby.host,
        mapIndex: lobby.mapIndex,
        players: lobby.players.map(p => ({
            id: p.id,
            walletAddress: p.walletAddress,
            ready: p.ready
        }))
    };
    io.to(lobby.id).emit('lobby_sync', syncData);
}

function handleLeaveLobby(socket) {
    if (!socket.lobbyId) return;
    const lobby = lobbies.find(l => l.id === socket.lobbyId);
    if (lobby) {
        lobby.players = lobby.players.filter(p => p.id !== socket.id);
        socket.leave(lobby.id);
        socket.lobbyId = null;
        
        if (lobby.players.length === 0) {
            lobbies = lobbies.filter(l => l.id !== lobby.id);
        } else {
            if (lobby.host === socket.id) {
                lobby.host = lobby.players[0].id;
            }
            broadcastLobbySync(lobby);
        }
    }
}

function createMatchFromLobby(lobby) {
    const mode = lobby.mode;
    const roomId = lobby.id;
    
    let setup = [];
    const maxPlayers = getPlayersCount(mode);
    const ppt = maxPlayers / 2;
    
    let alphaCount = 0;
    let bravoCount = 0;
    
    lobby.players.forEach(p => {
        const team = (alphaCount <= bravoCount && alphaCount < ppt) ? 0 : 1;
        if (team === 0) alphaCount++; else bravoCount++;
        setup.push({
            id: p.id,
            team: team,
            isHuman: true,
            loadout: p.loadout
        });
    });
    
    while (setup.length < maxPlayers) {
        const team = (alphaCount <= bravoCount && alphaCount < ppt) ? 0 : 1;
        if (team === 0) alphaCount++; else bravoCount++;
        setup.push({ id: 'bot_' + setup.length, team: team, isHuman: false });
    }
    
    lobbies = lobbies.filter(l => l.id !== lobby.id);
    
    const engine = new ServerEngine(roomId, io, mode);
    activeRooms[roomId] = engine;
    
    io.to(roomId).emit('match_found', { roomId, setup, mapIndex: lobby.mapIndex });
    
    setTimeout(() => {
        engine.init(setup, lobby.mapIndex);
    }, 2000);
}

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);

    socket.on('join_lobby', (data) => {
        console.log(`Player ${socket.id} joining lobby for ${data.mode}`);
        
        let lobby = lobbies.find(l => l.mode === data.mode && l.players.length < getPlayersCount(data.mode));
        
        if (!lobby) {
            lobby = {
                id: 'lobby_' + crypto.randomUUID(),
                mode: data.mode,
                host: socket.id,
                players: [],
                mapIndex: 0
            };
            lobbies.push(lobby);
        }

        lobby.players.push({
            id: socket.id,
            socket,
            walletAddress: data.walletAddress,
            loadout: data.loadout,
            ready: false
        });
        
        socket.join(lobby.id);
        socket.lobbyId = lobby.id;

        broadcastLobbySync(lobby);
    });
    
    socket.on('leave_lobby', () => {
        handleLeaveLobby(socket);
    });

    socket.on('toggle_ready', (data) => {
        if (!socket.lobbyId) return;
        const lobby = lobbies.find(l => l.id === socket.lobbyId);
        if (lobby) {
            const player = lobby.players.find(p => p.id === socket.id);
            if (player) {
                player.ready = data.ready;
                broadcastLobbySync(lobby);
            }
        }
    });

    socket.on('select_map', (data) => {
        if (!socket.lobbyId) return;
        const lobby = lobbies.find(l => l.id === socket.lobbyId);
        if (lobby && lobby.host === socket.id) {
            lobby.mapIndex = data.mapIndex;
            broadcastLobbySync(lobby);
        }
    });

    socket.on('start_match', () => {
        if (!socket.lobbyId) return;
        const lobby = lobbies.find(l => l.id === socket.lobbyId);
        if (lobby && lobby.host === socket.id) {
            const allReady = lobby.players.every(p => p.id === lobby.host || p.ready);
            if (allReady) {
                createMatchFromLobby(lobby);
            }
        }
    });

    socket.on('player_input', (data) => {
        const { roomId, input } = data;
        const room = activeRooms[roomId];
        if (room) {
            room.processInput(socket.id, input);
        }
    });

    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        handleLeaveLobby(socket);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
