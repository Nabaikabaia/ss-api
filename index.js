process.env.PLAYWRIGHT_BROWSERS_PATH = "0";

import express from "express";
import { chromium } from "playwright";

const app = express();
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    service: "Nabees SS API"
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
        "--disable-gpu"
      ]
    });

    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 }
    });

    await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });

    const screenshot = await page.screenshot({ fullPage: true });

    res.set("Content-Type", "image/png");
    res.send(screenshot);
  } catch (err) {
    console.error(err);
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
