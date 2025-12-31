import express from 'express';
import { chromium } from 'playwright-chromium';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.set('json spaces', 2);

// Temp folder for storing screenshots/videos
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Device configurations
const deviceConfigs = {
  phone: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
  full: null
};

// Input validation
const validateInput = (url, device) => {
  if (!url) return 'URL parameter is required';
  try { new URL(url); } catch { return 'Invalid URL format'; }
  const validDevices = Object.keys(deviceConfigs);
  if (device && !validDevices.includes(device)) return `Invalid device. Must be one of: ${validDevices.join(', ')}`;
  return null;
};

// Cleanup old files
function cleanupTempFiles() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  try {
    const files = fs.readdirSync(tempDir);
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      const stats = fs.statSync(filePath);
      if (now - stats.mtime.getTime() > thirtyMinutes) fs.unlinkSync(filePath);
    });
  } catch (e) {}
}
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// Serve frontend HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Nãbēēs Screenshot & Screen Recording API</title>
<style>
body { font-family: Arial; max-width: 800px; margin: 0 auto; padding: 20px; }
.button { display:inline-block; padding:10px 20px; margin:10px; background:#007bff; color:white; text-decoration:none; border-radius:5px; }
.button:hover { background:#0056b3; }
.endpoint { background:#f8f9fa; padding:15px; margin:10px 0; border-radius:5px; }
</style>
</head>
<body>
<h1>Nãbēēs Screenshot & Screen Recording API</h1>
<p>Creator: Nãbēēs</p>

<div class="endpoint">
<h3>Screenshot Endpoint</h3>
<p><strong>URL:</strong> /api/screenshot</p>
<p><strong>Parameters:</strong> url, device (optional: phone, tablet, laptop, desktop, full)</p>
</div>

<div class="endpoint">
<h3>Screen Recording Endpoint</h3>
<p><strong>URL:</strong> /api/screenrecord</p>
<p><strong>Parameters:</strong> url, device (optional), duration (optional, max 30s)</p>
</div>

<div class="endpoint">
<h3>Example Buttons</h3>
<a class="button" href="/api/screenshot?url=https://github.com&device=desktop" target="_blank">Try Desktop Screenshot</a>
<a class="button" href="/api/screenshot?url=https://github.com&device=phone" target="_blank">Try Phone Screenshot</a>
<a class="button" href="/api/screenrecord?url=https://github.com&device=laptop&duration=10" target="_blank">Try 10s Laptop Recording</a>
</div>

<a class="button" href="/health">Health Check</a>
</body>
</html>
  `);
});

// Screenshot API (returns URL)
app.get('/api/screenshot', async (req, res) => {
  const { url, device = 'desktop' } = req.query;
  const errMsg = validateInput(url, device);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const timestamp = Date.now();
  const filename = `screenshot-${device}-${timestamp}.png`;
  const filePath = path.join(tempDir, filename);

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    if (device !== 'full') await page.setViewportSize(deviceConfigs[device]);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: filePath, type: 'png', fullPage: device==='full', animations: 'disabled' });

    res.json({ 
      success: true, 
      url: `/temp/${filename}` 
    });
  } catch (err) {
    res.status(500).json({ error: 'Screenshot failed', message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Screen recording API (returns URL)
app.get('/api/screenrecord', async (req, res) => {
  const { url, device = 'desktop', duration = 10 } = req.query;
  const dur = Math.min(Number(duration) || 10, 30);
  const errMsg = validateInput(url, device);
  if (errMsg) return res.status(400).json({ error: errMsg });

  const timestamp = Date.now();
  const filename = `record-${device}-${timestamp}.webm`;
  const filePath = path.join(tempDir, filename);

  let browser, context, page;
  try {
    browser = await chromium.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    context = await browser.newContext({ viewport: deviceConfigs[device] || undefined });
    page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Start recording
    await page.waitForTimeout(1000);
    await page.startVideo({ path: filePath });
    await page.waitForTimeout(dur * 1000);
    await page.close();

    res.json({ success: true, url: `/temp/${filename}` });
  } catch (err) {
    res.status(500).json({ error: 'Screen recording failed', message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Serve temp images/videos publicly
app.use('/temp', express.static(tempDir));

// Health check
app.get('/health', (req,res) => {
  res.json({ status:200, success:true, info:'online', creator:'Nãbēēs', timestamp:new Date().toISOString() });
});

app.listen(PORT, () => console.log(`🚀 Nabees SS API running on port ${PORT}`));
