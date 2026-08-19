/* Copies third-party browser bundles into src/renderer/vendor so the renderer
 * can load them with a plain <script> tag (works inside an asar archive too). */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const outDir = path.join(root, 'src', 'renderer', 'vendor');
fs.mkdirSync(outDir, { recursive: true });

const wanted = [['hls.js', 'dist/hls.min.js', 'hls.min.js']];

for (const [pkg, rel, outName] of wanted) {
  const src = path.join(root, 'node_modules', pkg, rel);
  const dest = path.join(outDir, outName);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log('vendored', outName);
  } else {
    // Keep a stub so index.html never 404s; HLS simply stays unavailable.
    if (!fs.existsSync(dest)) fs.writeFileSync(dest, '/* hls.js not installed */\n');
    console.warn('missing', src, '- wrote stub');
  }
}
