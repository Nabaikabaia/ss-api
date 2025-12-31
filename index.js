const express = require('express');
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 2123;

/* ================= SECURITY & BASIC SETUP ================= */

app.disable('x-powered-by');
app.use(express.json());
app.set('json spaces', 2);

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', apiLimiter);

/* ================= TEMP DIR ================= */

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

/* ================= DEVICE CONFIG ================= */

const deviceConfigs = {
  phone: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1366, height: 768 },
  desktop: { width: 1920, height: 1080 },
  full: null
};

/* ================= VALIDATION ================= */

function validateInput(url, device) {
  if (!url) return 'URL parameter is required';

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return 'Invalid URL format';
  }

  const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
  if (blockedHosts.includes(parsed.hostname)) {
    return 'Local or internal URLs are not allowed';
  }

  if (!deviceConfigs[device]) {
    return `Invalid device. Use: ${Object.keys(deviceConfigs).join(', ')}`;
  }

  return null;
}

/* ================= CLEANUP ================= */

function cleanupTempFiles() {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000;
  try {
    fs.readdirSync(tempDir).forEach(file => {
      const filePath = path.join(tempDir, file);
      if (now - fs.statSync(filePath).mtime.getTime() > maxAge) {
        fs.unlinkSync(filePath);
      }
    });
  } catch {}
}

setInterval(cleanupTempFiles, 30 * 60 * 1000);

/* ================= BROWSER INSTANCE ================= */

let browser;
(async () => {
  browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
})();

/* ================= SCREENSHOT API ================= */

app.get('/api/screenshot', async (req, res) => {
  const { url, device = 'desktop' } = req.query;
  const error = validateInput(url, device);
  if (error) return res.status(400).json({ error });

  let context;
  try {
    context = await browser.newContext();
    const page = await context.newPage();

    if (device !== 'full') {
      await page.setViewportSize(deviceConfigs[device]);
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(1500);

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: device === 'full',
      animations: 'disabled'
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="nabees-ss-${device}-${Date.now()}.png"`
    );
    res.send(screenshot);
  } catch (err) {
    res.status(500).json({
      success: false,
      creator: 'Nabees',
      error: 'Screenshot failed',
      message: err.message
    });
  } finally {
    if (context) await context.close();
  }
});

/* ================= SCREEN RECORD API ================= */

app.get('/api/screenrecord', async (req, res) => {
  const { url, device = 'desktop', duration = '10' } = req.query;
  const error = validateInput(url, device);
  if (error) return res.status(400).json({ error });

  const d = Number(duration);
  if (!Number.isInteger(d) || d <= 0) {
    return res.status(400).json({ error: 'Invalid duration value' });
  }
  const recordDuration = Math.min(d, 30);

  let context;
  try {
    context = await browser.newContext({
      recordVideo: {
        dir: tempDir,
        size: device !== 'full'
          ? deviceConfigs[device]
          : deviceConfigs.desktop
      }
    });

    const page = await context.newPage();
    if (device !== 'full') {
      await page.setViewportSize(deviceConfigs[device]);
    }

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await page.waitForTimeout(recordDuration * 1000);

    const video = page.video();
    await context.close();

    const videoPath = await video.path();
    const videoBuffer = fs.readFileSync(videoPath);

    res.setHeader('Content-Type', 'video/webm');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="nabees-ss-rec-${device}-${Date.now()}.webm"`
    );
    res.send(videoBuffer);

    fs.unlinkSync(videoPath);
  } catch (err) {
    if (context) await context.close();
    res.status(500).json({
      success: false,
      creator: 'Nabees',
      error: 'Screen recording failed',
      message: err.message
    });
  }
});

/* ================= HEALTH ================= */

app.get('/health', (req, res) => {
  res.json({
    status: 200,
    success: true,
    service: 'Nabees SS API',
    creator: 'Nabees',
    timestamp: new Date().toISOString()
  });
});

/* ================= HOME ================= */

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Nabees SS API</title>
  <style>
    body { font-family: Arial; max-width: 800px; margin: auto; padding: 20px; }
    .btn { background:#0d6efd; color:#fff; padding:10px 16px; text-decoration:none; border-radius:6px }
  </style>
</head>
<body>
  <h1>Nabees Screenshot & ScreenRecord API</h1>
  <p>Fast • Secure • Headless Chromium</p>

  <p>
    <a class="btn" href="/api/screenshot?url=https://github.com&device=laptop" target="_blank">
      Test Screenshot
    </a>
  </p>

  <p>
    <a class="btn" href="/api/screenrecord?url=https://example.com&duration=10" target="_blank">
      Test Screen Record
    </a>
  </p>

  <p><a href="/health">Health Check</a></p>
</body>
</html>
`);
});

/* ================= START ================= */

app.listen(PORT, () => {
  console.log(`🚀 Nabees SS API running on port ${PORT}`);
});
