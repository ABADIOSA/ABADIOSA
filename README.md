<div align="center">
  <img src="extension/icons/icon128.png" alt="StremioHub Logo" width="128" height="128">
  <h1>StremioHub</h1>
  <p><b>The all-in-one Stremio companion for your browser.</b></p>
  <p>
    <a href="#features">Features</a> •
    <a href="#installation-developer-mode">Installation</a> •
    <a href="#chrome-web-store">Chrome Web Store</a>
  </p>
  <p>
    <a href="README_AR.md">🇸🇦 Read in Arabic (اقرأ بالعربية)</a>
  </p>
  <img src="https://img.shields.io/badge/version-1.5.0-8b5cf6?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/chrome-MV3-4285F4?style=flat-square&logo=googlechrome" alt="Chrome MV3">
  <img src="https://img.shields.io/badge/firefox-MV3-FF7139?style=flat-square&logo=firefox" alt="Firefox MV3">
</div>
<div align="center">
  <a href='https://ko-fi.com/V8P5206X9H' target='_blank'>
    <img height='36' src='https://storage.ko-fi.com/cdn/kofi5.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' />
  </a>
  &nbsp;
  <a href='https://chromewebstore.google.com/detail/stremiohub/kkmkapcckkkgblkcgmngehcejpbpddeg' target='_blank'>
    <img height='36' src='assets/chrome-store-badge.svg' alt='Available in the Chrome Web Store' />
  </a>
  &nbsp;
  <a href='https://addons.mozilla.org/en-US/firefox/addon/stremiohub/' target='_blank'>
    <img height='36' src='https://img.shields.io/badge/Get_it_on-Firefox_Add--ons-FF7139?style=for-the-badge&logo=firefox&logoColor=white' alt='Available on Firefox Add-ons' />
  </a>
</div>

---

<div align="center">
  <em>Manage your Stremio library directly from your browser. Instantly add movies and series to your library from sites like Google, IMDB, TMDB, Letterboxd, Rotten Tomatoes, and Metacritic!</em>
</div>

## ✨ Features

- **🌐 Cross-Site Integration**: Adds smart "Save to Library" and "Open in Stremio" buttons directly on your favorite movie discovery websites.
- **🖱️ Right-Click Quick Search**: Highlight any movie or show name, right-click, and instantly search for it in Stremio.
- **📚 Full Library Management**: View, filter, sort, and mark items as watched (Movies, Series, and Continue Watching) natively in your browser popup.
- **✨ Stremio Web Enhancer** *(New)*: Customize Stremio Web with deep OLED black themes, custom Arabic/English typography (like Thmanyah), custom accent colors, and injected community ratings.
- **👥 Multi-Account & Avatars**: Seamlessly switch between multiple Stremio accounts and assign beautiful custom avatars to them.
- **🧩 Addon Manager** *(New in v1.3.0)*: Install, remove, reorder, and manage your Stremio addons — with per-addon catalog editing — all from the extension.
- **🎨 Glassmorphism UI**: A breathtaking, premium Apple-inspired dark mode design with buttery smooth micro-animations.
- **🔗 Smart Add-on Support**: Dynamically fetches descriptions and metadata from your actual Stremio add-ons (like TMDB) to provide rich, localized context.
- **🌍 Bilingual Support**: Fully supports Arabic & English with native right-to-left (RTL) alignments and live toggling.
- **🛠 Highly Customizable**: Choose between floating pop-up cards or full-screen immersive details views, adjust popup sizes, and more!

## 🧩 Addon Manager — v1.3.0

A full addon management panel is now built directly into the extension settings. No need to open Stremio's website to manage your addons.

| Feature | Description |
|---|---|
| 📋 **View installed addons** | See all your Stremio addons with logos, names, and descriptions |
| ➕ **Install by URL** | Paste a `manifest.json` link to install any addon instantly |
| 🗑️ **Remove addons** | Delete addons with a safety backup prompt before every change |
| ↕️ **Drag & Drop reorder** | Rearrange your addon priority with drag and drop |
| 🗂️ **Edit catalogs** | Rename or hide individual catalogs per addon |
| 🔄 **Sync to Stremio** | Push all changes to your Stremio account with one tap |
| ♻️ **Refresh button** | Reload your addon list from the server at any time |
| 💾 **Backup & Restore** | Export your addon config as JSON and restore it anytime |
| 🔐 **Auto silent backup** | Automatic silent backup before catalog edits |
| 🔁 **Account-aware** | Addon list resets automatically when switching accounts |

<details>
<summary><b>🎬 Feature Demonstrations</b></summary>
<br>

**1. Auto-save from External Sites**  
Seamlessly inject "Save to Library" buttons on sites like Google Search, Letterboxd, IMDB, Metacritic, Rotten Tomatoes, and Trakt!
<img src="assets/videos/websites.gif" width="100%" alt="Websites Demo">

**2. Quick Search via Right-Click**  
Highlight any text, right-click, and instantly search Stremio for it.
<img src="assets/videos/search.gif" width="100%" alt="Search Demo">

**3. Manage Watch Progress**  
Easily mark episodes or movies as watched directly from the popup.
<img src="assets/videos/watch.gif" width="100%" alt="Watch Demo">

</details>

## 🏪 Official Stores

<div align="center">
  <a href="https://chromewebstore.google.com/detail/stremiohub/kkmkapcckkkgblkcgmngehcejpbpddeg" target="_blank">
    <img src="assets/chrome-store-badge.svg" alt="Available in the Chrome Web Store" height="58">
  </a>
  &nbsp;&nbsp;
  <a href="https://addons.mozilla.org/en-US/firefox/addon/stremiohub/" target="_blank">
    <img src="https://img.shields.io/badge/Get_it_on-Firefox_Add--ons-FF7139?style=for-the-badge&logo=firefox&logoColor=white" alt="Available on Firefox Add-ons" height="58">
  </a>
</div>

**StremioHub is officially available on Chrome Web Store and Firefox Add-ons!**  
Install it with one click — no developer mode required. Automatic updates included.

👉 [Install for Chrome](https://chromewebstore.google.com/detail/stremiohub/kkmkapcckkkgblkcgmngehcejpbpddeg)  
👉 [Install for Firefox](https://addons.mozilla.org/en-US/firefox/addon/stremiohub/)

## 🛠 Manual Installation (Developer Mode)

Alternatively, you can load the extension manually:

1. **Download the latest release:** Go to the [Releases page](https://github.com/3-pr/StremioHub/releases) and download the `.zip` file, then extract it.
   *Or clone the repository:*
   ```bash
   git clone https://github.com/3-pr/StremioHub.git
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle in the top right corner).
4. Click **Load unpacked** and select the `extension` folder.
5. Pin the extension, log in with your Stremio account, and enjoy!

### 🦊 Firefox
Load the `extension-firefox` folder at `about:debugging#/runtime/this-firefox`.

## 🔐 Privacy & Security

- **No Passwords Stored**: Your Stremio credentials are used once to fetch an `authKey`.
- **Local Storage Only**: All your data, library cache, and settings are saved securely and locally on your browser using `chrome.storage.local`.
- **No Analytics**: We do not track your library, searches, or web activity.

## ⚠️ Disclaimer

**StremioHub is an unofficial, community-built extension.** It is not affiliated with, endorsed by, or officially connected to the Stremio team.

## 📋 Changelog

### v1.5.0 — Custom Fonts & Auto Updates
- ✅ **Custom Font Upload**: Upload and apply your own fonts (.ttf, .woff, .woff2) directly to Stremio Web UI.
- ✅ **Addon Update Checker**: Automatically check for newer versions of installed Stremio addons every 24 hours.
- ✅ **Manual Updates Support**: Update complex addons securely while preserving configurations.
- ✅ **Firefox Stability**: Fixed bugs where the file picker closed the extension popup in Firefox.
- ✅ **Translation**: Full English & Arabic localization for the new features.

### v1.4.2
- Fix OLED theme black background issue on video player control bar in Stremio Web
- Fix custom Thmanyah font rendering in Stremio Web and native subtitles
- Add dynamic version display in popup settings
- Remove unnecessary `tabs` permission from manifest for better privacy

### v1.4.0 — Stremio Web Enhancer & Multi-Account
- ✅ Customize Stremio Web with a deep OLED black theme
- ✅ Inject custom typography (Arabic/English fonts) into Stremio Web UI & Subtitles
- ✅ Change Stremio Web's default accent color to your favorite color
- ✅ Inject Community Ratings (Rotten Tomatoes, Metacritic, Letterboxd) via MDBList/PublicMetaDB
- ✅ Account Switcher: save multiple Stremio accounts and switch with one click
- ✅ Custom Avatars: assign awesome avatars to your saved accounts

### v1.3.0 — Addon Manager
- ✅ Full addon management panel (install, remove, reorder, sync)
- ✅ Per-addon catalog editing (rename, hide/show catalogs)
- ✅ Drag & drop addon reordering
- ✅ Backup & restore addon configuration as JSON
- ✅ Auto silent backup before destructive actions
- ✅ Manual refresh button to reload addons from server
- ✅ Account-aware: addon list resets on account switch
- ✅ Full Arabic & English localization for all new UI
- ✅ Ported to Firefox extension

### v1.2.3
- State persistence across popup sessions
- Firefox port improvements

<br>
<div align="center">
  <p>Made with love for the Stremio community 🍿 by <b>Yasser</b></p>
</div>
