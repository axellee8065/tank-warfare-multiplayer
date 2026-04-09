const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

async function createMultiplePreviews() {
    // 1~5번 탱크에 대해 각각 Color1(팀A)과 Color2(팀B) 버전을 생성합니다.
    const tanks = [1, 2, 3, 4, 5];
    const colors = [1, 2]; // Color 1, Color 2

    for (let tank of tanks) {
        for (let color of colors) {
            const basePath = path.join(__dirname, `assets/Tanks_base/tank${tank}_color${color}.png`);
            // Cannons 폴더 안의 대포 규칙: Cannons_color[C]/cannon[탱크번호]_[포탑레벨].png
            // 여기선 첫번째 레벨포탑(1)을 쓴다고 가정합니다. (cannon1_1, cannon2_1 등)
            const cannonPath = path.join(__dirname, `assets/Cannons_color${color}/cannon${tank}_1.png`);
            const outputPath = path.join(__dirname, `preview_tank${tank}_color${color}.png`);

            try {
                if (fs.existsSync(basePath) && fs.existsSync(cannonPath)) {
                    await sharp(basePath)
                        .composite([{ input: cannonPath, blend: 'over' }])
                        .toFile(outputPath);
                    console.log(`Created: preview_tank${tank}_color${color}.png`);
                } else {
                    console.error(`File missing for tank ${tank} color ${color}`);
                }
            } catch (err) {
                console.error(`Error with tank ${tank} color ${color}:`, err);
            }
        }
    }
}

createMultiplePreviews();
