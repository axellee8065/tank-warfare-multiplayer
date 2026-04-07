const { createFortemClient } = require('@fortemlabs/sdk-js');
const dotenv = require('dotenv');
dotenv.config();

const API_KEY = process.env.FORTEM_API_KEY;

async function main() {
    console.log("Setting up Fortem...");
    try {
        const fortem = createFortemClient({
            apiKey: API_KEY,
            network: 'testnet'
        });

        // 1. Authenticate
        const getNonceRes = await fortem.auth.getNonce();
        console.log("Nonce Response:", getNonceRes);
        await fortem.auth.getAccessToken(getNonceRes.nonce);
        console.log('Authenticated successfully!');

        // 2. Check if collection already exists
        const collRes = await fortem.collections.list();
        if (collRes.data && collRes.data.length > 0) {
            console.log("Collection already exists. ID:", collRes.data[0].id);
            console.log("Please add this ID to your .env under FORTEM_COLLECTION_ID");
        } else {
            // 3. Create collection
            console.log("Creating new collection...");
            const newColl = await fortem.collections.create({
                name: "Tank Warfare Coins",
                description: "Tank Warfare secondary trading coins",
                link: { website: "http://localhost:3000" }
            });
            console.log("Successfully created collection! ID:", newColl.data.id);
            console.log("Please add this ID to your .env under FORTEM_COLLECTION_ID");
        }
    } catch (e) {
        console.error("Error setting up Fortem:", e);
        if (e.response && e.response.data) {
             console.error("Response:", e.response.data);
        }
    }
}
main();
