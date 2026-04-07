// ============================================
// TANK WARFARE — Shell System & Economy
// ============================================

const SHELL_TYPES = {
    standard: {
        id: 'standard',
        name: 'Standard',
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
        desc: 'Standard shell',
        // Effects
        explosive: false,
        piercing: false,
        bounce: 0,
        dot: null
    },
    explosive: {
        id: 'explosive',
        name: 'Explosive',
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
        desc: 'Explodes on impact (45px radius)',
        explosive: true,
        splashRadius: 45,
        splashDamage: 12,
        piercing: false,
        bounce: 0,
        dot: null
    },
    piercing: {
        id: 'piercing',
        name: 'Piercing',
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
        desc: 'Pierces crates + High damage',
        explosive: false,
        piercing: true,
        bounce: 0,
        dot: null
    },
    ricochet: {
        id: 'ricochet',
        name: 'Ricochet',
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
        desc: 'Bounces off walls once',
        explosive: false,
        piercing: false,
        bounce: 1,
        dot: null
    },
    venom: {
        id: 'venom',
        name: 'Venom',
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
        desc: 'Poison effect 3s (8 dmg/s)',
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
        window.dispatchEvent(new Event('inventory-updated'));
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
                window.dispatchEvent(new Event('inventory-updated'));
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
        if (!type || type.price <= 0) return { success: false, msg: 'Cannot purchase' };
        if (this.coins < type.price) return { success: false, msg: 'Not enough coins' };

        this.coins -= type.price;
        this.addShells(shellId, type.packSize);
        return { success: true, msg: `Purchased ${type.name} x${type.packSize}!` };
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
