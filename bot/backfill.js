const fs = require("fs");
const path = require("path");
const axios = require("axios");

function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return def; } }

const root = __dirname;
const config = readJson(path.join(root, "config.json"), {});
const token = config.BOT_TOKEN;
const webDir = path.resolve(root, "..", "web");
const imagesDir = path.join(webDir, "images");
const filesDir = path.join(webDir, "files");
const webModelsPath = path.join(webDir, "models.json");

async function getFileUrl(fileId) {
  const apiBase = `https://api.telegram.org/bot${token}`;
  const info = await axios.get(`${apiBase}/getFile`, { params: { file_id: fileId } });
  const filePath = info.data.result.file_path;
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

async function fetchTo(fileId, dest) {
  const url = await getFileUrl(fileId);
  const resp = await axios.get(url, { responseType: "arraybuffer" });
  fs.writeFileSync(dest, resp.data);
}

(async function main(){
  if (!token) return;
  const models = readJson(webModelsPath, []);
  fs.mkdirSync(webDir, { recursive: true });
  fs.mkdirSync(imagesDir, { recursive: true });
  fs.mkdirSync(filesDir, { recursive: true });
  for (const m of models) {
    try {
      const imgPath = path.join(imagesDir, `${m.id}.jpg`);
      if (!fs.existsSync(imgPath) && m.file_id_image) await fetchTo(m.file_id_image, imgPath);
    } catch {}
    try {
      const direct = m.directUrl || "";
      const fname = direct ? path.basename(direct) : (m.name || `${m.id}`);
      const dir = path.join(filesDir, m.id);
      const dest = path.join(dir, fname);
      fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(dest) && m.file_id_doc) await fetchTo(m.file_id_doc, dest);
    } catch {}
  }
})();
