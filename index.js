const express = require('express');
const { chromium } = require('playwright-chromium');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 2123;

app.use(express.json());
app.use(express.static('public')); // Serve HTML & static assets
app.set('json spaces', 2);

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

// Detect domain function
function getDomain(req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers.host;
  return `${protocol}://${host}`;
}

// Device configs
const deviceConfigs = {
  phone: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
  full: null
};

const validateInput = (url, device) => {
  if (!url) return 'URL parameter is required';
  try { new URL(url); } catch { return 'Invalid URL format'; }
  if (device && !deviceConfigs[device]) return `Invalid device. Must be one of: ${Object.keys(deviceConfigs).join(', ')}`;
  return null;
};

// Cleanup temp files
function cleanupTempFiles() {
  const now = Date.now();
  const thirtyMinutes = 30 * 60 * 1000;
  fs.readdirSync(tempDir).forEach(file => {
    const filePath = path.join(tempDir, file);
    if (now - fs.statSync(filePath).mtime.getTime() > thirtyMinutes) fs.unlinkSync(filePath);
  });
}
setInterval(cleanupTempFiles, 30 * 60 * 1000);

// Screenshot endpoint
app.get('/api/screenshot', async (req, res) => {
  const { url, device = 'desktop' } = req.query;
  const validationError = validateInput(url, device);
  if (validationError) return res.status(400).json({ error: validationError });

  let browser;
  try {
    browser = await chromium.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    if (device !== 'full') await page.setViewportSize(deviceConfigs[device]);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const filename = `screenshot-${device}-${Date.now()}.png`;
    const filePath = path.join(tempDir, filename);
    await page.screenshot({ path: filePath, type: 'png', fullPage: device === 'full', animations: 'disabled' });

    const domain = getDomain(req);
    res.json({ success: true, url: `${domain}/temp/${filename}`, creator: 'Nãbēēs' });

  } catch (err) {
    res.status(500).json({ error: 'Screenshot failed', message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Screen recording endpoint
app.get('/api/screenrecord', async (req, res) => {
  const { url, device = 'desktop', duration = '10' } = req.query;
  const validationError = validateInput(url, device);
  if (validationError) return res.status(400).json({ error: validationError });

  let browser, context;
  const dur = Math.min(parseInt(duration) || 10, 30);
  try {
    browser = await chromium.launch({ headless: true, args:['--no-sandbox','--disable-setuid-sandbox'] });
    context = await browser.newContext({
      viewport: device !== 'full' ? deviceConfigs[device] : { width: 1920, height: 1080 },
      recordVideo: { dir: tempDir, size: device !== 'full' ? deviceConfigs[device] : { width: 1920, height: 1080 } }
    });

    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(dur * 1000);
    await context.close(); // saves video automatically

    const videoFile = fs.readdirSync(tempDir)
      .filter(f => f.endsWith('.webm'))
      .sort((a,b) => fs.statSync(path.join(tempDir,b)).mtime - fs.statSync(path.join(tempDir,a)).mtime)[0];

    if (!videoFile) throw new Error('Video file not found');

    const domain = getDomain(req);
    res.json({ success: true, url: `${domain}/temp/${videoFile}`, creator: 'Nãbēēs' });

  } catch (err) {
    if (context) await context.close();
    res.status(500).json({ error: 'Screen recording failed', message: err.message });
  } finally {
    if (browser) await browser.close();
  }
});

// Serve temp files
app.use('/temp', express.static(tempDir));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 200, success: true, info: 'online', creator: 'Nãbēēs', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => console.log(`🚀 Nabees SS API running on port ${PORT}`));
