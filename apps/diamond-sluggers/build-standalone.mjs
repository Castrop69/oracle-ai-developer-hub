// build-standalone.mjs — bundles the whole game (Three.js + addons + game code)
// into ONE self-contained HTML file that runs by double-clicking it: no web
// server, no CDN, no internet. Output: dist/diamond-sluggers.html
//
// Usage:  node build-standalone.mjs   (after `npm install`)

import { build } from "esbuild";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";

const root = path.resolve(".");
const jsm = path.join(root, "node_modules/three/examples/jsm");

// 1. Bundle src/main.js and everything it imports into a single classic IIFE.
const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  minify: true,
  write: false,
  // Resolve "three/addons/*" to the installed three examples (no import map).
  plugins: [
    {
      name: "three-addons",
      setup(b) {
        b.onResolve({ filter: /^three\/addons\// }, (args) => ({
          path: path.join(jsm, args.path.replace(/^three\/addons\//, "")),
        }));
      },
    },
  ],
});
const bundleJs = result.outputFiles[0].text;

// 2. Inline the CSS and the bundle into the existing HTML shell, dropping the
//    import map and the module/stylesheet <link>s (everything is inline now).
let html = await readFile("index.html", "utf8");
const css = await readFile("styles.css", "utf8");

html = html
  .replace(/<link rel="stylesheet" href="\.\/styles\.css" \/>\s*/, "")
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, "")
  .replace(/<script type="module" src="\.\/src\/main\.js"><\/script>\s*/, "");

// CSS into <head>.
html = html.replace("</head>", `  <style>\n${css}\n  </style>\n  </head>`);

// Embed the bundle as base64 and decode+run it at load time. Base64 contains
// only [A-Za-z0-9+/=] — no "<", no "</script>", no "<!--" — so the HTML parser
// physically cannot mis-tokenize the code (the cause of a frozen page). The
// decoded JS is executed via a script element whose textContent is NOT
// HTML-parsed, so it's bulletproof regardless of what the bundle contains.
const b64 = Buffer.from(bundleJs, "utf8").toString("base64");
const bootstrap = `<script>
(function () {
  try {
    var bin = atob("${b64}");
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    var code = new TextDecoder("utf-8").decode(bytes);
    var s = document.createElement("script");
    s.textContent = code;
    document.body.appendChild(s);
  } catch (e) {
    var el = document.getElementById("loading");
    if (el) { el.style.whiteSpace = "pre-wrap"; el.textContent = "\\u26A0 Bootstrap failed: " + (e && e.message || e); }
  }
})();
</script>`;
html = html.replace("</body>", `  ${bootstrap}\n  </body>`);

await mkdir("dist", { recursive: true });
await writeFile("dist/diamond-sluggers.html", html);

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
console.log(`Wrote dist/diamond-sluggers.html (${kb} KB) — open it by double-clicking.`);
