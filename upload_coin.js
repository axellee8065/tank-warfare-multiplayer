const fs = require('fs');
const sharp = require('sharp');
const { createFortemClient } = require('@fortemlabs/sdk-js');
require('dotenv').config();

async function run() {
    const client = createFortemClient({
        apiKey: process.env.FORTEM_API_KEY,
        network: 'testnet'
    });

    try {
        console.log("Compressing image...");
        const buffer = await sharp('./coin.png')
            .resize(256, 256)
            .jpeg({ quality: 90 })
            .toBuffer();

        console.log(`Original size: ${fs.statSync('./coin.png').size} bytes`);
        console.log(`Compressed size: ${buffer.length} bytes`);

        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const colId = Number(process.env.FORTEM_COLLECTION_ID);
        console.log(`Uploading to collection ${colId}...`);
        
        const res = await client.items.uploadImage(colId, blob, 'coin.jpg');
        console.log("Upload Success! Response:");
        console.log(JSON.stringify(res, null, 2));

        // Save URL locally
        fs.writeFileSync('coin_url.txt', res.data.itemImage);
        console.log("Saved itemImage to coin_url.txt");
    } catch (e) {
        console.error("Upload Error:", e);
        if (e.response) {
            console.error("Details:", await e.response.text());
        }
    }
}
run();
