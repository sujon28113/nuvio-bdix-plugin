/**
 * Media Release Metadata Parser for NuvioTV & NuvioMobile
 *
 * Lightweight, zero-dependency, QuickJS/Hermes-safe pure-JS parser.
 * Extracts resolution, source, video codec, bit depth, HDR, audio codec,
 * channels, languages, and formatted file size from file paths and URLs.
 *
 * Strict Hermes / QuickJS constraints:
 * - Linear, non-backtracking regular expressions
 * - Zero Node.js built-ins
 * - ES2016-safe logic
 */

import { cleanFileName, nameFromUrl } from "./utils.js";

/**
 * Parses any size input (integer bytes, "2818704 KB", "850 MB", "2.45 GB", etc.)
 * into an integer number of bytes.
 *
 * @param {number|string|null|undefined} sizeInput
 * @returns {number|null} Integer byte count or null
 */
export function parseSizeToBytes(sizeInput) {
  if (typeof sizeInput === "number" && !isNaN(sizeInput) && sizeInput > 0) {
    return Math.round(sizeInput);
  }
  if (typeof sizeInput !== "string") return null;

  const clean = sizeInput.trim().replace(/,/g, "");
  const match = clean.match(/^([0-9.]+)\s*([KMGT]?B?)$/i);
  if (!match) return null;

  const val = parseFloat(match[1]);
  if (isNaN(val) || val <= 0) return null;

  const unit = (match[2] || "").toUpperCase();

  if (unit === "TB" || unit === "T") {
    return Math.round(val * 1024 * 1024 * 1024 * 1024);
  }
  if (unit === "GB" || unit === "G") {
    return Math.round(val * 1024 * 1024 * 1024);
  }
  if (unit === "MB" || unit === "M") {
    return Math.round(val * 1024 * 1024);
  }
  if (unit === "KB" || unit === "K") {
    return Math.round(val * 1024);
  }

  // Raw byte string if larger than 100,000
  if (val > 100000) {
    return Math.round(val);
  }

  return null;
}

/**
 * Formats an integer byte count into a standard human-readable string.
 * e.g., 2818704212 -> "2.63 GB", 911069242 -> "869 MB", 500000 -> "488 KB".
 *
 * @param {number|null|undefined} bytes
 * @returns {string|null}
 */
export function formatBytes(bytes) {
  if (typeof bytes !== "number" || isNaN(bytes) || bytes <= 0) return null;

  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    const formatted = gb >= 10 ? gb.toFixed(1) : gb.toFixed(2);
    return `${parseFloat(formatted)} GB`;
  }

  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${Math.round(mb)} MB`;
  }

  const kb = bytes / 1024;
  return `${Math.round(kb)} KB`;
}

/**
 * Parses release metadata from file path/URL and optional size string/bytes.
 *
 * @param {string} filePathOrUrl
 * @param {number|string|null} [sizeInput=null]
 * @returns {object} Extracted metadata
 */
export function parseMediaMetadata(filePathOrUrl, sizeInput = null) {
  let fullPath = filePathOrUrl || "";
  try {
    fullPath = decodeURIComponent(fullPath);
  } catch (e) {}

  const rawFileName = nameFromUrl(fullPath);
  const searchStr = fullPath.toLowerCase();
  const fileStr = rawFileName.toLowerCase();

  // ---------------------------------------------------------------------------
  // 1. Resolution
  // ---------------------------------------------------------------------------
  let resolution = "HD";
  if (/\b(2160p|4k|uhd)\b/i.test(searchStr)) {
    resolution = "4K";
  } else if (/\b(1080p|1080i|fhd)\b/i.test(searchStr)) {
    resolution = "1080p";
  } else if (/\b(720p)\b/i.test(searchStr)) {
    resolution = "720p";
  } else if (/\b(480p|576p|sd)\b/i.test(searchStr)) {
    resolution = "480p";
  } else if (/\b(cam|hdcam|telesync|tc)\b/i.test(searchStr)) {
    resolution = "CAM";
  }

  // ---------------------------------------------------------------------------
  // 2. Source
  // ---------------------------------------------------------------------------
  let source = null;
  if (/\b(remux|bdremux)\b/i.test(fileStr)) {
    source = "REMUX";
  } else if (/\b(bluray|blu[- ]ray|bdrip|brrip)\b/i.test(fileStr)) {
    source = "BluRay";
  } else if (/\b(web[- ]dl|webdl|amzn[- ]web|nf[- ]web|dsnp[- ]web|hmax[- ]web)\b/i.test(fileStr)) {
    source = "WEB-DL";
  } else if (/\b(webrip|web[- ]rip)\b/i.test(fileStr)) {
    source = "WEBRip";
  } else if (/\b(hdrip|hdtv)\b/i.test(fileStr)) {
    source = "HDRip";
  } else if (/\b(dvdrip|dvd[- ]rip|dvd)\b/i.test(fileStr)) {
    source = "DVDRip";
  } else if (/\b(cam|hdcam|telesync)\b/i.test(fileStr)) {
    source = "CAM";
  }

  // ---------------------------------------------------------------------------
  // 3. Video Codec
  // ---------------------------------------------------------------------------
  let videoCodec = null;
  if (/\b(av1|av01)\b/i.test(fileStr)) {
    videoCodec = "AV1";
  } else if (/\b(x265|h265|h\.265|hevc)\b/i.test(fileStr)) {
    videoCodec = "HEVC (x265)";
  } else if (/\b(x264|h264|h\.264|avc)\b/i.test(fileStr)) {
    videoCodec = "H.264 (x264)";
  } else if (/\b(vp9)\b/i.test(fileStr)) {
    videoCodec = "VP9";
  } else if (/\b(xvid|divx)\b/i.test(fileStr)) {
    videoCodec = "XviD";
  }

  // ---------------------------------------------------------------------------
  // 4. Bit Depth & HDR
  // ---------------------------------------------------------------------------
  let bitDepth = null;
  if (/\b(10bit|10[- ]bit)\b/i.test(fileStr)) {
    bitDepth = "10bit";
  } else if (/\b(8bit|8[- ]bit)\b/i.test(fileStr)) {
    bitDepth = "8bit";
  }

  const hdrParts = [];
  if (/\b(dv|dovi|dolby[- ]vision)\b/i.test(fileStr)) {
    hdrParts.push("DV");
  }
  if (/\b(hdr10\+|hdr10plus\b)/i.test(fileStr)) {
    hdrParts.push("HDR10+");
  } else if (/\b(hdr10\b)/i.test(fileStr)) {
    hdrParts.push("HDR10");
  } else if (/\b(hdr\b)/i.test(fileStr)) {
    hdrParts.push("HDR");
  }
  if (/\b(hlg\b)/i.test(fileStr)) {
    hdrParts.push("HLG");
  }

  const hdr = hdrParts.length > 0 ? hdrParts.join(" ") : null;

  let bitDepthHdr = null;
  const bdhArray = [];
  if (bitDepth) bdhArray.push(bitDepth);
  if (hdr) bdhArray.push(hdr);
  if (bdhArray.length > 0) {
    bitDepthHdr = bdhArray.join(" ");
  }

  // ---------------------------------------------------------------------------
  // 5. Audio Codec & Channels
  // ---------------------------------------------------------------------------
  let audioCodec = null;
  const isAtmos = /\b(atmos)\b/i.test(fileStr);

  if (/\b(truehd|true[- ]hd)\b/i.test(fileStr)) {
    audioCodec = "TrueHD";
  } else if (/\b(dts[- ]?hd[- .]?ma|dtshd)\b/i.test(fileStr)) {
    audioCodec = "DTS-HD MA";
  } else if (/\b(dts[- :x]x)\b/i.test(fileStr)) {
    audioCodec = "DTS-X";
  } else if (/\b(dts)\b/i.test(fileStr)) {
    audioCodec = "DTS";
  } else if (/\b(ddp\b|dd\+|ddplus\b|eac3\b|e[- ]ac[- ]?3\b)/i.test(fileStr)) {
    audioCodec = "DDP";
  } else if (/\b(dd\b|ac3\b|ac[- ]3\b|dolby[- ]digital)\b/i.test(fileStr)) {
    audioCodec = "DD";
  } else if (/\b(flac)\b/i.test(fileStr)) {
    audioCodec = "FLAC";
  } else if (/\b(opus)\b/i.test(fileStr)) {
    audioCodec = "Opus";
  } else if (/\b(aac)\b/i.test(fileStr)) {
    audioCodec = "AAC";
  } else if (/\b(mp3)\b/i.test(fileStr)) {
    audioCodec = "MP3";
  }

  let channels = null;
  if (/\b(7\.1|7ch|8ch)\b/i.test(fileStr)) {
    channels = "7.1";
  } else if (/\b(5\.1|6ch)\b/i.test(fileStr)) {
    channels = "5.1";
  } else if (/\b(2\.0|2ch|stereo)\b/i.test(fileStr)) {
    channels = "2.0";
  }

  let audio = null;
  if (audioCodec) {
    const parts = [audioCodec];
    if (channels) parts.push(channels);
    if (isAtmos) parts.push("Atmos");
    audio = parts.join(" ");
  } else if (isAtmos) {
    audio = channels ? `Dolby Atmos ${channels}` : "Dolby Atmos";
  } else if (channels) {
    audio = channels;
  }

  // ---------------------------------------------------------------------------
  // 6. Audio Languages / Tracks (Searches Full Path + Filename)
  // ---------------------------------------------------------------------------
  const isDual = /\b(dual[- ]audio|dual)\b/i.test(searchStr);
  const isMulti = /\b(multi[- ]audio|multi)\b/i.test(searchStr);

  const detectedLangs = [];
  if (/\b(hindi|hin)\b/i.test(searchStr)) detectedLangs.push("Hindi");
  if (/\b(english|eng)\b/i.test(searchStr)) detectedLangs.push("English");
  if (/\b(bengali|bangla|ben|kolkata)\b/i.test(searchStr)) detectedLangs.push("Bengali");
  if (/\b(tamil|tam)\b/i.test(searchStr)) detectedLangs.push("Tamil");
  if (/\b(telugu|tel)\b/i.test(searchStr)) detectedLangs.push("Telugu");
  if (/\b(malayalam|mal)\b/i.test(searchStr)) detectedLangs.push("Malayalam");
  if (/\b(korean|kor)\b/i.test(searchStr)) detectedLangs.push("Korean");
  if (/\b(japanese|jap|jpn)\b/i.test(searchStr)) detectedLangs.push("Japanese");
  if (/\b(spanish|spa)\b/i.test(searchStr)) detectedLangs.push("Spanish");
  if (/\b(french|fre)\b/i.test(searchStr)) detectedLangs.push("French");

  let languages = null;
  if (isDual) {
    languages =
      detectedLangs.length > 0
        ? `Dual Audio (${detectedLangs.join(", ")})`
        : "Dual Audio";
  } else if (isMulti) {
    languages =
      detectedLangs.length > 0
        ? `Multi Audio (${detectedLangs.join(", ")})`
        : "Multi Audio";
  } else if (detectedLangs.length > 0) {
    languages = detectedLangs.join(", ");
  }

  // ---------------------------------------------------------------------------
  // 7. Size Parsing & Formatting
  // ---------------------------------------------------------------------------
  const sizeBytes = parseSizeToBytes(sizeInput);
  let formattedSize = null;
  if (sizeBytes) {
    formattedSize = formatBytes(sizeBytes);
  } else if (typeof sizeInput === "string" && sizeInput.trim()) {
    formattedSize = sizeInput.trim();
  }

  return {
    resolution,
    source,
    videoCodec,
    bitDepth,
    hdr,
    bitDepthHdr,
    audio,
    audioCodec,
    channels,
    isAtmos,
    languages,
    filename: cleanFileName(rawFileName),
    sizeBytes,
    formattedSize
  };
}

/**
 * Formats a clean, scannable multi-line title for NuvioTV streams.
 *
 * Line 1 (Video): [Server] <Resolution> <Source> • <VideoCodec> <BitDepth/HDR>
 * Line 2 (Audio & Size): 🔊 <Audio> • <Languages> • 💾 <Size>
 * Line 3 (Filename): Clean decoded filename
 *
 * @param {object} meta - Result of parseMediaMetadata
 * @param {string} [serverName=null] - Optional server name (e.g. "DhakaFlix 14")
 * @returns {string} Formatted multi-line title
 */
export function formatStreamTitle(meta, serverName = null) {
  // Line 1: Video details
  const videoParts = [];
  let resSource = meta.resolution || "HD";
  if (meta.source) {
    resSource += ` ${meta.source}`;
  }
  videoParts.push(resSource);

  let codecStr = meta.videoCodec || "";
  if (meta.bitDepthHdr) {
    codecStr = codecStr ? `${codecStr} ${meta.bitDepthHdr}` : meta.bitDepthHdr;
  }
  if (codecStr) {
    videoParts.push(codecStr);
  }

  const prefix = serverName ? `[${serverName}] ` : "";
  const line1 = prefix + videoParts.join(" • ");

  // Line 2: Audio, Languages & Size
  const line2Parts = [];
  if (meta.audio) {
    line2Parts.push(`🔊 ${meta.audio}`);
  }
  if (meta.languages) {
    line2Parts.push(meta.languages);
  }
  if (meta.formattedSize) {
    line2Parts.push(`💾 ${meta.formattedSize}`);
  }
  const line2 = line2Parts.join(" • ");

  // Line 3: Clean decoded filename
  const line3 = meta.filename || "";

  // Assemble lines without dangling bullets or blank lines
  const lines = [line1];
  if (line2) lines.push(line2);
  if (line3) lines.push(line3);

  return lines.join("\n");
}

/**
 * Smart stream sorter:
 * 1. Resolution: 4K (40) > 1080p (30) > 720p (20) > 480p (10) > HD (15) > CAM (1)
 * 2. Source quality: REMUX (6) > BluRay (5) > WEB-DL (4) > WEBRip (3) > HDRip (2) > DVDRip (1)
 * 3. File size: larger file size first
 *
 * @param {Array<object>} streams
 * @returns {Array<object>}
 */
export function sortStreams(streams) {
  if (!Array.isArray(streams) || streams.length <= 1) return streams || [];

  const resRank = {
    "4K": 40,
    "1080p": 30,
    "720p": 20,
    "HD": 15,
    "480p": 10,
    "CAM": 1
  };

  const sourceRank = {
    "REMUX": 6,
    "BluRay": 5,
    "WEB-DL": 4,
    "WEBRip": 3,
    "HDRip": 2,
    "DVDRip": 1
  };

  return streams.slice().sort((a, b) => {
    // 1. Resolution
    const aRes = resRank[a.quality] || 0;
    const bRes = resRank[b.quality] || 0;
    if (bRes !== aRes) return bRes - aRes;

    // 2. Source Quality
    const aMeta = a._meta;
    const bMeta = b._meta;
    const aSource = (aMeta && sourceRank[aMeta.source]) || 0;
    const bSource = (bMeta && sourceRank[bMeta.source]) || 0;
    if (bSource !== aSource) return bSource - aSource;

    // 3. File Size (larger file first)
    const aSize = (a.behaviorHints && a.behaviorHints.videoSize) || 0;
    const bSize = (b.behaviorHints && b.behaviorHints.videoSize) || 0;
    if (bSize !== aSize) return bSize - aSize;

    return 0;
  });
}
