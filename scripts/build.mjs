#!/usr/bin/env node
// scripts/build.mjs — يبني حزم التوزيع ويولّد بيانات التحديث
//
//   node scripts/build.mjs            بناء الحزم فقط
//   node scripts/build.mjs --manifests  بناء + توليد updates.json و updates.xml
//
// المخرجات في dist/:
//   StremioHub-Harbor-v<version>-chrome.zip
//   StremioHub-Harbor-v<version>-firefox.zip
//
// التوقيع لفايرفوكس يتم في سير عمل الإصدار عبر web-ext (يحتاج مفاتيح AMO).

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const UPDATES = path.join(ROOT, 'updates');

const REPO = 'ABADIOSA/ABADIOSA';
const RELEASE_BASE = `https://github.com/${REPO}/releases/download`;

function readManifest(dir) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, dir, 'manifest.json'), 'utf8'));
}

/** يتحقق أن نسختي كروم وفايرفوكس متطابقتان — اختلافهما يكسر التحديث */
function resolveVersion() {
  const chrome = readManifest('extension').version;
  const firefox = readManifest('extension-firefox').version;
  if (chrome !== firefox) {
    throw new Error(`نسخة كروم (${chrome}) لا تطابق نسخة فايرفوكس (${firefox})`);
  }
  return chrome;
}

function zipDir(sourceDir, outFile) {
  fs.rmSync(outFile, { force: true });
  // نضغط من داخل المجلد حتى يكون manifest.json في جذر الأرشيف
  execFileSync('zip', ['-qr', outFile, '.', '-x', '*.DS_Store'], {
    cwd: path.join(ROOT, sourceDir),
    stdio: 'inherit'
  });
}

/** بيان تحديث فايرفوكس — الصيغة موثّقة في Firefox Extension Workshop */
function writeFirefoxManifest(version) {
  const gecko = readManifest('extension-firefox').browser_specific_settings.gecko;
  const manifest = {
    addons: {
      [gecko.id]: {
        updates: [
          {
            version,
            update_link: `${RELEASE_BASE}/v${version}/stremiohub-harbor-${version}.xpi`,
            applications: {
              gecko: { strict_min_version: gecko.strict_min_version || '119.0' }
            }
          }
        ]
      }
    }
  };
  fs.writeFileSync(
    path.join(UPDATES, 'updates.json'),
    JSON.stringify(manifest, null, 2) + '\n'
  );
  return manifest;
}

/**
 * بيان تحديث كروم (CRX مستضاف ذاتياً).
 * يعمل على لينكس، وعلى ويندوز وماك عبر سياسة المؤسسات فقط.
 */
function writeChromeManifest(version, appId) {
  const xml = `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${appId}'>
    <updatecheck codebase='${RELEASE_BASE}/v${version}/stremiohub-harbor-${version}.crx' version='${version}' />
  </app>
</gupdate>
`;
  fs.writeFileSync(path.join(UPDATES, 'updates.xml'), xml);
  return xml;
}

function main() {
  const version = resolveVersion();
  fs.mkdirSync(DIST, { recursive: true });

  const chromeZip = path.join(DIST, `StremioHub-Harbor-v${version}-chrome.zip`);
  const firefoxZip = path.join(DIST, `StremioHub-Harbor-v${version}-firefox.zip`);

  zipDir('extension', chromeZip);
  zipDir('extension-firefox', firefoxZip);

  console.log(`✓ v${version}`);
  console.log('  ' + path.relative(ROOT, chromeZip));
  console.log('  ' + path.relative(ROOT, firefoxZip));

  if (process.argv.includes('--manifests')) {
    fs.mkdirSync(UPDATES, { recursive: true });
    writeFirefoxManifest(version);
    // معرّف كروم يُشتق من المفتاح العام للـ CRX؛ يُمرَّر عبر البيئة عند التوقيع
    writeChromeManifest(version, process.env.CHROME_APP_ID || 'REPLACE_WITH_CRX_APP_ID');
    console.log('  updates/updates.json');
    console.log('  updates/updates.xml');
  }

  // يستهلكه سير عمل GitHub لتسمية الإصدار
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
  }
}

main();
