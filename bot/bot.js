const fs = require("fs");
const path = require("path");
const axios = require("axios");

const configPath = path.join(__dirname, "config.json");
const modelsPath = path.join(__dirname, "models.json");
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
      params: { offset: next, timeout: 30 }
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
  const username = chat && chat.username;
  if (username) return `https://t.me/${username}/${messageId}`;
  let cid = String(chat.id);
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

const pollIntervalMs = Number(process.env.POLL_INTERVAL_MS || 3000);
const exitAfterMs = Number(process.env.EXIT_AFTER_MS || 0);

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

  const models = readJson(modelsPath, []);
  for (const pm of photoList) {
    const replied = pm.reply_to_message;
    const baseDoc = docMap.get(replied.message_id) || replied;
    if (!baseDoc || !baseDoc.document) continue;

    const captionSource = pm.caption || baseDoc.caption || replied.caption || "";
    const parsed = parseCaption(captionSource, baseDoc.document.file_name || "");
    let id = slugify(parsed.name);
    if (!id) id = String(baseDoc.message_id);
    let exists = models.find((m) => m.file_id_doc === baseDoc.document.file_id || m.doc_message_id === baseDoc.message_id);
    const duplicateIdx = [];
    for (let i = 0; i < models.length; i++) {
      const mm = models[i];
      if (
        mm.file_id_doc === baseDoc.document.file_id ||
        mm.doc_message_id === baseDoc.message_id ||
        mm.id === id
      ) duplicateIdx.push(i);
    }
    if (!exists && duplicateIdx.length > 0) exists = models[duplicateIdx[0]];

    const bestPhoto = largestPhoto(pm.photo) || null;
    if (!bestPhoto) continue;

    const downloadUrl = buildDownloadUrl(baseDoc.chat || pm.chat, baseDoc.message_id);

    const fileName = baseDoc.document.file_name || `${id}`;
    const fileDir = path.join(filesDir, id);
    const fileDest = path.join(fileDir, fileName);
    fs.mkdirSync(fileDir, { recursive: true });

    const imgDest = path.join(imagesDir, `${id}.jpg`);

    if (!exists) {
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
      const newId = slugify(parsed.name) || oldId;
      exists.name = parsed.name || exists.name;
      exists.tags = parsed.tags && parsed.tags.length ? parsed.tags : exists.tags;
      exists.file_id_image = bestPhoto.file_id;
      exists.doc_message_id = exists.doc_message_id || baseDoc.message_id;
      exists.photo_message_id = pm.message_id;

      if (newId !== oldId) {
        try {
          const oldImg = path.join(imagesDir, `${oldId}.jpg`);
          const newImg = path.join(imagesDir, `${newId}.jpg`);
          if (fs.existsSync(oldImg)) fs.renameSync(oldImg, newImg);
        } catch (e) {}
        try {
          const oldDir = path.join(filesDir, oldId);
          const newDir = path.join(filesDir, `${newId}`);
          if (fs.existsSync(oldDir)) fs.renameSync(oldDir, newDir);
        } catch (e) {}
        exists.id = newId;
      }

      const existingDirect = exists.directUrl || "";
      const currentFileName = existingDirect ? path.basename(existingDirect) : fileName;
      exists.file_id_doc = baseDoc.document.file_id;
      exists.doc_message_id = baseDoc.message_id;
      exists.photo_message_id = pm.message_id;
      exists.downloadUrl = downloadUrl;
      exists.directUrl = `files/${exists.id}/${currentFileName}`;

      for (let i = models.length - 1; i >= 0; i--) {
        if (models[i] !== exists && (models[i].file_id_doc === exists.file_id_doc || models[i].doc_message_id === exists.doc_message_id)) {
          models.splice(i, 1);
        }
      }
    }

    try {
      await downloadImage(apiBase, token, bestPhoto.file_id, imgDest);
    } catch (e) {}

    try {
      if (!fs.existsSync(fileDest)) {
        await downloadDocument(apiBase, token, baseDoc.document.file_id, fileDest);
      }
    } catch (e) {}
  }

  writeJson(modelsPath, models);
  if (!(process.env.NO_WRITE_WEB_MODELS === "true")) {
    writeJson(webModelsPath, models);
  }

  const newConfig = { ...config, LAST_UPDATE_ID: nextOffset };
  writeJson(configPath, newConfig);

  for (const m of models) {
    try {
      const imgPath = path.join(imagesDir, `${m.id}.jpg`);
      if (!fs.existsSync(imgPath) && m.file_id_image) {
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
    while (true) {
      try { await run(); } catch {}
      if (exitAfterMs && (Date.now() - start) >= exitAfterMs) break;
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
  })();
} else {
  run();
}