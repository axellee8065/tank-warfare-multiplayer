// ============================================
// TANK WARFARE — Shell System & Economy
// ============================================

const SHELL_TYPES = {
    standard: {
        id: 'standard',
        name: '기본탄',
        nameEn: 'STANDARD',
        icon: '💛',
        color: '#ffdd00',
        glowColor: '#ffaa00',
        price: 0,
        packSize: 0,
        damage: 25,
        speed: 350,
        radius: 4,
        life: 3,
        grade: 'free',
        gradeLabel: '🆓',
        desc: '기본 포탄',
        // Effects
        explosive: false,
        piercing: false,
        bounce: 0,
        dot: null
    },
    explosive: {
        id: 'explosive',
        name: '폭발탄',
        nameEn: 'EXPLOSIVE',
        icon: '🔴',
        color: '#ff4444',
        glowColor: '#ff0000',
        price: 30,
        packSize: 5,
        damage: 15,
        speed: 300,
        radius: 5,
        life: 2.5,
        grade: 'common',
        gradeLabel: '⭐',
        desc: '착탄 시 범위 폭발 (반경 45px)',
        explosive: true,
        splashRadius: 45,
        splashDamage: 12,
        piercing: false,
        bounce: 0,
        dot: null
    },
    piercing: {
        id: 'piercing',
        name: '관통탄',
        nameEn: 'PIERCING',
        icon: '🔵',
        color: '#4fc3f7',
        glowColor: '#0288d1',
        price: 40,
        packSize: 5,
        damage: 30,
        speed: 420,
        radius: 3,
        life: 2,
        grade: 'common',
        gradeLabel: '⭐',
        desc: '파괴벽 관통 + 높은 데미지',
        explosive: false,
        piercing: true,
        bounce: 0,
        dot: null
    },
    ricochet: {
        id: 'ricochet',
        name: '바운스탄',
        nameEn: 'RICOCHET',
        icon: '💜',
        color: '#ce93d8',
        glowColor: '#ab47bc',
        price: 60,
        packSize: 3,
        damage: 20,
        speed: 380,
        radius: 4,
        life: 4,
        grade: 'rare',
        gradeLabel: '⭐⭐',
        desc: '벽에서 1회 반사',
        explosive: false,
        piercing: false,
        bounce: 1,
        dot: null
    },
    venom: {
        id: 'venom',
        name: '독탄',
        nameEn: 'VENOM',
        icon: '🟢',
        color: '#69f0ae',
        glowColor: '#00c853',
        price: 50,
        packSize: 3,
        damage: 10,
        speed: 330,
        radius: 4,
        life: 2.5,
        grade: 'rare',
        gradeLabel: '⭐⭐',
        desc: '독 효과 3초 (초당 8 데미지)',
        explosive: false,
        piercing: false,
        bounce: 0,
        dot: { duration: 3, dps: 8, color: '#69f0ae' }
    }
};

const SHELL_ORDER = ['standard', 'explosive', 'piercing', 'ricochet', 'venom'];

// ---- Coin Rewards ----
const COIN_REWARDS = {
    vsbot: { kill: 5, roundWin: 5, gameWin: 10 },
    pvp: { kill: 5, roundWin: 10, gameWin: 20 },
    startingCoins: 500
};

function getRewardParams(gameType) {
    if (gameType === 'vsbot') return COIN_REWARDS.vsbot;
    return COIN_REWARDS.pvp; // Includes 1v1, 2v2, 3v3 pvp modes
}

// ---- Shell Inventory Manager ----
class ShellInventory {
    constructor() {
        this.walletAddress = null;
        this.isSyncing = false;
        this._load();
    }

    _load() {
        try {
            const saved = localStorage.getItem('tankWarfare_inventory');
            if (saved) {
                const data = JSON.parse(saved);
                this.coins = data.coins ?? COIN_REWARDS.startingCoins;
                this.shells = data.shells ?? {};
                this.loadout = data.loadout ?? ['standard', null, null, null, null];
            } else {
                this._defaults();
            }
        } catch {
            this._defaults();
        }
        // Ensure standard is always slot 1
        this.loadout[0] = 'standard';
    }

    _defaults() {
        this.coins = COIN_REWARDS.startingCoins;
        this.shells = {};  // { explosive: 10, piercing: 5, ... }
        this.loadout = ['standard', null, null, null, null];
    }

    save() {
        localStorage.setItem('tankWarfare_inventory', JSON.stringify({
            coins: this.coins,
            shells: this.shells,
            loadout: this.loadout
        }));
        this.pushToServer();
    }

    // Set wallet and sync from DB
    async setWallet(address) {
        if (this.walletAddress === address) return;
        this.walletAddress = address;
        if (!address) return;
        
        await this.syncWithServer();
    }

    async syncWithServer() {
        if (!this.walletAddress) return;
        this.isSyncing = true;
        try {
            const API_URL = window.location.port === '8080' ? 'http://localhost:3000' : '';
            const res = await fetch(`${API_URL}/api/inventory/${this.walletAddress}`);
            const data = await res.json();
            
            if (data && data.coins !== null) {
                // Load from server
                this.coins = data.coins;
                this.shells = data.shells || {};
                this.loadout = data.loadout || ['standard', null, null, null, null];
                this.loadout[0] = 'standard';
                // Update local storage too
                localStorage.setItem('tankWarfare_inventory', JSON.stringify({
                    coins: this.coins,
                    shells: this.shells,
                    loadout: this.loadout
                }));
                // Try updating simple UI elements if defined
                if (typeof updateCoinsDisplay === 'function') updateCoinsDisplay();
            } else {
                // New user - push current defaults/local storage to server
                await this.pushToServer();
            }
        } catch (e) {
            console.error("DB Sync Error:", e);
        } finally {
            this.isSyncing = false;
        }
    }

    async pushToServer() {
        if (!this.walletAddress || this.isSyncing) return;
        try {
            const API_URL = window.location.port === '8080' ? 'http://localhost:3000' : '';
            await fetch(`${API_URL}/api/inventory/${this.walletAddress}/save`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    coins: this.coins,
                    shells: this.shells,
                    loadout: this.loadout
                })
            });
        } catch (e) {
            console.error("DB Save Error:", e);
        }
    }

    // Get count of a shell type
    getCount(shellId) {
        if (shellId === 'standard') return Infinity;
        return this.shells[shellId] || 0;
    }

    // Add shells
    addShells(shellId, count) {
        if (shellId === 'standard') return;
        this.shells[shellId] = (this.shells[shellId] || 0) + count;
        this.save();
    }

    // Consume one shell (returns true if successful)
    consume(shellId) {
        if (shellId === 'standard') return true;
        if ((this.shells[shellId] || 0) <= 0) return false;
        this.shells[shellId]--;
        this.save();
        return true;
    }

    // Buy a pack
    buyPack(shellId) {
        const type = SHELL_TYPES[shellId];
        if (!type || type.price <= 0) return { success: false, msg: '구매 불가' };
        if (this.coins < type.price) return { success: false, msg: '코인 부족' };

        this.coins -= type.price;
        this.addShells(shellId, type.packSize);
        return { success: true, msg: `${type.name} x${type.packSize} 구매 완료!` };
    }

    // Add coins
    addCoins(amount) {
        this.coins += amount;
        this.save();
    }

    // Set loadout slot (1-4, slot 0 is always standard)
    setSlot(slotIndex, shellId) {
        if (slotIndex === 0) return; // Can't change slot 1
        if (slotIndex < 1 || slotIndex > 4) return;
        // Can only equip if owned
        if (shellId && this.getCount(shellId) <= 0) return;
        // Remove from other slots first
        for (let i = 1; i < 5; i++) {
            if (this.loadout[i] === shellId) this.loadout[i] = null;
        }
        this.loadout[slotIndex] = shellId;
        this.save();
    }

    // Get active shell type for slot
    getSlotType(slotIndex) {
        const id = this.loadout[slotIndex];
        if (!id) return null;
        return SHELL_TYPES[id] || null;
    }

    // Get loadout summary for HUD
    getLoadoutInfo() {
        return this.loadout.map((id, i) => {
            if (!id) return { slot: i + 1, empty: true };
            const type = SHELL_TYPES[id];
            return {
                slot: i + 1,
                id,
                name: type.name,
                icon: type.icon,
                color: type.color,
                count: this.getCount(id),
                empty: false
            };
        });
    }
}
