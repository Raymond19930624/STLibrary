const fs = require("fs");
const path = require("path");

function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return def; } }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }

const root = __dirname;
const modelsPath = path.join(root, "models.json");
const webDir = path.resolve(root, "..", "web");
const webModelsPath = path.join(webDir, "models.json");
const imagesDir = path.join(webDir, "images");
const filesDir = path.join(webDir, "files");

function max(a, b) { return (a || 0) > (b || 0) ? a : b; }

function msgIdFromUrl(u) {
  if (!u) return null;
  try {
    const parts = String(u).split("/");
    const last = parts[parts.length - 1];
    const n = parseInt(last, 10);
    return Number.isFinite(n) ? n : null;
  } catch { return null; }
}

function dedupe(models) {
  const byDocMsg = new Map();
  for (const m of models) {
    const mid = m.doc_message_id || msgIdFromUrl(m.downloadUrl);
    const key = mid || `__no_doc__:${m.file_id_doc || m.id}`;
    const prev = byDocMsg.get(key);
    if (!prev || (max(m.photo_message_id, mid) >= max(prev.photo_message_id, prev.doc_message_id || msgIdFromUrl(prev.downloadUrl)))) {
      byDocMsg.set(key, m);
    }
  }
  const stage1 = Array.from(byDocMsg.values());

  const byFileId = new Map();
  for (const m of stage1) {
    const key = m.file_id_doc || `__no_doc__:${m.id}`;
    const prev = byFileId.get(key);
    if (!prev || (max(m.photo_message_id, m.doc_message_id) >= max(prev.photo_message_id, prev.doc_message_id))) {
      byFileId.set(key, m);
    }
  }
  const stage2 = Array.from(byFileId.values());

  const byId = new Map();
  for (const m of stage2) {
    const key = m.id;
    const prev = byId.get(key);
    if (!prev || (max(m.photo_message_id, m.doc_message_id) >= max(prev.photo_message_id, prev.doc_message_id))) {
      byId.set(key, m);
    }
  }
  return Array.from(byId.values());
}

function setDiff(a, b, proj) {
  const setB = new Set(b.map(proj));
  return a.filter((x) => !setB.has(proj(x)));
}

(function main(){
  const models = readJson(modelsPath, []);
  const cleaned = dedupe(models);
  const removed = setDiff(models, cleaned, (x) => `${x.id}|${x.file_id_doc||""}|${x.doc_message_id||""}`);
  writeJson(modelsPath, cleaned);
  writeJson(webModelsPath, cleaned);

  for (const r of removed) {
    try {
      const stillExists = cleaned.find((m) => m.id === r.id);
      if (!stillExists) {
        const img = path.join(imagesDir, `${r.id}.jpg`);
        const dir = path.join(filesDir, r.id);
        if (fs.existsSync(img)) fs.unlinkSync(img);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {}
  }
})();