const fs = require("fs");
const path = require("path");

function readJson(p, def) { try { return JSON.parse(fs.readFileSync(p, "utf-8")); } catch { return def; } }
function writeJson(p, obj) { fs.writeFileSync(p, JSON.stringify(obj, null, 2)); }
function slugify(name) { return String(name||"").toLowerCase().replace(/\.[a-z0-9]+$/i,"").replace(/[\s_]+/g,"-").replace(/[^a-z0-9-]/g,"").replace(/-+/g,"-").replace(/^-|-$/g,""); }

function arg(key){ const i=process.argv.indexOf(`--${key}`); if(i!==-1 && i+1<process.argv.length) return process.argv[i+1]; return null; }

const root = __dirname;
const modelsPath = path.join(root, "models.json");
const webDir = path.resolve(root, "..", "web");
const webModelsPath = path.join(webDir, "models.json");
const imagesDir = path.join(webDir, "images");
const filesDir = path.join(webDir, "files");

(function main(){
  const id = arg("id");
  const name = arg("name");
  const tagsStr = arg("tags") || "";
  if(!id || !name) return;

  let models = readJson(modelsPath, []);
  if (!Array.isArray(models) || models.length === 0) {
    models = readJson(webModelsPath, []);
  }
  const m = models.find((x)=>x.id===id);
  if(!m) return;

  const newName = name.trim();
  const newTags = tagsStr.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
  const newId = id;

  const oldImg = path.join(imagesDir, `${m.id}.jpg`);
  const newImg = path.join(imagesDir, `${newId}.jpg`);
  const oldDir = path.join(filesDir, m.id);
  const newDir = path.join(filesDir, newId);

  try { if (fs.existsSync(oldImg) && m.id!==newId) fs.renameSync(oldImg, newImg); } catch {}
  try { if (fs.existsSync(oldDir) && m.id!==newId) fs.renameSync(oldDir, newDir); } catch {}

  m.name = newName;
  m.tags = newTags.length ? newTags : m.tags;
  m.id = newId;
  if (m.directUrl) {
    const fname = path.basename(m.directUrl);
    m.directUrl = `files/${newId}/${fname}`;
  }

  writeJson(modelsPath, models);
  writeJson(webModelsPath, models);
})();
