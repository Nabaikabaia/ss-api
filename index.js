import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

// Health check (important for Render)
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Nabees SS API",
    uptime: process.uptime()
  });
});

app.get("/ss", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  let browser;

  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process"
      ]
    });

    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 }
    });

    await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 60000
    });

    const buffer = await page.screenshot({
      type: "png",
      fullPage: true
    });

    res.setHeader("Content-Type", "image/png");
    res.send(buffer);
  } catch (err) {
    console.error("Screenshot error:", err);
    res.status(500).json({
      error: "Screenshot failed",
      message: err.message
    });
  } finally {
    if (browser) await browser.close();
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Nabees SS API running on port ${PORT}`);
});
