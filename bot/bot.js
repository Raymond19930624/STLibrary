const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "config.json");
const webDir = path.resolve(__dirname, "..", "web");
const webModelsPath = path.join(webDir, "models.json");
const imagesDir = path.join(webDir, "images");
const filesDir = path.join(webDir, "files");

function readJson(p, def) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    return def;
  }
}

function writeJson(p, obj) {
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
}

function stripExt(s){
  return String(s || "").replace(/\.[a-z0-9]+$/i, "");
}

function slugify(name) {
  return String(name || "").toLowerCase().replace(/\.[a-z0-9]+$/i, "").replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

function parseCaption(caption, fallbackName) {
  const result = { name: fallbackName || "", tags: [] };
  if (!caption) {
    return result;
  }
  const lines = String(caption).split(/\r?\n/);
  for (const line of lines) {
    const mName = line.match(/^\s*name:\s*(.+)$/i);
    if (mName) {
      result.name = mName[1].trim();
      continue;
    }
    const mTags = line.match(/^\s*tags:\s*(.+)$/i);
    if (mTags) {
      result.tags = mTags[1]
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      continue;
    }
  }
  if (!result.name) {
    result.name = fallbackName || "";
  }
  return result;
}

function largestPhoto(photos) {
  if (!Array.isArray(photos) || photos.length === 0) return null;
  let best = photos[0];
  for (const p of photos) {
    const score = (p.width || 0) * (p.height || 0);
    const bestScore = (best.width || 0) * (best.height || 0);
    if (score > bestScore) best = p;
  }
  return best;
}

async function getAllUpdates(apiBase, offset) {
  const all = [];
  let next = offset || 0;
  while (true) {
    const res = await axios.get(`${apiBase}/getUpdates`, {
      params: { offset: next, timeout: 30, allowed_updates: ["channel_post","message"] }
    });
    if (!res.data || !res.data.ok) break;
    const arr = res.data.result || [];
    if (arr.length === 0) break;
    all.push(...arr);
    next = arr[arr.length - 1].update_id + 1;
  }
  return { updates: all, nextOffset: next };
}

function normalizeMessage(update) {
  return update.channel_post || update.message || null;
}

function buildDownloadUrl(chat, messageId) {
  let cid = String(chat && chat.id);
  if (cid.startsWith("-100")) cid = cid.slice(4);
  return `https://t.me/c/${cid}/${messageId}`;
}

async function downloadImage(apiBase, token, fileId, destPath) {
  const info = await axios.get(`${apiBase}/getFile`, { params: { file_id: fileId } });
  if (!info.data || !info.data.ok) return false;
  const filePath = info.data.result.file_path;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const resp = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(destPath, resp.data);
  return true;
}

async function downloadDocument(apiBase, token, fileId, destPath) {
  const info = await axios.get(`${apiBase}/getFile`, { params: { file_id: fileId } });
  if (!info.data || !info.data.ok) return null;
  const filePath = info.data.result.file_path;
  const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
  const resp = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(destPath, resp.data);
  return destPath;
}

async function tgDelete(apiBase, chatId, messageId) {
  try {
    const res = await axios.post(`${apiBase}/deleteMessage`, { chat_id: chatId, message_id: messageId });
    return res.data && res.data.ok;
  } catch { return false; }
}

// Polling configuration for CI environments
// Read from env at module scope as defaults; loop will capture fresh values
const defaultPollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 3000);
const defaultExitAfterMs = Number(process.env.EXIT_AFTER_MS || 0);

async function run() {
  const config = readJson(configPath, {});
  const token = process.env.BOT_TOKEN || config.BOT_TOKEN;
  const channelId = process.env.CHANNEL_ID ? Number(process.env.CHANNEL_ID) : config.CHANNEL_ID;
  const offset = config.LAST_UPDATE_ID || 0;
  const runContinuous = (process.env.RUN_CONTINUOUS ? process.env.RUN_CONTINUOUS === "true" : !!config.RUN_CONTINUOUS);
  const apiBase = `https://api.telegram.org/bot${token}`;

  if (!token || !channelId) return;

  fs.mkdirSync(webDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });

  const { updates, nextOffset } = await getAllUpdates(apiBase, offset);
  const docMap = new Map();
  const photoList = [];
  for (const u of updates) {
    const m = normalizeMessage(u);
    if (!m || !m.chat || m.chat.id !== channelId) continue;
    if (m.document) docMap.set(m.message_id, m);
    if (m.photo && m.reply_to_message) photoList.push(m);
  }

  let models = readJson(webModelsPath, []);
  for (const pm of photoList) {
    const replied = pm.reply_to_message;
    const baseDoc = docMap.get(replied.message_id) || replied;
    const repliedId = replied && replied.message_id;
    let baseHasDoc = !!(baseDoc && baseDoc.document);

    const captionSource = pm.caption || (baseDoc && baseDoc.caption) || (replied && replied.caption) || "";
    const parsed = parseCaption(captionSource, baseHasDoc ? stripExt(baseDoc.document.file_name || "") : "");
    let id = slugify(parsed.name);
    if (!id) id = String(baseHasDoc ? baseDoc.message_id : repliedId);
    let exists = baseHasDoc
      ? models.find((m) => m.file_id_doc === baseDoc.document.file_id || m.doc_message_id === baseDoc.message_id)
      : models.find((m) => m.doc_message_id === repliedId || m.photo_message_id === repliedId);
    const duplicateIdx = [];
    for (let i = 0; i < models.length; i++) {
      const mm = models[i];
      if (
        mm.file_id_doc === baseDoc.document.file_id ||
        mm.doc_message_id === baseDoc.message_id ||
        (!baseHasDoc && mm.photo_message_id === repliedId) ||
        mm.id === id
      ) duplicateIdx.push(i);
    }
    if (!exists && duplicateIdx.length > 0) exists = models[duplicateIdx[0]];

    const bestPhoto = largestPhoto(pm.photo) || null;
    if (!bestPhoto) continue;

    const downloadUrl = buildDownloadUrl((baseHasDoc ? (baseDoc.chat) : pm.chat) || pm.chat, baseHasDoc ? baseDoc.message_id : repliedId);

    const fileName = baseHasDoc ? (baseDoc.document.file_name || `${id}`) : (exists && exists.directUrl ? path.basename(exists.directUrl) : `${id}`);
    const fileDir = path.join(filesDir, id);
    const fileDest = path.join(fileDir, fileName);
    fs.mkdirSync(fileDir, { recursive: true });

    const imgDest = path.join(imagesDir, `${id}.jpg`);

    if (!exists) {
      if (!baseHasDoc) continue;
      const slugConflict = models.find((m) => m.id === id && m.file_id_doc !== baseDoc.document.file_id);
      if (slugConflict) id = `${id}-${baseDoc.message_id}`;
      const entry = {
        id,
        name: parsed.name,
        tags: parsed.tags,
        file_id_doc: baseDoc.document.file_id,
        file_id_image: bestPhoto.file_id,
        doc_message_id: baseDoc.message_id,
        photo_message_id: pm.message_id,
        downloadUrl,
        directUrl: `files/${id}/${fileName}`
      };
      models.push(entry);
    } else {
      const oldId = exists.id;
      const newId = oldId;
      const prevDoc = exists.doc_message_id || null;
      const prevPhoto = exists.photo_message_id || null;

      if (parsed.name) {
        exists.name = parsed.name;
      }
      if (Array.isArray(parsed.tags) && parsed.tags.length) {
        exists.tags = parsed.tags;
      }
      exists.file_id_image = bestPhoto.file_id;
      exists.doc_message_id = exists.doc_message_id || baseDoc.message_id;
      exists.photo_message_id = pm.message_id;

      const existingDirect = exists.directUrl || "";
      const currentFileName = existingDirect ? path.basename(existingDirect) : fileName;
      if (baseHasDoc) {
        exists.file_id_doc = baseDoc.document.file_id;
        exists.doc_message_id = baseDoc.message_id;
      }
      exists.photo_message_id = pm.message_id;
      exists.downloadUrl = downloadUrl;
      exists.directUrl = `files/${newId}/${currentFileName}`;

      for (let i = models.length - 1; i >= 0; i--) {
        if (models[i] !== exists && (models[i].file_id_doc === exists.file_id_doc || models[i].doc_message_id === exists.doc_message_id)) {
          models.splice(i, 1);
        }
      }

      if (token && channelId && prevDoc && baseHasDoc && prevDoc !== baseDoc.message_id) {
        await tgDelete(apiBase, channelId, prevDoc);
      }
      if (token && channelId && prevPhoto && prevPhoto !== pm.message_id) {
        await tgDelete(apiBase, channelId, prevPhoto);
      }
    }

    try { await downloadImage(apiBase, token, bestPhoto.file_id, imgDest); } catch (e) {}

    try {
      if (baseHasDoc && !fs.existsSync(fileDest)) {
        await downloadDocument(apiBase, token, baseDoc.document.file_id, fileDest);
      }
    } catch (e) {}
  }

  if (!(process.env.NO_WRITE_WEB_MODELS === "true")) {
    writeJson(webModelsPath, models);
  }

  const newConfig = { ...config, LAST_UPDATE_ID: nextOffset };
  writeJson(configPath, newConfig);

  for (const m of models) {
    try {
      // Normalize downloadUrl to channel id format to be rename-proof
      const cid = String(channelId).startsWith("-100") ? String(channelId).slice(4) : String(channelId);
      if (m && m.doc_message_id) {
        m.downloadUrl = `https://t.me/c/${cid}/${m.doc_message_id}`;
      }
    } catch {}
    try {
      const imgPath = path.join(imagesDir, `${m.id}.jpg`);
      if (m.file_id_image) {
        await downloadImage(apiBase, token, m.file_id_image, imgPath);
      }
    } catch {}
    try {
      const direct = m.directUrl || "";
      const fname = direct ? path.basename(direct) : (m.name || `${m.id}`);
      const dir = path.join(filesDir, m.id);
      const dest = path.join(dir, fname);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(dest) && m.file_id_doc) {
        await downloadDocument(apiBase, token, m.file_id_doc, dest);
      }
    } catch {}
  }
}

const cfg = readJson(configPath, {});
if (cfg.RUN_CONTINUOUS || (process.env.RUN_CONTINUOUS && process.env.RUN_CONTINUOUS === "true")) {
  (async function loop(){
    const start = Date.now();
    const maxMs = Number(process.env.EXIT_AFTER_MS || defaultExitAfterMs || 0);
    const intervalMs = Number(process.env.POLL_INTERVAL_MS || defaultPollIntervalMs || 3000);
    while (true) {
      try { await run(); } catch {}
      if (maxMs && (Date.now() - start) >= maxMs) break;
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  })();
} else {
  run();
}
