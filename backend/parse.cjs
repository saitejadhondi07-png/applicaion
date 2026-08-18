const fs = require('fs');
const { execSync } = require('child_process');

try {
    const raw = fs.readFileSync('reports.json', 'utf16le');
    // It's a huge string. We can try to split by '{"BatteryPackId":'
    
    // First, let's normalize the file (remove newlines if any)
    const normalized = raw.replace(/\r?\n|\r/g, '');
    
    // The format is multiple rows of json arrays.
    // Let's use regex to find the items.
    const ids = [
        "TGA463300C28",
        "TGA5633009E0",
        "TGA563300B20",
        "TGA66330085B",
        "TGA763300B22",
        "TGA9633009DF"
    ];
    
    const regex = /{"BatteryPackId":"([^"]+)",([^}]+)}/g;
    let match;
    
    while ((match = regex.exec(normalized)) !== null) {
        if (ids.includes(match[1])) {
            console.log("-----------------------------------------");
            console.log("BatteryPackId: " + match[1]);
            const parts = match[2].split(',');
            parts.forEach(p => {
                console.log("  " + p);
            });
        }
    }
} catch (e) {
    console.error(e);
}
