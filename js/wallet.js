// ============================================
// TANK WARFARE — Sui Wallet (Slush) Manager
// Wallet Standard Protocol Implementation
// ============================================

class SuiWalletManager {
    constructor() {
        this.wallet = null;        // connected wallet obj
        this.accounts = [];        // connected accounts
        this.address = null;       // current address
        this.connected = false;
        this.availableWallets = [];
        this._listeners = [];
        this._ready = false;
        this._init();
    }

    // ---- Wallet Standard Discovery ----
    _init() {
        // Step 1: Listen for wallets that register AFTER we're ready
        window.addEventListener('wallet-standard:register-wallet', (event) => {
            const callback = event.detail;
            if (typeof callback === 'function') {
                callback({ register: (...wallets) => this._onWalletsRegistered(wallets) });
            }
        });

        // Step 2: Announce that our app is ready — wallets already loaded will call our register
        try {
            window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', {
                detail: {
                    register: (...wallets) => this._onWalletsRegistered(wallets)
                }
            }));
        } catch (e) {
            console.warn('[Wallet] app-ready dispatch failed:', e);
        }

        this._ready = true;

        // Step 3: Try auto-reconnect from previous session (with delay for extensions to load)
        const saved = localStorage.getItem('tankWarfare_walletName');
        if (saved) {
            setTimeout(() => this._autoConnect(saved), 800);
            // Retry once more in case wallet loaded slowly
            setTimeout(() => {
                if (!this.connected) this._autoConnect(saved);
            }, 2500);
        }

        console.log('[Wallet] Manager initialized, listening for wallets...');
    }

    _onWalletsRegistered(wallets) {
        for (const w of wallets) {
            // Avoid duplicates
            if (this.availableWallets.some(existing => existing.name === w.name)) continue;

            // Only add Sui-compatible wallets (must have standard:connect)
            if (w.features && w.features['standard:connect']) {
                this.availableWallets.push(w);
                console.log('[Wallet] Discovered:', w.name);
                this._emit('walletDiscovered', { name: w.name, wallet: w });
            }
        }
    }

    // ---- Connection ----
    async connect(walletOrIndex) {
        let wallet;

        if (!walletOrIndex && this.availableWallets.length > 0) {
            // Prefer Slush
            wallet = this.availableWallets.find(w =>
                w.name.toLowerCase().includes('slush') ||
                w.name.toLowerCase().includes('sui wallet')
            ) || this.availableWallets[0];
        } else if (typeof walletOrIndex === 'number') {
            wallet = this.availableWallets[walletOrIndex];
        } else if (typeof walletOrIndex === 'object') {
            wallet = walletOrIndex;
        }

        if (!wallet) {
            return { success: false, error: 'no_wallet', message: 'Could not find Slush wallet' };
        }

        try {
            const connectFeature = wallet.features['standard:connect'];
            const result = await connectFeature.connect();

            this.wallet = wallet;
            this.accounts = result.accounts || [];
            this.address = this.accounts.length > 0 ? this.accounts[0].address : null;
            this.connected = !!this.address;

            if (this.connected) {
                localStorage.setItem('tankWarfare_walletName', wallet.name);
                console.log('[Wallet] Connected:', wallet.name, this.shortAddress(this.address));
                this._emit('connected', { address: this.address, wallet: wallet.name });
            }

            return { success: this.connected, address: this.address };
        } catch (e) {
            console.error('[Wallet] Connect error:', e);
            return { success: false, error: 'rejected', message: 'Wallet connection rejected' };
        }
    }

    async disconnect() {
        if (this.wallet && this.wallet.features['standard:disconnect']) {
            try {
                await this.wallet.features['standard:disconnect'].disconnect();
            } catch (e) { /* ignore */ }
        }
        this.wallet = null;
        this.accounts = [];
        this.address = null;
        this.connected = false;
        localStorage.removeItem('tankWarfare_walletName');
        console.log('[Wallet] Disconnected');
        this._emit('disconnected', {});
    }

    async _autoConnect(walletName) {
        const wallet = this.availableWallets.find(w => w.name === walletName);
        if (wallet && !this.connected) {
            console.log('[Wallet] Auto-reconnecting to', walletName);
            await this.connect(wallet);
        }
    }

    // ---- Utilities ----
    shortAddress(addr) {
        if (!addr) return '';
        if (addr.length <= 12) return addr;
        return addr.slice(0, 6) + '...' + addr.slice(-4);
    }

    hasWallet() {
        return this.availableWallets.length > 0;
    }

    // ---- Simple Event System ----
    on(event, cb) {
        this._listeners.push({ event, cb });
    }

    off(event, cb) {
        this._listeners = this._listeners.filter(l => !(l.event === event && l.cb === cb));
    }

    _emit(event, data) {
        this._listeners.filter(l => l.event === event).forEach(l => l.cb(data));
    }
}
