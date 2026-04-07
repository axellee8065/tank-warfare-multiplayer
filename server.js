const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { createFortemClient } = require('@fortemlabs/sdk-js');
const crypto = require('crypto');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// 프론트엔드 정적 파일 서빙 (백엔드와 통합하여 단일 서비스로 배포)
app.use(express.static(__dirname));

const API_KEY = process.env.FORTEM_API_KEY;
const COLLECTION_ID = process.env.FORTEM_COLLECTION_ID;

let fortemClient = null;

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
        return res.status(400).json({ success: false, message: 'walletAddress와 amount가 필요합니다.' });
    }

    if (!fortemClient) {
        return res.status(500).json({ success: false, message: 'ForTem 서버가 준비되지 않았습니다.' });
    }

    try {
        // 인증 만료 대비 Re-auth (수명이 5분이므로 호출 시마다 토큰 재발급 권장)
        const getNonceRes = await fortemClient.auth.getNonce();
        await fortemClient.auth.getAccessToken(getNonceRes.nonce);

        const redeemCode = generateRedeemCode();
        
        console.log(`[Mint Request] 지갑: ${walletAddress}, 코인: ${amount}, 모드: ${gameType}`);

        // ForTem에 코인을 NFT 아이템 객체로 생성 (아이템의 quantity를 코인 수량으로 사용)
        const result = await fortemClient.items.create(COLLECTION_ID, {
            name: `탱크 코인 보상`,
            description: `${gameType} 모드에서 획득한 ${amount} 코인`,
            quantity: amount,
            redeemCode: redeemCode,
            recipientAddress: walletAddress,
            attributes: [
                { name: "Currency", value: "Coin" },
                { name: "Mode", value: gameType },
                { name: "Amount", value: amount.toString() }
            ]
        });

        res.json({ success: true, data: result.data, redeemCode });
    } catch (e) {
        console.error("[Mint Error]", e);
        res.status(500).json({ success: false, message: e.message || 'ForTem 민팅 실패' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 서버 시작됨 (포트: ${PORT})`);
});
