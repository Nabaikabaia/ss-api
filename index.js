const express = require('express');
const { chromium } = require('playwright-chromium');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());
app.set('json spaces', 2);

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Validate input
const validateInput = (url, device) => {
  if (!url) return 'URL parameter is required';
  try { new URL(url); } catch { return 'Invalid URL format'; }
  const validDevices = ['phone','mobile','tablet','laptop','desktop','full'];
  if (device && !validDevices.includes(device))
    return `Invalid device. Must be one of: ${validDevices.join(', ')}`;
  return null;
};

// Device viewports
const deviceConfigs = {
  phone: { width: 375, height: 667 },
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
  full: null
};

// Cleanup old temp files
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
  } catch {}
}
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// Screenshot endpoint
app.get('/api/screenshot', async (req, res) => {
  const { url, device = 'desktop' } = req.query;
  const validationError = validateInput(url, device);
  if (validationError) return res.status(400).json({ error: validationError });

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    if (device !== 'full') await page.setViewportSize(deviceConfigs[device]);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const screenshot = await page.screenshot({ type: 'png', fullPage: device === 'full', animations: 'disabled' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="nabees-${device}-${Date.now()}.png"`);
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ error: 'Screenshot failed', message: err.message });
  } finally { if (browser) await browser.close(); }
});

// Mobile screenshot shortcut
app.get('/api/screenshot/mobile', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL parameter is required' });

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setViewportSize(deviceConfigs.mobile);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    const screenshot = await page.screenshot({ type: 'png', fullPage: false, animations: 'disabled' });
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Content-Disposition', `inline; filename="nabees_mobile-${Date.now()}.png"`);
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({ error: 'Screenshot failed', message: err.message });
  } finally { if (browser) await browser.close(); }
});

// Screen recording endpoint
app.get('/api/screenrecord', async (req, res) => {
  const { url, device = 'desktop', duration = '10' } = req.query;
  const validationError = validateInput(url, device);
  if (validationError) return res.status(400).json({ error: validationError });

  let browser, context;
  const recordingId = Date.now().toString();
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox'] });
    context = await browser.newContext({
      recordVideo: { dir: tempDir, size: device !== 'full' ? deviceConfigs[device] : { width:1920, height:1080 } }
    });
    const page = await context.newPage();
    if (device !== 'full') await page.setViewportSize(deviceConfigs[device]);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(3000);
    const recordDuration = Math.min(parseInt(duration) || 10, 30);
    await page.waitForTimeout(recordDuration * 1000);
    await context.close();
    await new Promise(resolve => setTimeout(resolve, 2000));
    const videoFiles = fs.readdirSync(tempDir).filter(f => f.endsWith('.webm'));
    const videoFile = videoFiles.find(f => fs.statSync(path.join(tempDir,f)).mtime.getTime() > Date.now()-10000);
    if (!videoFile) throw new Error('Video file not found');
    const videoPath = path.join(tempDir, videoFile);
    const videoBuffer = fs.readFileSync(videoPath);
    res.setHeader('Content-Type', 'video/webm');
    res.setHeader('Content-Disposition', `inline; filename="nabees_rec-${device}-${recordingId}.webm"`);
    res.send(videoBuffer);
    fs.unlinkSync(videoPath);
  } catch (err) {
    if (context) await context.close();
    res.status(500).json({ error: 'Screen recording failed', message: err.message });
  } finally { if (browser) await browser.close(); }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status:200, success:true, info:'online', timestamp: new Date().toISOString() });
});

// Home page
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
<title>Nabees SS API</title>
</head>
<body>
<h1>Nabees Screenshot & Screen Recording API</h1>
<p>Creator: Nabees</p>
<ul>
<li><a href="/api/screenshot?url=https://example.com&device=desktop">Screenshot</a></li>
<li><a href="/api/screenshot/mobile?url=https://example.com">Mobile Screenshot</a></li>
<li><a href="/api/screenrecord?url=https://example.com&duration=10">Screen Record</a></li>
<li><a href="/health">Health Check</a></li>
</ul>
</body>
</html>
  `);
});

app.listen(PORT, () => console.log(`🚀 Nabees SS API running on port ${PORT}`));
