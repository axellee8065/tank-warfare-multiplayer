const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function alter() {
    try {
        console.log("Altering DB...");
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_wins INT DEFAULT 0`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_kills INT DEFAULT 0`);
        await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS total_matches INT DEFAULT 0`);
        console.log("DB altered successfully! Stats columns added.");
    } catch (e) {
        console.error("Error altering DB:", e);
    }
    pool.end();
}
alter();
