# DhakaFlix Nuvio Provider (BDIX)

A native **Nuvio JS Provider** repository for the **DhakaFlix BDIX** media server cluster, reverse-engineered and ported from the official Kotlin `BdixDhakaFlix` CloudStream extension.

Designed for 100% compatibility with **NuvioTV** (Android TV / Google TV) and **NuvioMobile** (Android & iOS) running on **Hermes** and **QuickJS** JavaScript engines.

---

## 🚀 Quick Setup: Load into Nuvio

### 1. Copy Manifest URL
Copy the direct raw link to `manifest.json`:
```text
https://raw.githubusercontent.com/sujon28113/nuvio-bdix-plugin/main/manifest.json
```

### 2. Add to Nuvio
1. Launch **Nuvio** on your TV or mobile device.
2. Open **Settings** > **Plugins** (or **Content & Discovery** > **Plugins**).
3. Tap **Add Plugin / Repository** and paste your raw `manifest.json` URL.
4. Tap **Add / Refresh**.
5. Enable **DhakaFlix** and prioritize it at the top of your provider list.

---

## 🎯 Architecture & DhakaFlix Reverse-Engineering

### 1. Active DhakaFlix Server Cluster

DhakaFlix partitions its media library across multiple dedicated BDIX servers running `h5ai` (HTML5 Apache Index):

| Server | Base URL | Root Identifier | Content Category | Supported Media |
|---|---|---|---|---|
| **DhakaFlix 14** | `http://172.16.50.14` | `DHAKA-FLIX-14` | English Movies (1080p), Hindi, South Indian, Animation, Korean TV & Web Series | `movie`, `tv` |
| **DhakaFlix 12** | `http://172.16.50.12` | `DHAKA-FLIX-12` | TV & Web Series (Alphabetical partitions: `0—9`, `A—L`, `M—R`, `S—Z`) | `tv` |
| **DhakaFlix 7** | `http://172.16.50.7` | `DHAKA-FLIX-7` | English Movies (1080p), 3D Movies, Foreign Language Movies (Japanese, Korean, Bangla, Pakistani, Kolkata Bangla, Chinese) | `movie` |
| **DhakaFlix 9** | `http://172.16.50.9` | `DHAKA-FLIX-9` | Anime & Cartoon TV Series, Korean TV & Web Series, Documentaries, Awards & TV Specials, WWE & AEW Wrestling | `movie`, `tv` |

> [!NOTE]
> DhakaFlix servers operate over Bangladesh Internet Exchange (BDIX) peering networks. Your device or ISP must have access to BDIX routes (or a mapped BDIX proxy/VPN) to reach these private IP ranges (`172.16.50.x`).

---

### 2. Search & Directory API Protocol

#### Search API (`POST`)
DhakaFlix exposes an `h5ai` JSON search API:
- **Endpoint:** `POST ${server.mainUrl}/${server.serverName}/` (e.g. `http://172.16.50.14/DHAKA-FLIX-14/`)
- **Headers:**
  ```http
  Content-Type: application/json
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  Referer: http://172.16.50.14/DHAKA-FLIX-14/
  ```
- **Payload:**
  ```json
  {
    "action": "get",
    "search": {
      "href": "/DHAKA-FLIX-14/",
      "pattern": "Deadpool",
      "ignorecase": true
    }
  }
  ```
- **Response Format:**
  ```json
  {
    "search": [
      {
        "href": "/DHAKA-FLIX-14/English Movies (1080p)/(2024) 1080p/Deadpool & Wolverine (2024)/",
        "size": null,
        "managed": true,
        "fetched": true,
        "time": 1722000000
      },
      {
        "href": "/DHAKA-FLIX-14/.../Deadpool.and.Wolverine.2024.1080p.mkv",
        "size": 3481928410
      }
    ]
  }
  ```
  - `size === null`: Represents a directory/folder.
  - `typeof size === "number"`: Represents a direct playable file.

#### Directory Listing (`GET`)
When a directory href is returned:
- Request: `GET ${server.mainUrl}${folderHref}`
- Parsed via pure, lightweight regex without heavy DOM or Cheerio dependencies:
  - Folders: `<td class="fb-i"><img alt="folder"...></td><td class="fb-n"><a href="...">`
  - Video Files: `a[href]` matching `\.(mkv|mp4|m4v|avi|webm)`

---

### 3. URL Normalization & Encoding Rules

BDIX FTP and HTTP file paths frequently contain spaces, parentheses, brackets, and hash symbols (e.g., `/# TV SHOWS/`). Standard native video players (ExoPlayer on Android, KSPlayer on iOS) crash or reject unencoded paths, while naive `encodeURI()` can lead to invalid character sequences or double-encoding bugs (`%20` becoming `%2520`).

Our custom URL normalizer (`normalizeStreamUrl`):
1. **Decodes first:** Calls `decodeURIComponent` on each segment to eliminate double-encoding.
2. **Encodes strictly:** Encodes spaces to `%20`, brackets `[` / `]` to `%5B` / `%5D`, parentheses `(` / `)` to `%28` / `%29`, and hashes `#` to `%23`.
3. **Preserves path delimiters:** Splits and rejoins along `/`, maintaining absolute protocol origin.

---

### 4. TV Season & Episode Matching Logic

For TV series queries:
1. **Show Directory Match:** Matches show folder by title while rejecting false positives (e.g. distinguishing *"Dark"* from *"The Dark Knight"*).
2. **Season Folder Match:** Matches subfolders using `/(?:season|series|s)\s*0*(\d+)/i` or ordinal fallback indices.
3. **Episode Match:**
   - Multi-pattern filename matching: `S01E05`, `1x05`, `EP05`, `Episode 5`, or isolated digits.
   - Ordered index fallback inside verified season folders.

---

## ⚙️ TMDB API Key Configuration

DhakaFlix searches media by title and year, whereas Nuvio provides numeric TMDB IDs. The plugin uses TMDB v3 API to resolve `tmdbId` to canonical title metadata.

Open `src/bdix-dhakaflix/constants.js` (or `src/bdix-dhakaflix/index.js`) and configure your key:

```javascript
// Replace with your personal v3 API Key from https://www.themoviedb.org/settings/api
export const TMDB_API_KEY = "YOUR_TMDB_API_KEY_HERE";
```

> [!TIP]
> If left unconfigured, the provider includes an automatic fallback to the community key from the original CloudStream extension (`e6333b32409e02a4a6eba6fb7ff866bb`) to ensure out-of-the-box testing works seamlessly.

---

## 🛠️ Build & Development Workflow

### Requirements
- Node.js v18+ (tested on Node v20 & v24)
- npm v9+

### Commands

```bash
# 1. Install devDependencies (esbuild)
npm install

# 2. Build for Hermes / QuickJS (transpiles src/ -> providers/bdix-dhakaflix.js)
npm run build

# 3. Build minified for production release
npm run build:min

# 4. Run full test suite (18 unit & integration tests)
npm test
```

---

## 📱 Hermes & QuickJS Runtime Safeguards

| Constraint | Solution Implemented |
|---|---|
| **No Node.js built-ins** | Zero usage of `fs`, `path`, `crypto`, `http`, `url`, or `buffer`. Global `fetch()` and pure regex only. |
| **Hermes Async Limitation** | `build.js` uses `esbuild` with `target: 'es2016'`, transpiling `async/await` into generator functions (`__async` with `yield`). |
| **No Unhandled Rejections** | All network calls are wrapped in timeouts and try/catch blocks; returns `[]` on error or timeout. |
| **Schema Strictness** | Returns an array of compliant stream objects matching Nuvio's exact specification: |

```json
[
  {
    "name": "DhakaFlix",
    "title": "[DhakaFlix 14] Deadpool and Wolverine 2024 [1080p] [Dual Audio | HEVC]",
    "url": "http://172.16.50.14/DHAKA-FLIX-14/English%20Movies%20%281080p%29/%282024%29%201080p/Deadpool%20and%20Wolverine%202024%201080p.mkv",
    "quality": "1080p",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Referer": "http://172.16.50.14/"
    }
  }
]
```

---

## 📂 Repository Structure

```text
.
├── .github/
│   └── workflows/
│       └── build.yml             # GitHub Actions CI build and test runner
├── assets/
│   └── icon.jpg                  # DhakaFlix icon (from CloudStream extension)
├── src/
│   └── bdix-dhakaflix/
│       ├── constants.js          # Server definitions, timeouts, default headers
│       ├── h5ai.js               # DhakaFlix h5ai search API & HTML regex parser
│       ├── index.js              # Entry point: getStreams(tmdbId, mediaType, season, episode)
│       ├── tmdb.js               # TMDB v3 API title & metadata resolver
│       └── utils.js              # URL encoder, title cleaners, quality parser
├── providers/
│   └── bdix-dhakaflix.js         # Compiled, Hermes/QuickJS-safe bundle (ready for Nuvio)
├── build.js                      # esbuild build and transpilation script
├── manifest.json                 # Nuvio repository manifest (compatible with NuvioTV & Mobile)
├── package.json                  # npm scripts & devDependencies
├── test.js                       # Comprehensive automated test suite
├── .gitignore                    # Excludes node_modules, temp files, and logs
└── README.md                     # Documentation & setup instructions
```

---

## 📜 License & Credits

- Ported from [Redowan-CloudStream](https://github.com/redowan99/Redowan-CloudStream) by Redowan.
- Provider template & runtime schema based on [nuvio-providers](https://github.com/yoruix/nuvio-providers) and [cb-providers](https://github.com/SA7ANI/cb-providers).
- Licensed under **GPL-3.0**.
