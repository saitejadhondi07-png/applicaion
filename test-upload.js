
async function testUpload() {
    try {
        const fetch = (await import('node-fetch')).default;
        const FormData = (await import('formdata-node')).FormData;
        
        const form = new FormData();
        form.append('modelNumber', 'TEST');
        form.append('engineerId', '102024');
        form.append('engineerName', 'Test Engineer');
        
        console.log("Sending request...");
        const res = await fetch('http://localhost:5191/api/reports/upload', {
            method: 'POST',
            body: form
        });
        
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testUpload();
