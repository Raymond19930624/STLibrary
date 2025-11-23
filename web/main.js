let allModels = [];
let lastHash = "";

function tokenize(q) {
  return q
    .toLowerCase()
    .trim()
    .split(/[\s,，]+/)
    .filter((t) => t.length > 0);
}

function matches(model, query) {
  const name = String(model.name || "").toLowerCase();
  const tags = Array.isArray(model.tags) ? model.tags.map((t) => String(t).toLowerCase()) : [];
  if (!query) return true;
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  return tokens.every((t) => {
    if (name.includes(t)) return true;
    return tags.some((tg) => tg.includes(t));
  });
}

function render(models) {
  const root = document.getElementById("cards");
  root.innerHTML = "";
  for (const m of models) {
    const card = document.createElement("div");
    card.className = "card";
    card.id = `card-${m.id}`;

    const thumb = document.createElement("div");
    thumb.className = "thumb";
    const img = document.createElement("img");
    img.src = `images/${m.id}.jpg`;
    img.alt = m.name;
    img.addEventListener("click", () => {
      const lb = document.getElementById("lightbox");
      const lbImg = document.getElementById("lightbox-img");
      lbImg.src = `images/${m.id}.jpg`;
      lb.classList.add("show");
    });
    thumb.appendChild(img);

    const title = document.createElement("div");
    title.className = "title";
    title.textContent = m.name;

    const overlay = document.createElement("div");
    overlay.className = "overlay";
    const tags = document.createElement("div");
    tags.className = "tags";
    for (const t of m.tags || []) {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tags.appendChild(span);
    }
    overlay.appendChild(tags);

    const actions = document.createElement("div");
    actions.className = "actions";
    const a = document.createElement("a");
    a.href = m.downloadUrl;
    a.target = "_blank";
    a.rel = "noopener";
    a.className = "btn";
    a.textContent = "下載";
    actions.appendChild(a);

    thumb.appendChild(overlay);
    card.appendChild(thumb);
    card.appendChild(title);
    card.appendChild(actions);
    root.appendChild(card);
  }
}

async function fetchModels() {
  const res = await fetch("models.json?_=" + Date.now(), { cache: "no-store" });
  const data = await res.json();
  const hash = JSON.stringify(data);
  if (hash !== lastHash) {
    lastHash = hash;
    allModels = data;
    const q = document.getElementById("search").value;
    const filtered = allModels.filter((m) => matches(m, q));
    render(filtered);
  }
}

async function init() {
  await fetchModels();
  setInterval(fetchModels, 5000);
}

document.getElementById("search").addEventListener("input", (e) => {
  const q = e.target.value;
  const filtered = allModels.filter((m) => matches(m, q));
  render(filtered);
});

init();

document.getElementById("lightbox").addEventListener("click", () => {
  const lb = document.getElementById("lightbox");
  lb.classList.remove("show");
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    const lb = document.getElementById("lightbox");
    lb.classList.remove("show");
  }
});