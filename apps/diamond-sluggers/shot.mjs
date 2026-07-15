// shot.mjs — render the standalone game in headless Chromium (software WebGL)
// and save screenshots. Usage: node shot.mjs <out-prefix> [--play]
import chromium from "@sparticuz/chromium";
import { chromium as pw } from "playwright-core";
import path from "path";

const prefix = process.argv[2] || "shot";
const doPlay = process.argv.includes("--play");

chromium.setGraphicsMode = true; // enable WebGL via SwiftShader
const exe = await chromium.executablePath();

const browser = await pw.launch({
  executablePath: exe,
  args: [
    ...chromium.args,
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("console", (m) => console.log("[console]", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log("[pageerror]", e.message));

const file = "file://" + path.resolve("dist/diamond-sluggers.html");
await page.goto(file, { waitUntil: "load", timeout: 30000 });
await page.waitForTimeout(3500); // let boot + first render happen

await page.screenshot({ path: `${prefix}-menu.png` });
console.log("saved", `${prefix}-menu.png`);

if (doPlay) {
  // Click PLAY BALL, then screenshot the pitching view (top 1).
  await page.click("#startBtn").catch((e) => console.log("click err", e.message));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${prefix}-pitchcam.png` });
  console.log("saved", `${prefix}-pitchcam.png`);
  // Force the bottom half via the debug handle to preview the batting camera.
  await page.evaluate(() => {
    const g = window.__game;
    if (!g) return;
    g.half = "bottom";
    g._recolorForHalf();
    g._resetForPitch();
    g.state = "READY";
    g.timer = 0.5;
  });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${prefix}-batcam.png` });
  console.log("saved", `${prefix}-batcam.png`);
}
await browser.close();
console.log("done");
