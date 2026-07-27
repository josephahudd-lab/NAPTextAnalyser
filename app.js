/* ============================================================
   National Adaptation Report Analyser — Multi-Report Comparison
   ============================================================
   TABLE OF CONTENTS
   ─────────────────
   1. Config & State .............. Constants, defaults, state vars
   2. Init & Categories .......... DOMContentLoaded, category CRUD
   3. API Key & Status ........... Key management, status badges
   4. Event Listeners ............ All UI event bindings
   5. File Management ............ Add/remove files, dropzone
   6. Text Extraction ............ PDF (parallel) & DOCX extraction
   7. Text Cleaning .............. Whitespace, headers, page nums
   8. Analysis Workflow .......... runAllAnalyses orchestrator
   9. Gemini API Calls ........... Single report & comparison
  10. Local Keyword Engine ....... BM25, fuzzy match, heuristics
  11. Results & Rendering ........ Tabs, donut, accordions, text
  12. Comparison View ............ Grouped bars, matrix, insights
  13. Facts Database ............. Table, filters, edit, delete
  14. Export Functions ........... JSON, CSV, download helper
  15. Utilities .................. esc(), cleanId(), icons(), toast()
   ============================================================ */

(function () {
  'use strict';

// PDF.js worker
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";
}

// ── Toast Notification System ────────────────────────────────
function toast(message, type = "info", durationMs = 3000) {
  const container = document.getElementById("toast-container");
  if (!container) { console.warn("toast:", message); return; }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    el.addEventListener("animationend", () => el.remove());
  }, durationMs);
}

// ── Default Categories ───────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name: "Water Security & Flooding", desc: "Floods, sea level rise, droughts, water supply, reservoir storage, catchment management, drainage, 홍수, 가뭄, 해수면 상승, 저수지, 하천관리, 배수, alluvioni, inondazioni, siccità, bacini idrici, drenaggio, inundaciones, sequía, embalses, drenaje." },
  { name: "Agriculture & Food Security", desc: "Crop resilience, soil conservation, livestock health, farm subsidies, food supply chain stability, 농업, 식량, 토양, 보조금, 공급망, 가축, agricoltura, sicurezza alimentare, suolo, sussidi agricoli, catena alimentari, agricultura, seguridad alimentaria, suelo, subsidios agrícolas, cadena de suministro." },
  { name: "Infrastructure & Built Environment", desc: "Seawalls, grid stability, public transport, road repair, cooling centres, resilient housing, urban heat islands, 인프라, 대중교통, 전력망, 무더위 쉼터, 도시열섬, 방파제, 방조제, infrastrutture, trasporto pubblico, reti elettriche, centri raffreddamento, abitazioni, infraestructuras, transporte público, red eléctrica, viviendas." },
  { name: "Nature-Based Solutions & Ecosystems", desc: "Reforestation, wetland restoration, biodiversity, green corridors, coastal dune management, peatland recovery, 생태계, 조림, 재림화, 습지, 생물다양성, 녹지축, 조경, 사구, ecosistemi, riforestazione, zone umide, biodiversità, corridoi ecologici, ecosistemas, reforestación, humedales, biodiversidad, corredores ecológicos." },
  { name: "Public Health & Emergency Response", desc: "Heatwave warnings, vector-borne diseases, hospital resilience, disaster evacuation plans, clean air shelters, 보건, 재난, 대피, 감염병, 병원, 폭염 경보, 무더위, salute pubblica, emergenze, allerta calore, evacuazione, salute, salud pública, emergencias, ola de calor, evacuación, resiliencia hospitalaria." },
  { name: "Governance, Policy & Finance", desc: "Adaptation funds, local council plans, climate risk disclosures, weather insurance schemes, national target alignment, 거버넌스, 지자체, 적응 기금, 예산, 제도, 법률, 연계, governance, politiche, finanza, fondi adattamento, enti locali, assicurazioni, gobernanza, políticas, financiación, fondos adaptación, municipios, seguros." }
];

const THEME_COLORS = [
  "#1d4e89","#2d6a4f","#1b6565","#1a6b7c","#9b4d0f","#5c5c52","#6366f1","#a855f7","#db2777","#0891b2"
];

// ── State ────────────────────────────────────────────────────
let reports = [];          // { id, file, countryLabel, extractedText, results }
let categories = [];
let comparisonResults = null;
let activeTab = "single";
let selectedReportIdx = 0;
let idCounter = 0;
let analysisMode = "ai";   // "ai" or "keyword"
let allFacts = [];          // Global array for editable facts database
let taxonomySchema = "themes"; // "themes" or "policy_matrix"
let thematicCategoriesBackup = []; // Backup user themes

const MATRIX_CATEGORIES = [
  { name: "Physical/technological", desc: "infrastructure, sea walls, flood defence, concrete, building standards, cooling systems, engineering, 물리적, 기술적, 인프라, 치수, 방재시설, 건축기준, 냉방, fisico, tecnologico, infrastrutture, difesa alluvioni, calcestruzzo, ingegneria, físico, tecnológico, infraestructuras, hormigón, ingeniería." },
  { name: "Ecosystem (nature-based)", desc: "nature, tree planting, reforestation, wetlands, green space, dunes, restore, biodiversity, 생태계, 자연기반, 식목, 조림, 습지, 녹지, 생물다양성, 복원, ecosistemico, natura, riforestazione, zone umide, spazi verdi, biodiversità, ecosistémico, naturaleza, reforestación, humedales, espacios verdes, biodiversidad." },
  { name: "Knowledge and behavioural", desc: "education, warning systems, awareness, information campaigns, training, guidelines, advice, 지식, 행동적, 교육, 조기경보, 인식제고, 훈련, 가이드라인, conoscenza, comportamentale, istruzione, allarme, formazione, linee guida, conocimiento, conductual, educación, sistemas alerta, formación, directrices." },
  { name: "Governance/institutional", desc: "local council, legislation, framework, national target, regulations, planning permissions, task force, 거버넌스, 제도적, 지자체, 입법, 법안, 기본계획, 규제, 허가, governance, istituzionale, enti locali, legislazione, regolamenti, permessi, gobernanza, institucional, ayuntamientos, legislación, reglamentos." },
  { name: "Economic/financial", desc: "grant, funding, subsidy, tax incentive, climate insurance, budget, financial support, cost, 경제적, 재정적, 보조금, 지원금, 재정, 예산, 금융지원, 비용, economico, finanziario, contributi, finanziamenti, sussidio, bilancio, costo, económico, financiero, subvención, financiación, subsidio, presupuesto, coste." }
];

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  try {
    initCategories();
    initAPIKey();
    setupEventListeners();
    updateAPIKeyStatus();
    if (window.lucide) window.lucide.createIcons();
  } catch (err) {
    console.error("Startup error:", err);
    document.body.insertAdjacentHTML("afterbegin",
      `<div style="background:#b91c1c;color:#fff;padding:1rem 2rem;font-family:system-ui;font-size:0.85rem;position:fixed;top:0;left:0;right:0;z-index:99999;">
        <b>⚠ App failed to start:</b> ${err.message}. Check the browser console (F12) for details.
      </div>`);
  }
});

// ── Categories ───────────────────────────────────────────────
function initCategories() {
  const s = localStorage.getItem("ara_categories");
  try { thematicCategoriesBackup = s ? JSON.parse(s) : [...DEFAULT_CATEGORIES]; }
  catch { thematicCategoriesBackup = [...DEFAULT_CATEGORIES]; }
  
  if (taxonomySchema === "policy_matrix") {
    categories = [...MATRIX_CATEGORIES];
  } else {
    categories = [...thematicCategoriesBackup];
  }
  renderCategoriesList();
}
function saveCategories() {
  if (taxonomySchema === "themes") {
    thematicCategoriesBackup = [...categories];
    localStorage.setItem("ara_categories", JSON.stringify(thematicCategoriesBackup));
  }
  renderCategoriesList();
}
function renderCategoriesList() {
  const c = document.getElementById("categories-list");
  const form = document.getElementById("add-category-form");
  const resetBtn = document.getElementById("reset-categories-btn");
  const cardTitle = document.querySelector(".categories-card h3");
  const cardDesc = document.querySelector(".categories-card .field-desc");
  if (!c) return;
  c.innerHTML = "";
  
  const isMatrix = (taxonomySchema === "policy_matrix");
  if (form) form.style.display = isMatrix ? "none" : "flex";
  if (resetBtn) resetBtn.style.display = isMatrix ? "none" : "block";

  if (cardTitle) {
    cardTitle.innerHTML = isMatrix ? `<i data-lucide="settings"></i> Target Measure Types` : `<i data-lucide="settings"></i> Target Themes to Classify`;
  }
  if (cardDesc) {
    cardDesc.innerHTML = isMatrix ? 
      `Scan matches these measure types. <b>Double-click any description</b> to edit its keywords. Exclude sentences using negative prefix (e.g. <code>-rotation</code>).` :
      `Classifies text based on these topics. <b>Double-click any description</b> to edit its keywords. Exclude sentences using negative prefix (e.g. <code>-rotation</code>).`;
  }

  categories.forEach((cat, i) => {
    const liveCount = getLiveMatchCountForCategory(cat.desc);
    const countBadge = (liveCount !== null) ? 
      `<span class="badge" style="font-size:0.65rem; font-weight:600; padding:2px 6px; background:var(--primary-bg); color:var(--primary); border-radius:10px; margin-left:0.5rem; text-transform:none;">${liveCount} matches</span>` : "";

    const d = document.createElement("div");
    d.className = "category-item";
    d.innerHTML = `<div class="category-item-text">
                     <div style="display:flex; align-items:center;">
                       <div class="category-item-title">${esc(cat.name)}</div>
                       ${countBadge}
                     </div>
                     <div class="category-item-desc editable-cat-desc" data-i="${i}" title="Double-click to edit keywords" style="cursor: pointer; border-bottom: 1px dashed var(--rule-dk); padding-bottom: 2px;">${esc(cat.desc)}</div>
                   </div>` + 
                  (isMatrix ? "" : `<button class="btn-icon category-delete-btn" data-i="${i}" title="Delete"><i data-lucide="x"></i></button>`);
    c.appendChild(d);
  });
  
  // Bind double click edit
  c.querySelectorAll(".editable-cat-desc").forEach(el => {
    el.addEventListener("dblclick", function() {
      if (this.querySelector("input")) return;
      const idx = +this.dataset.i;
      const originalDesc = categories[idx].desc;
      this.innerHTML = "";
      const inp = document.createElement("input");
      inp.type = "text";
      inp.value = originalDesc;
      inp.style.width = "100%";
      inp.style.fontSize = "0.72rem";
      inp.style.padding = "2px 4px";
      inp.style.border = "1px solid var(--primary)";
      inp.style.borderRadius = "3px";
      inp.style.background = "#fff";
      
      this.appendChild(inp);
      inp.focus();
      
      const saveCatDesc = () => {
        const val = inp.value.trim();
        categories[idx].desc = val;
        saveCategories();
      };
      
      inp.addEventListener("blur", saveCatDesc);
      inp.addEventListener("keydown", e => {
        if (e.key === "Enter") { e.preventDefault(); inp.blur(); }
        if (e.key === "Escape") { inp.value = originalDesc; inp.blur(); }
      });
    });
  });

  if (!isMatrix) {
    c.querySelectorAll(".category-delete-btn").forEach(b => b.addEventListener("click", e => {
      categories.splice(+e.currentTarget.dataset.i, 1); saveCategories(); icons();
    }));
  }
}

// ── API Key ──────────────────────────────────────────────────
function initAPIKey() {
  const k = localStorage.getItem("ara_key");
  const i = document.getElementById("api-key-input");
  if (k && i) i.value = k;
  const m = localStorage.getItem("ara_model") || "gemini-3.5-flash";
  const s = document.getElementById("api-model-select");
  if (s) s.value = m;
  const d = localStorage.getItem("ara_api_delay") || "12000";
  const ds = document.getElementById("api-delay-select");
  if (ds) ds.value = d;
  const g = localStorage.getItem("ara_ai_guidance") || "";
  const gi = document.getElementById("ai-guidance-input");
  if (gi && g) gi.value = g;
}
function updateAPIKeyStatus() {
  const k = localStorage.getItem("ara_key");
  const b = document.getElementById("api-status-badge");
  const a = document.getElementById("analyse-all-btn");

  const guidanceCard = document.getElementById("ai-guidance-card");
  if (guidanceCard) guidanceCard.style.display = (analysisMode === "ai") ? "block" : "none";

  // Determine whether key/mode conditions are met
  let canRun = false;
  if (analysisMode === "keyword") {
    if (b) { b.textContent = "Not Required"; b.className = "badge badge-success"; }
    canRun = true;
  } else {
    if (k && k.trim().length > 10) {
      if (b) { b.textContent = "Key Set"; b.className = "badge badge-success"; }
      canRun = true;
    } else {
      if (b) { b.textContent = "Missing Key"; b.className = "badge badge-warning"; }
      canRun = false;
    }
  }

  // Always update the button — independent of whether the badge element exists
  if (a) a.disabled = !(canRun && reports.length > 0);
}

// ── Event Listeners ──────────────────────────────────────────
function setupEventListeners() {
  const dz = document.getElementById("dropzone");
  const fi = document.getElementById("file-input");

  // Analysis Mode Toggles
  const btnAI = document.getElementById("mode-btn-ai");
  const btnKeyword = document.getElementById("mode-btn-keyword");
  const apiCard = document.getElementById("api-key-card");

  btnAI?.addEventListener("click", () => {
    analysisMode = "ai";
    btnAI.className = "btn btn-primary btn-sm active";
    btnAI.style.background = "var(--primary)";
    btnAI.style.color = "#fff";
    btnAI.style.border = "none";
    btnKeyword.className = "btn btn-outline btn-sm";
    btnKeyword.style.background = "transparent";
    btnKeyword.style.color = "var(--ink-3)";
    btnKeyword.style.border = "none";
    if (apiCard) apiCard.style.opacity = "1";
    updateAPIKeyStatus();
  });

  btnKeyword?.addEventListener("click", () => {
    analysisMode = "keyword";
    btnKeyword.className = "btn btn-primary btn-sm active";
    btnKeyword.style.background = "var(--primary)";
    btnKeyword.style.color = "#fff";
    btnKeyword.style.border = "none";
    btnAI.className = "btn btn-outline btn-sm";
    btnAI.style.background = "transparent";
    btnAI.style.color = "var(--ink-3)";
    btnAI.style.border = "none";
    if (apiCard) apiCard.style.opacity = "0.6";
    updateAPIKeyStatus();
  });

  // Browse / drop
  dz?.addEventListener("click", e => {
    if (e.target.id === "file-input") return;
    fi.click();
  });
  fi?.addEventListener("change", e => { [...e.target.files].forEach(f => addFile(f)); fi.value = ""; });
  dz?.addEventListener("dragover", e => { e.preventDefault(); dz.classList.add("hovering"); });
  dz?.addEventListener("dragleave", () => dz.classList.remove("hovering"));
  dz?.addEventListener("drop", e => { e.preventDefault(); dz.classList.remove("hovering"); [...e.dataTransfer.files].forEach(f => addFile(f)); });

  // API config
  document.getElementById("save-key-btn")?.addEventListener("click", () => {
    localStorage.setItem("ara_key", document.getElementById("api-key-input").value.trim());
    const ms = document.getElementById("api-model-select");
    if (ms) localStorage.setItem("ara_model", ms.value);
    const ds = document.getElementById("api-delay-select");
    if (ds) localStorage.setItem("ara_api_delay", ds.value);
    updateAPIKeyStatus();
    toast("Settings saved.", "success");
  });
  document.getElementById("api-model-select")?.addEventListener("change", e => {
    localStorage.setItem("ara_model", e.target.value);
  });
  document.getElementById("api-delay-select")?.addEventListener("change", e => {
    localStorage.setItem("ara_api_delay", e.target.value);
  });
  document.getElementById("ai-guidance-input")?.addEventListener("input", e => {
    localStorage.setItem("ara_ai_guidance", e.target.value);
  });

  // Categories
  document.getElementById("reset-categories-btn")?.addEventListener("click", () => {
    if (confirm("Reset themes to default?")) { categories = [...DEFAULT_CATEGORIES]; saveCategories(); icons(); }
  });
  document.getElementById("add-category-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const n = document.getElementById("new-category-name"), d = document.getElementById("new-category-desc");
    if (n.value.trim() && d.value.trim()) { categories.push({ name: n.value.trim(), desc: d.value.trim() }); saveCategories(); n.value = ""; d.value = ""; icons(); }
  });

  // Taxonomy schema button toggle listeners
  const btnThemes = document.getElementById("schema-btn-themes");
  const btnMatrix = document.getElementById("schema-btn-matrix");

  function applySchemaToggle(schema) {
    taxonomySchema = schema;
    const isMatrix = schema === "policy_matrix";
    if (btnThemes) {
      btnThemes.className = isMatrix ? "btn btn-outline btn-sm" : "btn btn-primary btn-sm active";
      btnThemes.style.background = isMatrix ? "transparent" : "var(--primary)";
      btnThemes.style.color = isMatrix ? "var(--ink-3)" : "#fff";
      btnThemes.style.border = "none";
    }
    if (btnMatrix) {
      btnMatrix.className = isMatrix ? "btn btn-primary btn-sm active" : "btn btn-outline btn-sm";
      btnMatrix.style.background = isMatrix ? "var(--primary)" : "transparent";
      btnMatrix.style.color = isMatrix ? "#fff" : "var(--ink-3)";
      btnMatrix.style.border = "none";
    }
    initCategories();
    reports.forEach(r => r.results = null);
    allFacts = [];
    resetViews();
  }

  btnThemes?.addEventListener("click", () => applySchemaToggle("themes"));
  btnMatrix?.addEventListener("click", () => applySchemaToggle("policy_matrix"));

  // File list actions
  document.getElementById("clear-all-btn")?.addEventListener("click", () => { reports = []; renderFileList(); resetViews(); allFacts = []; });
  document.getElementById("analyse-all-btn")?.addEventListener("click", () => runAllAnalyses());

  // Tab bar
  document.querySelectorAll(".tab-btn").forEach(btn => btn.addEventListener("click", () => switchTab(btn.dataset.tab)));

  // Report selector
  document.getElementById("report-selector")?.addEventListener("change", e => { selectedReportIdx = +e.target.value; displaySingleReport(); });

  // Retry
  document.getElementById("retry-btn")?.addEventListener("click", () => runAllAnalyses());

  // Exports
  document.getElementById("export-report-btn")?.addEventListener("click", exportSingleJSON);
  document.getElementById("export-comparison-btn")?.addEventListener("click", exportComparisonCSV);
  document.getElementById("export-facts-csv-btn")?.addEventListener("click", exportFactsCSV);
  document.getElementById("export-facts-json-btn")?.addEventListener("click", exportFactsJSON);
  document.getElementById("map-metric-select")?.addEventListener("change", renderChoroplethMap);
  ["map-title-input", "map-subtitle-input", "map-legend-title-input"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", renderChoroplethMap);
  });
  document.getElementById("map-scale-type-select")?.addEventListener("change", renderChoroplethMap);
  document.getElementById("map-color-scheme-select")?.addEventListener("change", renderChoroplethMap);
  document.getElementById("export-map-svg-btn")?.addEventListener("click", exportMapSVG);
  document.getElementById("export-map-png-btn")?.addEventListener("click", exportMapPNG);
  document.getElementById("export-map-all-png-btn")?.addEventListener("click", exportAllMapImages);

  // Text search
  document.getElementById("text-search-input")?.addEventListener("input", e => renderExtractedText(e.target.value));

  // Facts filters
  ["facts-search-input","facts-country-filter","facts-theme-filter","facts-type-filter"].forEach(id => {
    document.getElementById(id)?.addEventListener("input", renderFactsTable);
    document.getElementById(id)?.addEventListener("change", renderFactsTable);
  });

  // Custom facts note creation listeners
  document.getElementById("add-fact-note-btn")?.addEventListener("click", () => {
    const card = document.getElementById("add-fact-note-form-card");
    if (card) {
      if (card.style.display === "none") {
        const cc = document.getElementById("new-fact-country");
        const tc = document.getElementById("new-fact-theme");
        if (cc) cc.innerHTML = reports.map(r => `<option>${esc(r.countryLabel)}</option>`).join("");
        if (tc) tc.innerHTML = categories.map(c => `<option>${esc(c.name)}</option>`).join("");
        card.style.display = "block";
      } else {
        card.style.display = "none";
      }
    }
  });

  ["close-add-fact-btn", "cancel-add-fact-btn"].forEach(id => {
    document.getElementById(id)?.addEventListener("click", () => {
      const card = document.getElementById("add-fact-note-form-card");
      if (card) card.style.display = "none";
    });
  });

  document.getElementById("add-fact-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const country = document.getElementById("new-fact-country").value;
    const theme = document.getElementById("new-fact-theme").value;
    const type = document.getElementById("new-fact-type").value;
    const descInput = document.getElementById("new-fact-desc");
    const quoteInput = document.getElementById("new-fact-quote");
    
    const newFact = {
      id: `fact-manual-${Date.now()}`,
      country,
      theme,
      type,
      description: descInput.value.trim(),
      quote: quoteInput.value.trim()
    };
    
    allFacts.unshift(newFact);
    descInput.value = "";
    quoteInput.value = "";
    document.getElementById("add-fact-note-form-card").style.display = "none";
    renderFactsTable();
  });

  // Profile theme filter listener
  document.getElementById("matrix-profile-theme-filter")?.addEventListener("change", function() {
    const r = reports[selectedReportIdx];
    if (r) renderPolicyDimensionsProfile(r.countryLabel, this.value);
  });
}

// ── File Management ──────────────────────────────────────────
function addFile(file) {
  const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
  if (ext !== ".pdf" && ext !== ".docx") { toast("Only PDF and DOCX files are supported.", "error"); return; }
  if (file.size > 150 * 1024 * 1024) { toast("File too large (max 150MB).", "error"); return; }

  // Guess country from filename
  const nameClean = file.name.replace(/[-_\.]/g, " ").replace(/\.(pdf|docx)$/i, "").trim();
  const country = guessCountry(nameClean);

  reports.push({ id: ++idCounter, file, countryLabel: country, extractedText: "", results: null });
  renderFileList();
  updateAPIKeyStatus();
  toast(`Added: ${file.name}`, "success", 2000);

  // Brief dropzone success flash
  const dz = document.getElementById("dropzone");
  if (dz) {
    dz.classList.add("file-added");
    setTimeout(() => dz.classList.remove("file-added"), 600);
  }
}

function guessCountry(name) {
  const countries = ["UK","United Kingdom","Germany","France","Ireland","Netherlands","Denmark","Sweden","Norway","Finland","Spain","Italy","Portugal","Austria","Belgium","Switzerland","Australia","Canada","Japan","USA","United States","New Zealand","Poland","Czech","Hungary","Greece","Romania","Bulgaria","Croatia","Estonia","Latvia","Lithuania","Luxembourg","Malta","Slovakia","Slovenia","Cyprus"];
  const lower = name.toLowerCase();
  for (const c of countries) { if (lower.includes(c.toLowerCase())) return c; }
  return name.substring(0, 30);
}

function renderFileList() {
  const container = document.getElementById("file-list-container");
  const list = document.getElementById("file-list");
  const analyseBtn = document.getElementById("analyse-all-btn");
  if (!container || !list) return;

  const dropzone = document.getElementById("dropzone");
  if (reports.length === 0) {
    container.style.display = "none";
    if (dropzone) dropzone.style.display = "flex";
    if (analyseBtn) analyseBtn.disabled = true;
    return;
  }

  // Hide the dropzone, show the file list
  if (dropzone) dropzone.style.display = "none";
  container.style.display = "block";
  list.innerHTML = "";

  reports.forEach((r, i) => {
    const d = document.createElement("div");
    d.className = "file-list-item";
    const sizeMB = (r.file.size / 1048576).toFixed(2);
    d.innerHTML = `
      <div class="file-list-item-info">
        <span class="file-list-item-name">${esc(r.file.name)}</span>
        <span class="file-list-item-size">${sizeMB} MB</span>
      </div>
      <input class="country-label-input" type="text" value="${esc(r.countryLabel)}" data-idx="${i}" placeholder="Country label">
      <button class="btn-icon" data-idx="${i}" title="Remove"><i data-lucide="trash-2"></i></button>
    `;
    list.appendChild(d);
  });

  // Bind events
  list.querySelectorAll(".country-label-input").forEach(inp => inp.addEventListener("change", e => {
    reports[+e.target.dataset.idx].countryLabel = e.target.value.trim();
  }));
  list.querySelectorAll(".btn-icon").forEach(btn => btn.addEventListener("click", e => {
    reports.splice(+e.currentTarget.dataset.idx, 1); renderFileList(); icons();
  }));

  updateAPIKeyStatus();
  icons();
}

function resetViews() {
  document.getElementById("status-empty").style.display = "block";
  document.getElementById("status-loading").style.display = "none";
  document.getElementById("status-error").style.display = "none";
  document.getElementById("tab-bar").hidden = true;
  document.getElementById("tab-single").style.display = "none";
  document.getElementById("tab-comparison").style.display = "none";
  document.getElementById("tab-facts").style.display = "none";
  comparisonResults = null;

  // Disable export buttons by default
  ["export-report-btn", "export-comparison-btn", "export-facts-csv-btn", "export-facts-json-btn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("disabled", "true");
  });
}

// ── Text Cleaning ────────────────────────────────────────────
function cleanText(raw) {
  let t = raw;
  // Collapse excessive whitespace / blank lines
  t = t.replace(/[ \t]+/g, " ");
  t = t.replace(/\n{3,}/g, "\n\n");
  // Remove standalone page numbers (lines that are just a number)
  t = t.replace(/^\s*\d{1,4}\s*$/gm, "");
  // Remove common header/footer patterns
  t = t.replace(/^\s*page\s+\d+\s*(of\s+\d+)?\s*$/gim, "");
  // Remove table-of-contents dot leaders
  t = t.replace(/\.{4,}/g, " ");
  // Trim each line
  t = t.split("\n").map(l => l.trim()).join("\n");
  // Final trim
  return t.trim();
}

// ── Text Extraction (Parallel) ───────────────────────────────
async function extractPDF(file, progressCb) {
  if (!window.pdfjsLib) throw new Error("PDF.js not loaded.");
  const ab = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: ab }).promise;
  const total = pdf.numPages;
  const startPage = parseInt(document.getElementById("page-start")?.value) || 1;
  const endPage = parseInt(document.getElementById("page-end")?.value) || total;
  const from = Math.max(1, Math.min(startPage, total));
  const to = Math.min(total, Math.max(from, endPage));
  const pageCount = to - from + 1;

  // Build array of page numbers to extract
  const pageNums = [];
  for (let i = from; i <= to; i++) pageNums.push(i);

  // Extract in parallel batches of 8 for speed
  const BATCH = 8;
  const results = new Array(pageNums.length);
  let done = 0;

  for (let b = 0; b < pageNums.length; b += BATCH) {
    const batch = pageNums.slice(b, b + BATCH);
    const texts = await Promise.all(batch.map(async (num) => {
      const page = await pdf.getPage(num);
      const tc = await page.getTextContent();
      return tc.items.map(x => x.str).join(" ");
    }));
    texts.forEach((t, j) => { results[b + j] = t; });
    done += texts.length;
    if (progressCb) progressCb(done, pageCount);
  }

  return results.join("\n");
}

async function extractDOCX(file) {
  if (!window.mammoth) throw new Error("Mammoth.js not loaded.");
  const ab = await file.arrayBuffer();
  return (await window.mammoth.extractRawText({ arrayBuffer: ab })).value;
}

// ── Analysis Workflow ────────────────────────────────────────
async function runAllAnalyses() {
  const apiKey = localStorage.getItem("ara_key");
  if (analysisMode === "ai") {
    if (!apiKey || apiKey.length < 10) { toast("Set a valid API key first.", "error"); return; }
  }
  if (!reports.length) return;

  // Show loading
  document.getElementById("status-empty").style.display = "none";
  document.getElementById("status-error").style.display = "none";
  document.getElementById("tab-bar").hidden = true;
  document.getElementById("tab-single").style.display = "none";
  document.getElementById("tab-comparison").style.display = "none";
  document.getElementById("tab-facts").style.display = "none";
  document.getElementById("status-loading").style.display = "block";

  try {
    const total = reports.length;
    for (let i = 0; i < total; i++) {
      const r = reports[i];
      progress(Math.floor((i / total) * 80), `Extracting ${r.countryLabel}`, `Reading ${r.file.name}…`);

      // Extract with per-page progress
      const ext = r.file.name.substring(r.file.name.lastIndexOf(".")).toLowerCase();
      const raw = ext === ".pdf"
        ? await extractPDF(r.file, (done, pageTotal) => {
            progress(Math.floor((i / total) * 80), `Extracting ${r.countryLabel}`, `Page ${done} of ${pageTotal}…`);
          })
        : await extractDOCX(r.file);
      r.extractedText = cleanText(raw);

      if (r.extractedText.length < 100) throw new Error(`No substantial text from ${r.file.name}. It may be scanned/image-only.`);

      if (analysisMode === "ai") {
        progress(Math.floor(((i + 0.5) / total) * 80), `Analysing ${r.countryLabel}`, "Sending to Gemini for classification...");
        r.results = await callGeminiAnalysis(r.extractedText, apiKey);
        if (i < total - 1) {
          const delayStr = localStorage.getItem("ara_api_delay") || "12000";
          const delay = parseInt(delayStr, 10);
          progress(Math.floor(((i + 0.5) / total) * 80), `Waiting (Rate Limiting)`, `Sleeping for ${Math.round(delay/1000)}s between requests...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      } else {
        progress(Math.floor(((i + 0.5) / total) * 80), `Analysing ${r.countryLabel}`, "Scanning local keywords...");
        r.results = runLocalKeywordAnalysis(r.extractedText);
      }
    }

    // Run comparison if multiple reports
    if (reports.length > 1) {
      if (analysisMode === "ai") {
        progress(85, "Generating Comparison", "Asking Gemini to compare reports with UK as baseline...");
        comparisonResults = await callGeminiComparison(apiKey);
      } else {
        progress(85, "Generating Comparison", "Calculating comparison matrix locally...");
        comparisonResults = runLocalKeywordComparison();
      }
    }

    progress(100, "Complete", "Rendering results...");
    showResults();
  } catch (err) {
    console.error(err);
    document.getElementById("status-loading").style.display = "none";
    document.getElementById("status-error").style.display = "block";
    document.getElementById("error-message").textContent = err.message;
  }
}

let pendingProgressUpdate = null;
function progress(pct, title, desc) {
  if (pendingProgressUpdate) cancelAnimationFrame(pendingProgressUpdate);
  pendingProgressUpdate = requestAnimationFrame(() => {
    const tEl = document.getElementById("loading-step-title");
    const dEl = document.getElementById("loading-step-desc");
    const pEl = document.getElementById("loading-progress-bar");
    if (tEl) tEl.textContent = title;
    if (dEl) dEl.textContent = desc;
    if (pEl) pEl.style.width = pct + "%";
    pendingProgressUpdate = null;
  });
}

// ── Gemini: Single Report Analysis ───────────────────────────
async function fetchWithRetry(url, options, retries = 5, backoff = 4000) {
  for (let i = 0; i < retries; i++) {
    const res = await fetch(url, options);
    if (res.status === 429 || res.status === 503 || res.status === 504) {
      const waitTime = backoff * Math.pow(2, i);
      console.warn(`Gemini Rate Limit Exceeded (429/503). Retrying in ${waitTime}ms...`);
      const descEl = document.getElementById("loading-step-desc");
      if (descEl) {
        descEl.innerHTML = `<span style="color:#b91c1c; font-weight:600;">Rate limit hit. Waiting ${Math.round(waitTime/1000)}s before retrying...</span>`;
      }
      await new Promise(resolve => setTimeout(resolve, waitTime));
      continue;
    }
    return res;
  }
  return fetch(url, options);
}

// ── Gemini: Single Report Analysis ───────────────────────────
async function callGeminiAnalysis(text, apiKey) {
  let clean = text;
  if (clean.length > 500000) clean = clean.substring(0, 500000) + "\n[TRUNCATED]";

  const themesList = categories.map((c, i) => `${i + 1}. "${c.name}" — ${c.desc}`).join("\n");

  let sys = "";
  const factProperties = {
    type: { type: "string", enum: ["Policy","Target","Financial","Organisation"] },
    description: { type: "string" },
    quote: { type: "string" }
  };
  const factRequired = ["type","description","quote"];

  if (taxonomySchema === "policy_matrix") {
    sys = `You are a climate adaptation policy expert. Analyze the provided National Adaptation Report text.
Extract a list of specific policies, targets, financial commitments, and adaptation measures mentioned in the report.
For EACH extracted measure/fact, you MUST classify it across the following 10 dimensions:
1. Type of Measure: one of "Physical/technological", "Ecosystem (nature-based)", "Knowledge and behavioural", "Governance/institutional", or "Economic/financial"
2. Timing of Measure: one of "Anticipatory" or "Reactive"
3. Depth of Change: one of "Transformational" or "Incremental"
4. Governance and Actor Level: one of "National/multi-level", "Local authority", or "Household/private sector"
5. Implementation Readiness: one of "Shovel-ready" or "Developmental"
6. Adaptability and Robustness: one of "Flexible/modular" or "Locked-in/fixed"
7. Spatial Scope: one of "Catchment/system-wide" or "Site-Specific"
8. Cost-Benefit Complexity: one of "Complex/intangible" or "Directly Quantifiable"
9. Adaptation Function: one of "Adaptive Capacity Building" or "Direct Adaptation Action"
10. Strategy Type: one of "Short term actions" or "Long term actions"

For each of the 5 measure types (Physical/technological, Ecosystem (nature-based), Knowledge and behavioural, Governance/institutional, Economic/financial), provide:
- name: exact name of this measure type
- percentage: integer 0-100 of how much the report focuses on this measure type
- summary: 1-2 sentence overview of these measures in the text
- evidence: quote showing a key example
- facts: array of the extracted measures falling under this theme. Each fact has the properties specified in responseSchema.`;

    factProperties.timing_of_measure = { type: "string", enum: ["Anticipatory", "Reactive"] };
    factProperties.depth_of_change = { type: "string", enum: ["Transformational", "Incremental"] };
    factProperties.governance_level = { type: "string", enum: ["National/multi-level", "Local authority", "Household/private sector"] };
    factProperties.readiness = { type: "string", enum: ["Shovel-ready", "Developmental"] };
    factProperties.robustness = { type: "string", enum: ["Flexible/modular", "Locked-in/fixed"] };
    factProperties.spatial_scope = { type: "string", enum: ["Catchment/system-wide", "Site-Specific"] };
    factProperties.cost_benefit = { type: "string", enum: ["Complex/intangible", "Directly Quantifiable"] };
    factProperties.function = { type: "string", enum: ["Adaptive Capacity Building", "Direct Adaptation Action"] };
    factProperties.strategy_type = { type: "string", enum: ["Short term actions", "Long term actions"] };
    
    factRequired.push(
      "timing_of_measure", "depth_of_change", "governance_level", "readiness",
      "robustness", "spatial_scope", "cost_benefit", "function", "strategy_type"
    );
  } else {
    sys = `You are a climate adaptation policy expert. Analyze the provided National Adaptation Report text.

Classify by these themes:
${themesList}

For EACH theme provide:
- name: exact theme name
- percentage: integer 0-100 of how much of the report discusses this theme
- summary: 2-3 sentence overview of what the report says about this theme
- evidence: a direct short quote from the text
- facts: array of specific policies, targets, financial commitments, or organisations mentioned. Each fact has:
  - type: one of "Policy", "Target", "Financial", "Organisation"
  - description: what the fact is
  - quote: short supporting quote from the text

Percentages don't need to sum to 100. Return valid JSON only.

MULTILINGUAL PROCESSING MANDATE:
The report text may be written in Korean, Italian, Spanish, or another language.
You MUST accurately comprehend technical policy terms in the native source language.
However, ALL outputs (names, summaries, descriptions, quotes explanations, and fact classifications) MUST be returned in English so that multi-country comparisons remain aligned in English. If you include evidence quotes, provide the translated English quote (or foreign quote followed by English translation).`;
  }

  const customGuidance = localStorage.getItem("ara_ai_guidance") || "";
  if (customGuidance.trim().length > 0) {
    sys += `\n\nCRITICAL POLICY CODING GUIDELINES:\n${customGuidance.trim()}\nYou MUST strictly adhere to these specific guidelines when identifying, extracting, and classifying measures.`;
  }

  const model = localStorage.getItem("ara_model") || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: `Analyze this climate report:\n---\n${clean}\n---` }] }],
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          topics: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                percentage: { type: "integer" },
                summary: { type: "string" },
                evidence: { type: "string" },
                facts: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: factProperties,
                    required: factRequired
                  }
                }
              },
              required: ["name","percentage","summary","evidence","facts"]
            }
          }
        },
        required: ["topics"]
      }
    }
  };

  const res = await fetchWithRetry(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Gemini API Error: Status ${res.status}. Details: ${await res.text()}`);
  const data = await res.json();
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("No response from Gemini.");
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

// ── Gemini: Comparison ───────────────────────────────────────
async function callGeminiComparison(apiKey) {
  const summaryData = reports.map(r => ({
    country: r.countryLabel,
    topics: (r.results?.topics || []).map(t => ({ name: t.name, percentage: t.percentage, summary: t.summary }))
  }));

  const customGuidance = localStorage.getItem("ara_ai_guidance") || "";

  let sys = `You are a climate adaptation policy expert. You are given analysis results from multiple National Adaptation Reports.
The UK is the BASELINE country. Compare all other countries against the UK.

Provide a structured comparison with these sections:
- strengths: Where the UK leads or excels compared to the other countries (2-3 paragraphs)
- gaps: Where the UK falls behind or has less coverage than others (2-3 paragraphs)
- unique_approaches: Notable differences in approach between countries (2-3 paragraphs)
- recommendations: What the UK could learn from the other reports (2-3 paragraphs)`;

  if (customGuidance.trim().length > 0) {
    sys += `\n\nADDITIONAL USER COMPARATIVE QUERY:\n${customGuidance.trim()}\nIn addition to the baseline sections, you MUST address this specific query directly. Focus on how the UK report differs or compares to the others according to this query. Return your analysis in the "custom_synthesis" field, formatted in clean Markdown (use headings, bullet points, or bold text as appropriate to make it highly readable).`;
  }

  sys += `\n\nBe specific. Reference actual theme percentages and policy details. Return valid JSON only.`;

  const model = localStorage.getItem("ara_model") || "gemini-3.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const properties = {
    strengths: { type: "string" },
    gaps: { type: "string" },
    unique_approaches: { type: "string" },
    recommendations: { type: "string" }
  };
  const required = ["strengths", "gaps", "unique_approaches", "recommendations"];

  if (customGuidance.trim().length > 0) {
    properties.custom_synthesis = { type: "string" };
    required.push("custom_synthesis");
  }

  const body = {
    contents: [{ parts: [{ text: `Compare these adaptation reports:\n${JSON.stringify(summaryData, null, 2)}` }] }],
    systemInstruction: { parts: [{ text: sys }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties,
        required
      }
    }
  };

  const res = await fetchWithRetry(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Comparison API Error: ${res.status}. ${await res.text()}`);
  const data = await res.json();
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) throw new Error("No comparison response.");
  return JSON.parse(data.candidates[0].content.parts[0].text);
}

// ── Local Keyword Scan Analysis ────────────────────────────────
function getWordRoot(w) {
  w = w.toLowerCase().replace(/[^a-z0-9]/g, ""); // strip punctuation
  if (w.endsWith("ing")) w = w.slice(0, -3);
  else if (w.endsWith("ies")) w = w.slice(0, -3) + "y";
  else if (w.endsWith("es") && !w.endsWith("ees")) w = w.slice(0, -2);
  else if (w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) w = w.slice(0, -1);
  else if (w.endsWith("ed")) w = w.slice(0, -2);
  return w;
}

const STOP_WORDS = new Set([
  "and", "or", "the", "of", "in", "to", "at", "for", "with", "by", "on", "a", "an", "about", 
  "are", "is", "was", "were", "be", "been", "has", "have", "had", "this", "that", "these", "those", 
  "from", "its", "it", "as", "based", "resilience", "resilient", "adaptation", "climate", 
  "report", "national", "plan", "action", "strategy", "policy", "management", "alignment"
]);

function normalizeOcr(str) {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, "") // strip non-alphanumeric
    .replace(/[1l|]/g, "i")    // OCR i/l/1 typo
    .replace(/0/g, "o")        // OCR o/0 typo
    .replace(/rn/g, "m")      // OCR m/rn typo
    .replace(/vv/g, "w");      // OCR w/vv typo
}

function editDistance(a, b) {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j] + 1);
      }
    }
  }
  return matrix[a.length][b.length];
}

function wordsFuzzyMatch(w1, w2) {
  const norm1 = normalizeOcr(w1);
  const norm2 = normalizeOcr(w2);
  if (norm1 === norm2) return true;
  if (norm1.length >= 5 && norm2.length >= 5) {
    return editDistance(norm1, norm2) <= 1;
  }
  return false;
}

function getKeywordStems(descString) {
  const parts = descString.toLowerCase().split(",").map(p => p.trim());
  const positive = [];
  const negative = [];
  
  parts.forEach(part => {
    if (part.startsWith("-")) {
      const w = part.slice(1).trim();
      if (w) negative.push(w);
    } else {
      if (part) positive.push(part);
    }
  });

  const posWords = positive.join(" ").split(/[^a-z0-9]/).map(w => w.trim()).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const posStems = posWords.map(getWordRoot);
  const posNormalized = posStems.map(normalizeOcr);

  const negWords = negative.join(" ").split(/[^a-z0-9]/).map(w => w.trim()).filter(w => w.length > 2);
  const negStems = negWords.map(getWordRoot);
  const negNormalized = negStems.map(normalizeOcr);

  return {
    positiveStems: new Set(posStems),
    positiveNormalized: posNormalized,
    negativeStems: new Set(negStems),
    negativeNormalized: negNormalized
  };
}

function getLiveMatchCountForCategory(descString) {
  if (reports.length === 0) return null;
  const keywordStems = getKeywordStems(descString);
  let totalMatches = 0;
  
  reports.forEach(r => {
    if (!r.extractedText) return;
    if (!r.processedSents) {
      const sentences = splitIntoSentences(r.extractedText);
      r.processedSents = sentences.map(s => {
        const sentLower = s.toLowerCase();
        const words = sentLower.split(/[^a-z0-9]/).filter(w => w.length > 2);
        const stems = words.map(getWordRoot);
        return { stems, normalized: stems.map(normalizeOcr) };
      });
    }
    
    r.processedSents.forEach(ps => {
      let matched = false;
      for (const stem of ps.stems) {
        if (keywordStems.positiveStems.has(stem)) { matched = true; break; }
      }
      if (matched) {
        for (const stem of ps.stems) {
          if (keywordStems.negativeStems.has(stem)) { matched = false; break; }
        }
      }
      if (matched) totalMatches++;
    });
  });
  return totalMatches;
}

function sentenceMatchesKeywordsOptimized(processedSent, keywordStems) {
  // 1. Check exclusions (negative keywords) first
  // Fast exact Set check (O(1))
  for (const stem of processedSent.stems) {
    if (keywordStems.negativeStems.has(stem)) return false;
  }
  
  // Fuzzy exclusion check
  for (let i = 0; i < processedSent.stems.length; i++) {
    const normWord = processedSent.normalized[i];
    if (normWord.length < 5) continue;
    for (const negNorm of keywordStems.negativeNormalized) {
      if (negNorm.length < 5) continue;
      if (Math.abs(normWord.length - negNorm.length) <= 1) {
        if (editDistance(normWord, negNorm) <= 1) return false;
      }
    }
  }

  // 2. Check positive matches
  // Fast exact Set check (O(1))
  for (const stem of processedSent.stems) {
    if (keywordStems.positiveStems.has(stem)) return true;
  }
  
  // Fuzzy positive match check
  for (let i = 0; i < processedSent.stems.length; i++) {
    const normWord = processedSent.normalized[i];
    if (normWord.length < 5) continue;
    for (const posNorm of keywordStems.positiveNormalized) {
      if (posNorm.length < 5) continue;
      if (Math.abs(normWord.length - posNorm.length) <= 1) {
        if (editDistance(normWord, posNorm) <= 1) return true;
      }
    }
  }
  return false;
}

const HEURISTIC_KEYWORDS = {
  timing_of_measure: {
    Anticipatory: ["anticipat", "proactiv", "prevent", "prepar", "befor", "futur", "plan"],
    Reactive: ["reactiv", "respons", "recover", "rebuild", "after", "event", "emergenc"]
  },
  depth_of_change: {
    Transformational: ["transform", "system-wid", "scale", "radic", "restructur"],
    Incremental: ["increment", "gradual", "step", "upgrad", "adjust", "improv"]
  },
  governance_level: {
    "National/multi-level": ["nation", "govern", "feder", "minist", "depart"],
    "Local authority": ["local", "council", "municip", "citi", "region", "author"],
    "Household/private sector": ["househ", "citizen", "famili", "privat", "busi", "corpor"]
  },
  readiness: {
    "Shovel-ready": ["shovel-readi", "readi", "immedi", "oper", "launch", "deploy"],
    Developmental: ["develop", "studi", "design", "pilot", "futur", "plan"]
  },
  robustness: {
    "Flexible/modular": ["flexibl", "modular", "adjust", "adapt", "option", "path"],
    "Locked-in/fixed": ["lock-in", "fix", "concret", "perman", "long-last"]
  },
  spatial_scope: {
    "Catchment/system-wide": ["catchment", "basin", "system-wid", "region", "river", "ecosystem"],
    "Site-Specific": ["site-specif", "local", "build", "facil", "spot", "site"]
  },
  cost_benefit: {
    "Complex/intangible": ["complex", "intang", "indirect", "non-monet"],
    "Directly Quantifiable": ["quantifi", "cost", "direct", "dollar", "pound", "euro", "currenc", "budget"]
  },
  function: {
    "Adaptive Capacity Building": ["capac", "train", "awar", "educ", "data", "research"],
    "Direct Adaptation Action": ["direct", "action", "wall", "defens", "protect", "instal", "plant"]
  },
  strategy_type: {
    "Short term actions": ["short-term", "immedi", "near-term", "2026", "2027", "2028"],
    "Long term actions": ["long-term", "2030", "2040", "2050", "centuri", "future"]
  }
};

function classifyDimensionLocally(processedSent, dimensionKey, defaultVal) {
  const optionsObj = HEURISTIC_KEYWORDS[dimensionKey];
  if (!optionsObj) return defaultVal;
  
  let bestOption = defaultVal;
  let maxMatches = 0;
  
  for (const [option, keywords] of Object.entries(optionsObj)) {
    let matches = 0;
    processedSent.stems.forEach(stem => {
      keywords.forEach(kw => {
        if (stem.includes(kw) || kw.includes(stem)) {
          matches++;
        }
      });
    });
    if (matches > maxMatches) {
      maxMatches = matches;
      bestOption = option;
    }
  }
  return bestOption;
}

function splitIntoSentences(text) {
  if (!text) return [];
  const cleanText = text.replace(/\s+/g, " ");
  const sentences = [];
  let currentSentence = "";
  
  const abbrevs = new Set(["u.s", "e.g", "i.e", "approx", "al", "dr", "mr", "mrs", "st", "jan", "feb", "mar", "apr", "jun", "jul", "aug", "sep", "oct", "nov", "dec", "vs", "co", "corp", "ltd", "inc"]);
  const words = cleanText.split(" ");
  
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentSentence += (currentSentence ? " " : "") + word;
    
    const lastChar = word[word.length - 1];
    if (/[.!?]/.test(lastChar)) {
      const withoutPunct = word.toLowerCase().slice(0, -1);
      if (abbrevs.has(withoutPunct) || /^[0-9]+$/.test(withoutPunct)) {
        continue;
      }
      if (withoutPunct.length === 1 && withoutPunct === withoutPunct.toUpperCase()) {
        continue;
      }
      const nextWord = words[i + 1];
      if (!nextWord || /^[A-Z]/.test(nextWord)) {
        sentences.push(currentSentence.trim());
        currentSentence = "";
      }
    }
  }
  if (currentSentence.trim()) {
    sentences.push(currentSentence.trim());
  }
  return sentences.filter(s => s.length > 15);
}

function buildBM25Index(processedSents) {
  const N = processedSents.length;
  if (N === 0) return { avgDL: 0, idf: {} };
  let totalLength = 0;
  const df = {};
  processedSents.forEach(ps => {
    totalLength += ps.stems.length;
    const uniqueStems = new Set(ps.stems);
    uniqueStems.forEach(stem => {
      df[stem] = (df[stem] || 0) + 1;
    });
  });
  const avgDL = totalLength / N;
  const idf = {};
  Object.keys(df).forEach(stem => {
    const docFreq = df[stem];
    idf[stem] = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
  });
  return { avgDL, idf };
}

function calculateBM25Scores(processedSents, index, keywordStems) {
  const { avgDL, idf } = index;
  const k1 = 1.2;
  const b = 0.3; // Low length penalty to preserve longer policy facts
  return processedSents.map((ps, idx) => {
    let excluded = false;
    for (const stem of ps.stems) {
      if (keywordStems.negativeStems.has(stem)) { excluded = true; break; }
    }
    if (!excluded) {
      for (let i = 0; i < ps.stems.length; i++) {
        const normWord = ps.normalized[i];
        if (normWord.length < 5) continue;
        for (const negNorm of keywordStems.negativeNormalized) {
          if (negNorm.length < 5) continue;
          if (Math.abs(normWord.length - negNorm.length) <= 1) {
            if (editDistance(normWord, negNorm) <= 1) { excluded = true; break; }
          }
        }
        if (excluded) break;
      }
    }
    if (excluded) return { index: idx, score: -1 };

    let score = 0;
    keywordStems.positiveStems.forEach(queryStem => {
      let tf = 0;
      let matchedStems = [];
      ps.stems.forEach((sentStem, i) => {
        if (sentStem === queryStem) {
          tf++;
          matchedStems.push(sentStem);
        } else {
          const normWord = ps.normalized[i];
          const queryNorm = normalizeOcr(queryStem);
          if (normWord.length >= 5 && queryNorm.length >= 5 && Math.abs(normWord.length - queryNorm.length) <= 1) {
            if (editDistance(normWord, queryNorm) <= 1) {
              tf++;
              matchedStems.push(sentStem);
            }
          }
        }
      });
      if (tf > 0) {
        let queryIDF = 0.5;
        matchedStems.forEach(ms => {
          if (idf[ms] !== undefined) queryIDF = Math.max(queryIDF, idf[ms]);
        });
        const scoreTerm = queryIDF * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (ps.stems.length / avgDL))));
        score += scoreTerm;
      }
    });
    return { index: idx, score: score };
  });
}

function runLocalKeywordAnalysis(text) {
  const sentences = splitIntoSentences(text);

  const processedSents = sentences.map(s => {
    const sentLower = s.toLowerCase();
    const words = sentLower.split(/[^a-z0-9]/).filter(w => w.length > 2);
    const stems = words.map(getWordRoot);
    const normalized = stems.map(normalizeOcr);
    return {
      text: s,
      stems: stems,
      normalized: normalized
    };
  });

  const bm25Index = buildBM25Index(processedSents);

  const topics = categories.map(cat => {
    const keywordStems = getKeywordStems(cat.desc);
    const scores = calculateBM25Scores(processedSents, bm25Index, keywordStems);
    
    // Sort matching sentences by BM25 relevance score desc
    const matchingScores = scores.filter(x => x.score > 0).sort((a, b) => b.score - a.score);
    const matchingSents = matchingScores.map(x => processedSents[x.index].text);

    const percentage = sentences.length > 0 ? Math.min(100, Math.round((matchingSents.length / sentences.length) * 100)) : 0;
    const summary = `Found ${matchingSents.length} matching sentence(s) out of ${sentences.length} total sentences in the document.`;
    
    const evidence = matchingSents.length > 0 ? matchingSents.slice(0, 15).map(s => `• ${s}.`).join("\n\n") : "No matching sentences containing the target keywords were found.";

    const facts = [];
    const maxFacts = 8;
    for (const sentence of matchingSents) {
      if (facts.length >= maxFacts) break;
      const lowerSent = sentence.toLowerCase();
      
      const processedSentForFact = processedSents.find(ps => ps.text === sentence) || { stems: sentence.toLowerCase().split(/[^a-z0-9]/).filter(w => w.length > 2) };
      
      const timing_of_measure = classifyDimensionLocally(processedSentForFact, "timing_of_measure", "Anticipatory");
      const depth_of_change = classifyDimensionLocally(processedSentForFact, "depth_of_change", "Incremental");
      const governance_level = classifyDimensionLocally(processedSentForFact, "governance_level", "National/multi-level");
      const readiness = classifyDimensionLocally(processedSentForFact, "readiness", "Developmental");
      const robustness = classifyDimensionLocally(processedSentForFact, "robustness", "Flexible/modular");
      const spatial_scope = classifyDimensionLocally(processedSentForFact, "spatial_scope", "Site-Specific");
      const cost_benefit = classifyDimensionLocally(processedSentForFact, "cost_benefit", "Directly Quantifiable");
      const function_val = classifyDimensionLocally(processedSentForFact, "function", "Direct Adaptation Action");
      const strategy_type = classifyDimensionLocally(processedSentForFact, "strategy_type", "Short term actions");

      if (/[\$\u00A3\u20AC]/.test(sentence) && /\d/.test(sentence)) {
        facts.push({
          type: "Financial",
          description: sentence.substring(0, 120) + (sentence.length > 120 ? "..." : ""),
          quote: sentence,
          timing_of_measure,
          depth_of_change,
          governance_level,
          readiness,
          robustness,
          spatial_scope,
          cost_benefit,
          function: function_val,
          strategy_type
        });
        continue;
      }

      if (/target|goal|commit|aim|deadline|limit|reduce|increase|by 20\d\d/.test(lowerSent) && /\d/.test(sentence)) {
        facts.push({
          type: "Target",
          description: sentence.substring(0, 120) + (sentence.length > 120 ? "..." : ""),
          quote: sentence,
          timing_of_measure,
          depth_of_change,
          governance_level,
          readiness,
          robustness,
          spatial_scope,
          cost_benefit,
          function: function_val,
          strategy_type
        });
        continue;
      }

      if (/policy|strategy|national plan|scheme|framework|legislation|regulation|act/.test(lowerSent)) {
        facts.push({
          type: "Policy",
          description: sentence.substring(0, 120) + (sentence.length > 120 ? "..." : ""),
          quote: sentence,
          timing_of_measure,
          depth_of_change,
          governance_level,
          readiness,
          robustness,
          spatial_scope,
          cost_benefit,
          function: function_val,
          strategy_type
        });
        continue;
      }

      if (/department|agency|council|association|committee|ministry|union|commission|group|institute|organisation|organisation|government/.test(lowerSent) && /[A-Z]{3,}/.test(sentence)) {
        facts.push({
          type: "Organisation",
          description: sentence.substring(0, 120) + (sentence.length > 120 ? "..." : ""),
          quote: sentence,
          timing_of_measure,
          depth_of_change,
          governance_level,
          readiness,
          robustness,
          spatial_scope,
          cost_benefit,
          function: function_val,
          strategy_type
        });
      }
    }

    return {
      name: cat.name,
      percentage,
      summary,
      evidence,
      facts
    };
  });

  return { topics };
}



function runLocalKeywordComparison() {
  const ukIdx = reports.findIndex(r => r.countryLabel.toLowerCase().includes("uk") || r.countryLabel.toLowerCase().includes("united kingdom"));
  if (ukIdx < 0) {
    return {
      strengths: "UK report not found in the uploaded list. To generate comparative insights, ensure one of the uploaded files has a Country Label containing 'UK'.",
      gaps: "N/A",
      unique_approaches: "N/A",
      recommendations: "N/A",
      custom_synthesis: "Local Keyword mode does not support custom synthesis queries."
    };
  }

  const ukReport = reports[ukIdx];
  const otherReports = reports.filter((_, i) => i !== ukIdx);

  let strengths = "Based on local keyword distribution analysis, the UK Adaptation Report shows higher relative attention in the following areas:\n\n";
  let gaps = "Based on local keyword distribution analysis, the UK Adaptation Report shows lower relative attention in the following areas compared to other countries:\n\n";
  let unique_approaches = "Comparative overview of thematic focus patterns:\n\n";
  let recommendations = "Based on gaps identified relative to other national reports, the UK could benefit from:\n\n";

  let hasStrengths = false;
  let hasGaps = false;

  categories.forEach(cat => {
    const theme = cat.name;
    const ukPct = (ukReport.results?.topics || []).find(t => t.name === theme)?.percentage || 0;
    
    otherReports.forEach(r => {
      const otherPct = (r.results?.topics || []).find(t => t.name === theme)?.percentage || 0;
      const diff = ukPct - otherPct;

      if (diff > 5) {
        strengths += `- **${theme}**: UK devotes ${ukPct}% of sentences to this theme, which is higher than ${r.countryLabel} (${otherPct}%).\n`;
        hasStrengths = true;
      } else if (diff < -5) {
        gaps += `- **${theme}**: UK devotes ${ukPct}% of sentences to this theme, which is lower than ${r.countryLabel} (${otherPct}%).\n`;
        recommendations += `- Examining how **${r.countryLabel}** designs policies for **${theme}** to address the UK's lower level of keyword focus (UK: ${ukPct}%, ${r.countryLabel}: ${otherPct}%).\n`;
        hasGaps = true;
      }
    });

    unique_approaches += `- **${theme}**: UK focus is at ${ukPct}%. `;
    otherReports.forEach(r => {
      const otherPct = (r.results?.topics || []).find(t => t.name === theme)?.percentage || 0;
      unique_approaches += `${r.countryLabel} focus is at ${otherPct}%. `;
    });
    unique_approaches += "\n";
  });

  if (!hasStrengths) strengths += "- No themes with significantly higher focus than other countries were detected.\n";
  if (!hasGaps) {
    gaps += "- No themes with significantly lower focus than other countries were detected.\n";
    recommendations += "- The UK's keyword coverage is aligned with or exceeds the other uploaded reports across all target categories.\n";
  }

  const customGuidance = localStorage.getItem("ara_ai_guidance") || "";
  let custom_synthesis = "";
  if (customGuidance.trim().length > 0) {
    custom_synthesis = "Custom Comparative Synthesis is only available in **AI Analysis Mode**. Proposing custom comparisons requires connecting the Gemini API and running analysis on your uploaded reports.";
  }

  return {
    strengths,
    gaps,
    unique_approaches,
    recommendations,
    custom_synthesis
  };
}

function highlightKeywordsInText(text, categoryName) {
  const cat = categories.find(c => c.name === categoryName);
  if (!cat) return esc(text);
  const keywordStems = getKeywordStems(cat.desc);
  let escaped = esc(text);

  // Match each word and highlight it if its stem fuzzy matches a positive keyword stem
  return escaped.replace(/\b[a-zA-Z-]{3,}\b/g, (word) => {
    const stem = getWordRoot(word);
    for (const posStem of keywordStems.positiveStems) {
      if (wordsFuzzyMatch(stem, posStem)) {
        return `<span class="text-highlight">${word}</span>`;
      }
    }
    return word;
  });
}

// ── Show Results ─────────────────────────────────────────────
function showResults() {
  document.getElementById("status-loading").style.display = "none";
  document.getElementById("status-empty").style.display = "none";

  // Populate editable facts database array
  populateFactsFromReports();

  // Populate report selector
  const sel = document.getElementById("report-selector");
  if (sel) {
    sel.innerHTML = reports.map((r, i) => `<option value="${i}">${esc(r.countryLabel)} — ${esc(r.file.name)}</option>`).join("");
  }

  // Show tab bar (hide comparison/facts tabs if only 1 report)
  const tabBar = document.getElementById("tab-bar");
  tabBar.hidden = false;
  const compTab = tabBar.querySelector('[data-tab="comparison"]');
  const factsTab = tabBar.querySelector('[data-tab="facts"]');
  if (compTab) compTab.style.display = reports.length > 1 ? "" : "none";

  // Enable export buttons
  ["export-report-btn", "export-comparison-btn", "export-facts-csv-btn", "export-facts-json-btn"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.removeAttribute("disabled");
  });

  selectedReportIdx = 0;
  renderCategoriesList();
  switchTab("single");
}

// ── Tab Switching ────────────────────────────────────────────
function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.getElementById("tab-single").style.display = tab === "single" ? "flex" : "none";
  document.getElementById("tab-comparison").style.display = tab === "comparison" ? "flex" : "none";
  document.getElementById("tab-facts").style.display = tab === "facts" ? "flex" : "none";
  document.getElementById("tab-map").style.display = tab === "map" ? "flex" : "none";
  document.getElementById("status-empty").style.display = "none";

  if (tab === "single") displaySingleReport();
  else if (tab === "comparison") displayComparison();
  else if (tab === "facts") { populateFactsFilters(); renderFactsTable(); }
  else if (tab === "map") { populateMapMetricSelect(); renderChoroplethMap(); }
  icons();
}

// ── Single Report Display ────────────────────────────────────
const DIMENSION_LABELS = {
  timing_of_measure: "Timing of Measure",
  depth_of_change: "Depth of Change",
  governance_level: "Governance & Actor Level",
  readiness: "Implementation Readiness",
  robustness: "Adaptability & Robustness",
  spatial_scope: "Spatial Scope",
  cost_benefit: "Cost-Benefit Complexity",
  function: "Adaptation Function",
  strategy_type: "Strategy Type"
};

function displaySingleReport() {
  const r = reports[selectedReportIdx];
  if (!r || !r.results) return;

  document.getElementById("result-doc-name").textContent = `${r.countryLabel} — ${r.file.name}`;
  const wc = r.extractedText.split(/\s+/).filter(Boolean).length;
  document.getElementById("meta-words").textContent = wc.toLocaleString() + " words";
  document.getElementById("meta-tokens").textContent = "~" + Math.ceil(wc * 1.35).toLocaleString();
  const model = localStorage.getItem("ara_model") || "gemini-3.5-flash";
  document.getElementById("meta-model").textContent = model;

  const topics = [...(r.results.topics || [])].sort((a, b) => b.percentage - a.percentage);
  topics.forEach((t, i) => t.color = THEME_COLORS[i % THEME_COLORS.length]);

  renderDonut(topics);
  renderAccordions(topics);
  renderExtractedText("");
  populateProfileThemeFilter();
  const filterVal = document.getElementById("matrix-profile-theme-filter")?.value || "";
  renderPolicyDimensionsProfile(r.countryLabel, filterVal);
  icons();
}

function populateProfileThemeFilter() {
  const s = document.getElementById("matrix-profile-theme-filter");
  if (!s) return;
  const currentVal = s.value;
  let html = `<option value="">All Themes / Measure Types</option>`;
  categories.forEach(cat => {
    html += `<option value="${esc(cat.name)}">${esc(cat.name)}</option>`;
  });
  s.innerHTML = html;
  if (currentVal && s.querySelector(`option[value="${currentVal}"]`)) {
    s.value = currentVal;
  }
}

function renderPolicyDimensionsProfile(countryLabel, filterTheme = "") {
  const container = document.getElementById("matrix-dimensions-summary-container");
  const card = document.getElementById("matrix-dimensions-summary-card");
  if (!container || !card) return;

  const isMatrix = (taxonomySchema === "policy_matrix");
  if (!isMatrix) {
    card.style.display = "none";
    return;
  }

  let countryFacts = allFacts.filter(f => f.country === countryLabel);
  const totalRaw = countryFacts.length;

  if (filterTheme) {
    countryFacts = countryFacts.filter(f => f.theme === filterTheme);
  }

  if (totalRaw === 0) {
    card.style.display = "block";
    container.innerHTML = `<p style="grid-column: 1/-1; padding: 1rem; text-align: center; color: var(--ink-3); font-style: italic;">No extracted measures found in database to calculate profiles. Run analysis or add custom notes to see summaries.</p>`;
    return;
  }

  if (countryFacts.length === 0) {
    card.style.display = "block";
    container.innerHTML = `<p style="grid-column: 1/-1; padding: 1.5rem; text-align: center; color: var(--ink-3); font-style: italic; border: 1px dashed var(--rule); border-radius: 6px; background: var(--bg-alt);">No measures classified under the theme <b>"${esc(filterTheme)}"</b> found for this country. Select a different theme or add measures under this theme in the facts database.</p>`;
    return;
  }

  card.style.display = "block";
  container.innerHTML = "";

  const dimensions = Object.keys(MATRIX_OPTIONS);

  dimensions.forEach(dim => {
    const label = DIMENSION_LABELS[dim] || dim;
    const options = MATRIX_OPTIONS[dim];
    
    const counts = {};
    options.forEach(opt => counts[opt] = 0);
    countryFacts.forEach(f => {
      const val = f[dim];
      if (counts[val] !== undefined) counts[val]++;
    });

    const total = countryFacts.length;

    let rowsHTML = "";
    options.forEach(opt => {
      const count = counts[opt];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      rowsHTML += `
        <div style="margin-bottom: 0.5rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.72rem; margin-bottom: 0.15rem; font-weight: 500;">
            <span style="color: var(--ink-2);">${esc(opt)}</span>
            <span style="color: var(--ink-3); font-weight: 600;">${pct}% (${count}/${total})</span>
          </div>
          <div style="height: 6px; background: var(--bg-alt); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: var(--primary); border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>
      `;
    });

    const box = document.createElement("div");
    box.style.border = "1px solid var(--rule)";
    box.style.borderRadius = "6px";
    box.style.padding = "0.75rem";
    box.style.background = "#ffffff";
    box.innerHTML = `
      <h4 style="font-size: 0.78rem; font-weight: 600; color: var(--ink-2); margin-bottom: 0.65rem; border-bottom: 1px solid var(--rule); padding-bottom: 0.35rem;">
        ${esc(label)}
      </h4>
      ${rowsHTML}
    `;
    container.appendChild(box);
  });
}

function renderDonut(topics) {
  const svg = document.getElementById("donut-svg");
  const legend = document.getElementById("chart-legend");
  if (!svg || !legend) return;
  svg.querySelectorAll("circle.slice").forEach(c => c.remove());
  legend.innerHTML = "";

  const totalClassified = topics.reduce((s, t) => s + t.percentage, 0);
  const displayTopics = [...topics];
  if (totalClassified < 100) {
    displayTopics.push({
      name: "Other / Unclassified",
      percentage: 100 - totalClassified,
      color: "#e4e3de",
      isUnclassified: true
    });
  }

  const total = displayTopics.reduce((s, t) => s + t.percentage, 0);
  const top = displayTopics[0];
  document.getElementById("donut-center-pct").textContent = top ? top.percentage + "%" : "--%";
  const r = 70, circ = 2 * Math.PI * r;
  let offset = 0;

  displayTopics.forEach(t => {
    // Legend
    const li = document.createElement("div");
    li.className = "legend-item";
    li.innerHTML = `<div class="legend-left"><span class="legend-color-box" style="background:${t.color}"></span><span class="legend-name">${esc(t.name)}</span></div><span class="legend-value">${t.percentage}%</span>`;
    if (!t.isUnclassified) {
      li.addEventListener("click", () => { const el = document.getElementById("accordion-" + cleanId(t.name)); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); if (!el.classList.contains("expanded")) el.querySelector(".theme-accordion-header").click(); } });
    } else {
      li.style.cursor = "default";
      li.style.opacity = "0.7";
    }
    legend.appendChild(li);

    // Slice
    if (t.percentage > 0 && total > 0) {
      const norm = t.percentage / Math.max(100, total);
      const len = norm * circ;
      const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      c.setAttribute("class", "slice");
      c.setAttribute("cx", 100); c.setAttribute("cy", 100); c.setAttribute("r", r);
      c.setAttribute("fill", "none"); c.setAttribute("stroke", t.color); c.setAttribute("stroke-width", 20);
      c.setAttribute("stroke-dasharray", `${len} ${circ}`); c.setAttribute("stroke-dashoffset", -offset);
      c.setAttribute("transform", "rotate(-90 100 100)");
      c.style.transition = "stroke-width 0.2s";
      if (!t.isUnclassified) {
        c.addEventListener("mouseover", () => { c.setAttribute("stroke-width", 25); document.getElementById("donut-center-pct").textContent = t.percentage + "%"; });
        c.addEventListener("mouseleave", () => { c.setAttribute("stroke-width", 20); document.getElementById("donut-center-pct").textContent = top ? top.percentage + "%" : "--%"; });
      }
      svg.insertBefore(c, svg.querySelector("text"));
      offset += len;
    }
  });
}



function buildThemeDimensionBreakdown(themeName) {
  const r = reports[selectedReportIdx];
  if (!r) return "";

  // Get facts for this theme from allFacts
  const themeFacts = allFacts.filter(f => f.country === r.countryLabel && f.theme === themeName);
  if (themeFacts.length === 0) return "";

  const dimensions = Object.keys(MATRIX_OPTIONS);
  const total = themeFacts.length;
  const dimColors = ["#1d4e89","#2d6a4f","#1b6565","#9b4d0f","#6366f1","#0891b2","#a855f7","#db2777","#5c5c52"];

  let html = `<div class="theme-finding-block" style="margin-top: 0.75rem;">
    <h4 style="cursor: pointer; user-select: none;" class="dim-breakdown-toggle">
      <i data-lucide="bar-chart-3"></i> Policy Dimension Breakdown
      <span style="font-weight: 400; font-size: 0.7rem; color: var(--ink-3); margin-left: 0.5rem;">(${total} measure${total !== 1 ? 's' : ''})</span>
      <span class="dim-toggle-arrow" style="float: right; font-size: 0.7rem; color: var(--ink-4);">▸ expand</span>
    </h4>
    <div class="dim-breakdown-content" style="display: none; margin-top: 0.6rem;">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0.85rem;">`;

  dimensions.forEach((dim, di) => {
    const label = DIMENSION_LABELS[dim] || dim;
    const options = MATRIX_OPTIONS[dim];
    const color = dimColors[di % dimColors.length];
    
    const counts = {};
    options.forEach(opt => counts[opt] = 0);
    themeFacts.forEach(f => {
      const val = f[dim];
      if (counts[val] !== undefined) counts[val]++;
    });

    let barsHTML = "";
    options.forEach(opt => {
      const count = counts[opt];
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      barsHTML += `
        <div style="margin-bottom: 0.35rem;">
          <div style="display: flex; justify-content: space-between; font-size: 0.68rem; margin-bottom: 0.1rem;">
            <span style="color: var(--ink-2); font-weight: 500;">${esc(opt)}</span>
            <span style="color: var(--ink-3); font-weight: 600;">${pct}%</span>
          </div>
          <div style="height: 5px; background: var(--rule); border-radius: 3px; overflow: hidden;">
            <div style="height: 100%; width: ${pct}%; background: ${color}; border-radius: 3px; transition: width 0.3s ease;"></div>
          </div>
        </div>`;
    });

    html += `
      <div style="border: 1px solid var(--rule); border-radius: 5px; padding: 0.6rem; background: #fafaf8;">
        <div style="font-size: 0.72rem; font-weight: 600; color: var(--ink-2); margin-bottom: 0.4rem; border-bottom: 1px solid var(--rule); padding-bottom: 0.25rem;">${esc(label)}</div>
        ${barsHTML}
      </div>`;
  });

  html += `</div></div></div>`;
  return html;
}

function renderAccordions(topics) {
  const c = document.getElementById("themes-findings-container");
  if (!c) return; c.innerHTML = "";
  topics.forEach((t, i) => {
    const factsHTML = (t.facts || []).map(f => `<div style="margin-top:0.5rem"><span class="fact-type-badge fact-type-${f.type.toLowerCase()}">${esc(f.type)}</span> ${esc(f.description)}${f.quote ? `<div class="fact-quote">"${esc(f.quote)}"</div>` : ""}</div>`).join("");
    const d = document.createElement("div");
    d.className = "theme-accordion-item" + (i === 0 ? " expanded" : "");
    d.id = "accordion-" + cleanId(t.name);
    
    // Highlight keywords in evidence if in keyword scan mode
    const evidenceText = analysisMode === "keyword" ? highlightKeywordsInText(t.evidence, t.name) : `"${esc(t.evidence)}"`;
    
    // Build per-theme dimension breakdown (only if facts exist with dimensions)
    const dimBreakdown = buildThemeDimensionBreakdown(t.name);
    
    d.innerHTML = `<div class="theme-accordion-header"><div class="theme-accordion-left"><span class="theme-accordion-color" style="background:${t.color}"></span><span class="theme-accordion-title">${esc(t.name)}</span></div><div style="display:flex;align-items:center;gap:0.75rem"><span class="theme-accordion-badge">${t.percentage}%</span><div class="theme-accordion-arrow"><i data-lucide="chevron-down"></i></div></div></div><div class="theme-accordion-body"><div class="theme-finding-block"><h4><i data-lucide="info"></i> Summary</h4><p class="theme-summary-text">${esc(t.summary)}</p></div>${dimBreakdown}${t.evidence ? `<div class="theme-finding-block"><h4><i data-lucide="quote"></i> Evidence</h4><div class="evidence-quote" style="white-space: pre-wrap;">${evidenceText}</div></div>` : ""}${factsHTML ? `<div class="theme-finding-block"><h4><i data-lucide="database"></i> Extracted Facts</h4>${factsHTML}</div>` : ""}</div>`;
    d.querySelector(".theme-accordion-header").addEventListener("click", () => d.classList.toggle("expanded"));
    
    // Bind expand/collapse for dimension breakdown
    const toggle = d.querySelector(".dim-breakdown-toggle");
    if (toggle) {
      toggle.addEventListener("click", (e) => {
        e.stopPropagation();
        const content = d.querySelector(".dim-breakdown-content");
        const arrow = d.querySelector(".dim-toggle-arrow");
        if (content) {
          const visible = content.style.display !== "none";
          content.style.display = visible ? "none" : "block";
          if (arrow) arrow.textContent = visible ? "▸ expand" : "▾ collapse";
        }
      });
    }
    
    c.appendChild(d);
  });
}

function renderExtractedText(search) {
  const c = document.getElementById("extracted-text-view");
  const cnt = document.getElementById("search-results-count");
  const r = reports[selectedReportIdx];
  if (!c || !r) return;
  const txt = esc(r.extractedText || "");
  if (!search || search.length < 2) { c.innerHTML = txt; if (cnt) cnt.textContent = ""; return; }
  const re = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&")})`, "gi");
  let n = 0;
  c.innerHTML = txt.replace(re, m => { n++; return `<span class="text-highlight">${m}</span>`; });
  if (cnt) cnt.textContent = n + " matches";
}

// ── Comparison Display ───────────────────────────────────────
function displayComparison() {
  renderGroupedBars();
  renderMatrix();
  renderInsights();
  icons();
}

function renderGroupedBars() {
  const c = document.getElementById("grouped-bar-container");
  if (!c) return; c.innerHTML = "";
  const themeNames = categories.map(cat => cat.name);
  const countryColors = {};
  reports.forEach((r, i) => countryColors[r.countryLabel] = THEME_COLORS[i % THEME_COLORS.length]);

  themeNames.forEach(theme => {
    const group = document.createElement("div");
    group.className = "bar-group";
    group.innerHTML = `<div class="bar-group-label">${esc(theme)}</div>`;
    reports.forEach(r => {
      const t = (r.results?.topics || []).find(x => x.name === theme);
      const pct = t ? t.percentage : 0;
      const color = countryColors[r.countryLabel];
      const isUK = r.countryLabel.toLowerCase().includes("uk") || r.countryLabel.toLowerCase().includes("united kingdom");
      group.innerHTML += `<div class="bar-row"><span class="bar-country-label${isUK ? " bar-uk-label" : ""}">${esc(r.countryLabel)}</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div><span class="bar-value" style="${pct > 15 ? "color:#fff" : "color:var(--ink);right:auto;left:" + Math.max(pct, 2) + "%"}">${pct}%</span></div></div>`;
    });
    c.appendChild(group);
  });
}

function renderMatrix() {
  const c = document.getElementById("comparison-matrix-container");
  if (!c) return;
  const themeNames = categories.map(cat => cat.name);
  const ukIdx = reports.findIndex(r => r.countryLabel.toLowerCase().includes("uk") || r.countryLabel.toLowerCase().includes("united kingdom"));

  let html = `<table class="comparison-matrix"><thead><tr><th>Theme</th>`;
  reports.forEach(r => html += `<th>${esc(r.countryLabel)}</th>`);
  html += `</tr></thead><tbody>`;

  themeNames.forEach(theme => {
    html += `<tr><td>${esc(theme)}</td>`;
    const ukPct = ukIdx >= 0 ? ((reports[ukIdx].results?.topics || []).find(t => t.name === theme)?.percentage || 0) : null;
    reports.forEach((r, i) => {
      const t = (r.results?.topics || []).find(x => x.name === theme);
      const pct = t ? t.percentage : 0;
      let cls = "";
      if (i === ukIdx) cls = "cell-uk";
      else if (ukPct !== null) {
        if (pct > ukPct + 5) cls = "cell-higher";
        else if (pct < ukPct - 5) cls = "cell-lower";
        else cls = "cell-similar";
      }
      html += `<td class="${cls}">${pct}%</td>`;
    });
    html += `</tr>`;
  });
  html += `</tbody></table>`;
  c.innerHTML = html;
}



function renderInsights() {
  const c = document.getElementById("comparison-insights-container");
  if (!c) return;
  if (!comparisonResults) { c.innerHTML = "<p>Run analysis with multiple reports to see comparison insights.</p>"; return; }
  
  // Custom comparative query synthesis
  const customCard = document.getElementById("custom-synthesis-card");
  const customContainer = document.getElementById("custom-synthesis-container");
  if (customCard && customContainer) {
    if (comparisonResults.custom_synthesis && comparisonResults.custom_synthesis.trim().length > 0) {
      customCard.style.display = "block";
      customContainer.innerHTML = mdToHtml(comparisonResults.custom_synthesis);
    } else {
      customCard.style.display = "none";
    }
  }

  c.innerHTML = `
    <div class="insights-section"><h4><i data-lucide="trending-up"></i> UK Strengths</h4><div class="insights-text">${mdToHtml(comparisonResults.strengths)}</div></div>
    <div class="insights-section"><h4><i data-lucide="trending-down"></i> UK Gaps</h4><div class="insights-text">${mdToHtml(comparisonResults.gaps)}</div></div>
    <div class="insights-section"><h4><i data-lucide="git-branch"></i> Unique Approaches</h4><div class="insights-text">${mdToHtml(comparisonResults.unique_approaches)}</div></div>
    <div class="insights-section"><h4><i data-lucide="lightbulb"></i> Recommendations for UK</h4><div class="insights-text">${mdToHtml(comparisonResults.recommendations)}</div></div>`;
}

// ── Facts Database ───────────────────────────────────────────
const MATRIX_OPTIONS = {
  timing_of_measure: ["Anticipatory", "Reactive"],
  depth_of_change: ["Transformational", "Incremental"],
  governance_level: ["National/multi-level", "Local authority", "Household/private sector"],
  readiness: ["Shovel-ready", "Developmental"],
  robustness: ["Flexible/modular", "Locked-in/fixed"],
  spatial_scope: ["Catchment/system-wide", "Site-Specific"],
  cost_benefit: ["Complex/intangible", "Directly Quantifiable"],
  function: ["Adaptive Capacity Building", "Direct Adaptation Action"],
  strategy_type: ["Short term actions", "Long term actions"]
};

function getAllFacts() {
  return allFacts;
}

function populateFactsFromReports() {
  allFacts = [];
  let factIdCounter = 1;
  reports.forEach(r => {
    (r.results?.topics || []).forEach(t => {
      (t.facts || []).forEach(f => {
        allFacts.push({
          id: `fact-${factIdCounter++}`,
          country: r.countryLabel,
          theme: t.name,
          type: f.type,
          description: f.description,
          quote: f.quote || "",
          
          // Matrix fields (defaulting to standard baseline values if not present)
          timing_of_measure: f.timing_of_measure || "Anticipatory",
          depth_of_change: f.depth_of_change || "Incremental",
          governance_level: f.governance_level || "National/multi-level",
          readiness: f.readiness || "Developmental",
          robustness: f.robustness || "Flexible/modular",
          spatial_scope: f.spatial_scope || "Site-Specific",
          cost_benefit: f.cost_benefit || "Directly Quantifiable",
          function: f.function || "Direct Adaptation Action",
          strategy_type: f.strategy_type || "Short term actions"
        });
      });
    });
  });
}

function populateFactsFilters() {
  const cf = document.getElementById("facts-country-filter");
  const tf = document.getElementById("facts-theme-filter");
  if (cf) { cf.innerHTML = `<option value="">All Countries</option>` + reports.map(r => `<option>${esc(r.countryLabel)}</option>`).join(""); }
  if (tf) { tf.innerHTML = `<option value="">All Themes</option>` + categories.map(c => `<option>${esc(c.name)}</option>`).join(""); }
}

function renderFactsTable() {
  const c = document.getElementById("facts-table-container");
  if (!c) return;
  let facts = getAllFacts();

  // Filters
  const search = (document.getElementById("facts-search-input")?.value || "").toLowerCase();
  const country = document.getElementById("facts-country-filter")?.value || "";
  const theme = document.getElementById("facts-theme-filter")?.value || "";
  const type = document.getElementById("facts-type-filter")?.value || "";

  if (search) facts = facts.filter(f => (f.description + f.quote + f.country + f.theme).toLowerCase().includes(search));
  if (country) facts = facts.filter(f => f.country === country);
  if (theme) facts = facts.filter(f => f.theme === theme);
  if (type) facts = facts.filter(f => f.type === type);

  const isMatrix = (taxonomySchema === "policy_matrix");

  const guideCard = document.getElementById("matrix-heuristics-guide-card");
  if (guideCard) {
    guideCard.style.display = (isMatrix && analysisMode === "keyword") ? "block" : "none";
  }

  if (facts.length === 0) { c.innerHTML = `<p style="padding:2rem;text-align:center;color:var(--ink-3)">No facts found matching filters.</p>`; return; }
  
  let headers = `<tr>
                  <th>Country</th>
                  <th>Theme</th>
                  <th>Type</th>
                  <th>Description <span style="font-size:0.65rem;font-weight:normal;color:var(--ink-3);">(click to edit)</span></th>
                  <th>Quote <span style="font-size:0.65rem;font-weight:normal;color:var(--ink-3);">(click to edit)</span></th>`;
  
  if (isMatrix) {
    headers += `   <th>Timing</th>
                  <th>Depth</th>
                  <th>Governance</th>
                  <th>Readiness</th>
                  <th>Robustness</th>
                  <th>Spatial Scope</th>
                  <th>Cost-Benefit</th>
                  <th>Function</th>
                  <th>Strategy Type</th>`;
  }
  headers += `     <th style="width: 50px;"></th>
                </tr>`;

  let html = `<div class="facts-count">${facts.length} fact${facts.length !== 1 ? "s" : ""} found</div>
              <div class="facts-table-container">
                <table class="facts-table">
                  <thead>${headers}</thead>
                  <tbody>`;
  
  facts.forEach(f => {
    html += `<tr>
              <td>${esc(f.country)}</td>
              <td>${esc(f.theme)}</td>
              <td><span class="fact-type-badge fact-type-${f.type.toLowerCase()}">${esc(f.type)}</span></td>
              <td class="editable-cell" data-id="${f.id}" data-field="description">${esc(f.description)}</td>
              <td class="editable-cell fact-quote" data-id="${f.id}" data-field="quote" style="position: relative; padding-right: 2rem;">
                <span>${esc(f.quote)}</span>
                ${f.quote ? `
                <button class="locate-quote-btn" data-country="${esc(f.country)}" data-quote="${esc(f.quote)}" title="Locate in text" style="position: absolute; right: 4px; top: 50%; transform: translateY(-50%); background: transparent; border: none; cursor: pointer; color: var(--primary); display: flex; align-items: center; justify-content: center; padding: 2px;">
                  <i data-lucide="eye" style="width: 14px; height: 14px;"></i>
                </button>` : ""}
              </td>`;
    
    if (isMatrix) {
      html += `<td class="editable-cell" data-id="${f.id}" data-field="timing_of_measure">${esc(f.timing_of_measure)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="depth_of_change">${esc(f.depth_of_change)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="governance_level">${esc(f.governance_level)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="readiness">${esc(f.readiness)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="robustness">${esc(f.robustness)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="spatial_scope">${esc(f.spatial_scope)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="cost_benefit">${esc(f.cost_benefit)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="function">${esc(f.function)}</td>
               <td class="editable-cell" data-id="${f.id}" data-field="strategy_type">${esc(f.strategy_type)}</td>`;
    }
    
    html += `  <td>
                <button class="fact-delete-btn" data-id="${f.id}" title="Delete fact">
                  <i data-lucide="trash-2"></i>
                </button>
              </td>
             </tr>`;
  });
  html += `</tbody></table></div>`;
  c.innerHTML = html;

  // Bind locate quote buttons
  c.querySelectorAll(".locate-quote-btn").forEach(btn => {
    btn.addEventListener("click", function(e) {
      e.stopPropagation();
      const country = this.dataset.country;
      const quote = this.dataset.quote;
      locateQuoteInTextExplorer(country, quote);
    });
  });

  icons();
  makeCellsEditable();
  bindFactDeletion();
}

function locateQuoteInTextExplorer(country, quote) {
  if (!quote) return;
  switchTab("single");
  const rIdx = reports.findIndex(r => r.countryLabel === country);
  if (rIdx >= 0) {
    selectedReportIdx = rIdx;
    const selector = document.getElementById("report-selector");
    if (selector) selector.value = rIdx;
    displaySingleReport();
  }
  const searchInput = document.getElementById("text-search-input");
  if (searchInput) {
    searchInput.value = quote;
    renderExtractedText(quote);
  }
  setTimeout(() => {
    const el = document.querySelector(".text-highlight");
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.style.outline = "3px solid var(--primary)";
      el.style.transition = "outline 0.5s ease";
      setTimeout(() => el.style.outline = "none", 2000);
    }
  }, 150);
}

function makeCellsEditable() {
  document.querySelectorAll(".editable-cell").forEach(cell => {
    cell.addEventListener("click", function() {
      if (this.querySelector("textarea, input, select")) return; // Already editing
      
      const id = this.dataset.id;
      const field = this.dataset.field;
      const originalText = this.textContent.trim();
      
      this.classList.remove("editable-cell");
      this.innerHTML = "";
      
      let el;
      if (MATRIX_OPTIONS[field]) {
        el = document.createElement("select");
        el.className = "cell-edit-input";
        MATRIX_OPTIONS[field].forEach(opt => {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          if (opt === originalText) o.selected = true;
          el.appendChild(o);
        });
      } else {
        el = document.createElement(field === "quote" ? "textarea" : "input");
        el.className = field === "quote" ? "cell-edit-textarea" : "cell-edit-input";
        el.value = originalText;
        if (field === "quote") el.rows = 3;
      }
      
      this.appendChild(el);
      el.focus();
      
      const saveEdit = () => {
        const newVal = el.value.trim();
        const fact = allFacts.find(f => f.id === id);
        if (fact) {
          fact[field] = newVal;
        }
        this.classList.add("editable-cell");
        this.innerHTML = esc(newVal);
      };
      
      el.addEventListener("blur", saveEdit);
      el.addEventListener("change", () => {
        if (el.tagName === "SELECT") el.blur();
      });
      el.addEventListener("keydown", e => {
        if (e.key === "Enter" && (el.tagName === "SELECT" || field !== "quote" || e.ctrlKey)) {
          e.preventDefault();
          el.blur();
        }
        if (e.key === "Escape") {
          el.value = originalText;
          el.blur();
        }
      });
    });
  });
}

function bindFactDeletion() {
  document.querySelectorAll(".fact-delete-btn").forEach(btn => {
    btn.addEventListener("click", function() {
      const id = this.dataset.id;
      if (confirm("Are you sure you want to delete this fact from the database?")) {
        allFacts = allFacts.filter(f => f.id !== id);
        renderFactsTable();
      }
    });
  });
}


// ── Choropleth Map Module ───────────────────────────────────
const COUNTRY_ISO_MAP = {
  "uk": 826, "united kingdom": 826, "great britain": 826, "england": 826,
  "france": 250, "french": 250,
  "germany": 276, "deutschland": 276,
  "spain": 724, "españa": 724,
  "italy": 380, "italia": 380,
  "south korea": 410, "korea": 410, "republic of korea": 410,
  "united states": 840, "usa": 840, "us": 840, "america": 840,
  "canada": 124,
  "australia": 36,
  "japan": 392,
  "china": 156,
  "india": 356,
  "brazil": 76,
  "mexico": 484,
  "south africa": 710,
  "netherlands": 528,
  "sweden": 752,
  "norway": 578,
  "finland": 246,
  "denmark": 208,
  "ireland": 372,
  "switzerland": 756,
  "austria": 40,
  "portugal": 620,
  "greece": 300,
  "belgium": 56,
  "new zealand": 554
};

let cachedWorldAtlas = null;

function populateMapMetricSelect() {
  const select = document.getElementById("map-metric-select");
  if (!select) return;
  const currentVal = select.value;
  let html = `<optgroup label="Thematic Sectors / Focus Areas">`;
  categories.forEach(cat => {
    html += `<option value="theme:${esc(cat.name)}">${esc(cat.name)} (%)</option>`;
  });
  html += `</optgroup>`;

  if (taxonomySchema === "policy_matrix") {
    html += `<optgroup label="Policy Attributes (% of Extracted Measures)">`;
    Object.keys(MATRIX_OPTIONS).forEach(dim => {
      const dimLabel = DIMENSION_LABELS[dim] || dim;
      MATRIX_OPTIONS[dim].forEach(opt => {
        html += `<option value="dim:${dim}:${opt}">${esc(dimLabel)}: ${esc(opt)} (%)</option>`;
      });
    });
    html += `</optgroup>`;
  }

  select.innerHTML = html;
  if (currentVal && select.querySelector(`option[value="${currentVal}"]`)) {
    select.value = currentVal;
  }
}

function getIsoCodeForCountryLabel(label) {
  if (!label) return null;
  const clean = label.toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();
  if (COUNTRY_ISO_MAP[clean]) return COUNTRY_ISO_MAP[clean];
  for (const k in COUNTRY_ISO_MAP) {
    if (clean.includes(k)) return COUNTRY_ISO_MAP[k];
  }
  return null;
}

async function renderChoroplethMap() {
  const container = document.getElementById("map-container");
  const svgEl = document.getElementById("choropleth-svg");
  const select = document.getElementById("map-metric-select");
  const tooltip = document.getElementById("map-tooltip");
  if (!container || !svgEl || !select || !window.d3 || !window.topojson) return;

  const metricVal = select.value || (categories[0] ? `theme:${categories[0].name}` : "");
  if (!metricVal) return;

  const metricText = select.options[select.selectedIndex]?.text || "Adaptation Metric";

  // Calculate country scores for metric
  const countryData = {}; // iso -> { label, value }
  reports.forEach(r => {
    const iso = getIsoCodeForCountryLabel(r.countryLabel);
    if (!iso) return;

    let val = 0;
    if (metricVal.startsWith("theme:")) {
      const themeName = metricVal.substring(6);
      const t = (r.results?.topics || []).find(x => x.name === themeName);
      val = t ? t.percentage : 0;
    } else if (metricVal.startsWith("dim:")) {
      const parts = metricVal.split(":");
      const dim = parts[1];
      const opt = parts[2];
      const facts = allFacts.filter(f => f.country === r.countryLabel);
      const matching = facts.filter(f => f[dim] === opt);
      val = facts.length > 0 ? Math.round((matching.length / facts.length) * 100) : 0;
    }

    countryData[iso] = { label: r.countryLabel, value: val };
  });

  // Calculate max value for color scale
  const values = Object.values(countryData).map(d => d.value);
  const maxVal = values.length > 0 ? Math.max(...values, 10) : 100;

  // Read customization inputs
  const titleInput = document.getElementById("map-title-input");
  const subtitleInput = document.getElementById("map-subtitle-input");
  const legendTitleInput = document.getElementById("map-legend-title-input");

  const customTitle = titleInput ? titleInput.value : "Global Climate Adaptation Choropleth Map";
  const customSubtitle = subtitleInput ? subtitleInput.value : `Mapped Metric: ${metricText}`;
  const customLegendTitle = legendTitleInput ? legendTitleInput.value : "GRADIENT SCALE";
  const scaleType = document.getElementById("map-scale-type-select")?.value || "continuous";
  const paletteChoice = document.getElementById("map-color-scheme-select")?.value || "YlGnBu";

  let interpolator = d3.interpolateYlGnBu;
  let gradientStops = ["#e0f2fe", "#0284c7", "#1d4e89"];

  if (paletteChoice === "Viridis") {
    interpolator = d3.interpolateViridis;
    gradientStops = ["#fde725", "#21918c", "#440154"];
  } else if (paletteChoice === "Plasma") {
    interpolator = d3.interpolatePlasma;
    gradientStops = ["#f0f921", "#cc4778", "#0d0887"];
  } else if (paletteChoice === "Blues") {
    interpolator = d3.interpolateBlues;
    gradientStops = ["#eff3ff", "#6baed6", "#08519c"];
  } else if (paletteChoice === "Reds") {
    interpolator = d3.interpolateReds;
    gradientStops = ["#fff5f0", "#fb6a4a", "#67000d"];
  }

  // Generate 5 discrete step colors
  const stepColors = [0.1, 0.3, 0.5, 0.7, 0.9].map(t => interpolator(t));

  // Color scale selection
  let colorScale;
  if (scaleType === "discrete") {
    colorScale = d3.scaleQuantize()
      .domain([0, maxVal])
      .range(stepColors);
  } else {
    colorScale = d3.scaleSequential()
      .domain([0, maxVal])
      .interpolator(interpolator);
  }

  // Update HTML Legend Labels & Gradient Bar
  const minLabel = document.getElementById("legend-min-label");
  const maxLabel = document.getElementById("legend-max-label");
  const htmlGradientBar = document.getElementById("legend-gradient-bar");
  if (minLabel) minLabel.textContent = "0%";
  if (maxLabel) maxLabel.textContent = `${maxVal}%`;
  if (htmlGradientBar) {
    if (scaleType === "discrete") {
      htmlGradientBar.style.background = `linear-gradient(to right, ${stepColors[0]} 0% 20%, ${stepColors[1]} 20% 40%, ${stepColors[2]} 40% 60%, ${stepColors[3]} 60% 80%, ${stepColors[4]} 80% 100%)`;
    } else {
      htmlGradientBar.style.background = `linear-gradient(to right, ${gradientStops.join(', ')})`;
    }
  }

  // Fetch 50m high-resolution world atlas topology if not cached
  if (!cachedWorldAtlas) {
    try {
      const res = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json");
      cachedWorldAtlas = await res.json();
    } catch (err) {
      console.warn("High-res 50m topology load failed, falling back to 110m:", err);
      try {
        const res2 = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json");
        cachedWorldAtlas = await res2.json();
      } catch (err2) {
        console.error("Failed to load map topology:", err2);
        return;
      }
    }
  }

  const svg = d3.select(svgEl);
  svg.selectAll("*").remove(); // Clear previous rendering

  const width = 960;
  const height = 520;
  const projection = d3.geoNaturalEarth1()
    .scale(165)
    .translate([width / 2, height / 2 + 15]);

  const pathGenerator = d3.geoPath().projection(projection);
  const countries = topojson.feature(cachedWorldAtlas, cachedWorldAtlas.objects.countries).features;

  // 1. Background Ocean
  svg.append("rect")
    .attr("width", width)
    .attr("height", height)
    .attr("fill", "#f8f9fa");

  // 2. High-Resolution Country Paths
  const mapGroup = svg.append("g");

  mapGroup.selectAll("path")
    .data(countries)
    .enter()
    .append("path")
    .attr("d", pathGenerator)
    .attr("fill", d => {
      const data = countryData[+d.id];
      return data ? colorScale(data.value) : "#e5e7eb";
    })
    .attr("stroke", "#ffffff")
    .attr("stroke-width", d => countryData[+d.id] ? "1.2px" : "0.5px")
    .style("cursor", d => countryData[+d.id] ? "pointer" : "default")
    .on("mouseover", function (event, d) {
      const data = countryData[+d.id];
      d3.select(this)
        .attr("stroke", "#1d4e89")
        .attr("stroke-width", "2.5px");

      if (tooltip) {
        const labelText = data ? `<b>${esc(data.label)}</b><br>${esc(metricText)}: <b>${data.value}%</b>` : `<b>Country ID: ${d.id}</b><br>No report data uploaded`;
        tooltip.innerHTML = labelText;
        tooltip.style.display = "block";
      }
    })
    .on("mousemove", function (event) {
      if (tooltip) {
        const bounds = container.getBoundingClientRect();
        tooltip.style.left = (event.clientX - bounds.left + 12) + "px";
        tooltip.style.top = (event.clientY - bounds.top + 12) + "px";
      }
    })
    .on("mouseleave", function (event, d) {
      d3.select(this)
        .attr("stroke", "#ffffff")
        .attr("stroke-width", countryData[+d.id] ? "1.2px" : "0.5px");
      if (tooltip) tooltip.style.display = "none";
    });

  // 3. In-SVG Title & Active Metric Header (for Live Preview, SVG & PNG Export)
  if (customTitle.trim() || customSubtitle.trim()) {
    const headerGroup = svg.append("g")
      .attr("transform", "translate(25, 35)");

    if (customTitle.trim()) {
      headerGroup.append("text")
        .attr("x", 0)
        .attr("y", 0)
        .attr("font-family", "'DM Serif Display', Georgia, serif")
        .attr("font-size", "20px")
        .attr("font-weight", "bold")
        .attr("fill", "#1a1a18")
        .text(customTitle);
    }

    if (customSubtitle.trim()) {
      headerGroup.append("text")
        .attr("x", 0)
        .attr("y", customTitle.trim() ? 22 : 0)
        .attr("font-family", "'Inter', system-ui, sans-serif")
        .attr("font-size", "13px")
        .attr("font-weight", "600")
        .attr("fill", gradientStops[2] || "#1d4e89")
        .text(customSubtitle);
    }
  }

  // 4. In-SVG Gradient Scale Legend (for SVG & PNG Export)
  const defs = svg.append("defs");
  const linearGrad = defs.append("linearGradient")
    .attr("id", "svg-choropleth-gradient")
    .attr("x1", "0%").attr("y1", "0%")
    .attr("x2", "100%").attr("y2", "0%");

  linearGrad.append("stop").attr("offset", "0%").attr("stop-color", gradientStops[0]);
  linearGrad.append("stop").attr("offset", "50%").attr("stop-color", gradientStops[1]);
  linearGrad.append("stop").attr("offset", "100%").attr("stop-color", gradientStops[2]);

  // Clean Legend Layout (Adaptive based on presence of Legend Title)
  const hasLegendTitle = customLegendTitle.trim().length > 0;
  const barY = hasLegendTitle ? 18 : 5;
  const labelY = barY + 24;
  const cardH = hasLegendTitle ? 65 : 46;
  const legendYPos = hasLegendTitle ? 430 : 445;

  const legendGroup = svg.append("g")
    .attr("transform", `translate(25, ${legendYPos})`);

  // Legend Card Background
  legendGroup.append("rect")
    .attr("x", -10)
    .attr("y", -10)
    .attr("width", 260)
    .attr("height", cardH)
    .attr("fill", "rgba(255, 255, 255, 0.92)")
    .attr("stroke", "#e4e3de")
    .attr("stroke-width", "1px")
    .attr("rx", 6);

  // Render Title ONLY if user provided a non-empty string
  if (hasLegendTitle) {
    legendGroup.append("text")
      .attr("x", 0)
      .attr("y", 4)
      .attr("font-family", "'Inter', system-ui, sans-serif")
      .attr("font-size", "11px")
      .attr("font-weight", "600")
      .attr("fill", "#6b6b63")
      .text(customLegendTitle.trim().toUpperCase());
  }

  if (scaleType === "discrete") {
    // Render 5 discrete color blocks
    const blockW = 46;
    stepColors.forEach((col, idx) => {
      legendGroup.append("rect")
        .attr("x", idx * (blockW + 2))
        .attr("y", barY)
        .attr("width", blockW)
        .attr("height", 12)
        .attr("rx", 2)
        .attr("fill", col)
        .attr("stroke", "#c8c7c0")
        .attr("stroke-width", "0.5px");
    });
  } else {
    // Render continuous gradient bar
    legendGroup.append("rect")
      .attr("x", 0)
      .attr("y", barY)
      .attr("width", 240)
      .attr("height", 12)
      .attr("rx", 3)
      .attr("fill", "url(#svg-choropleth-gradient)")
      .attr("stroke", "#c8c7c0")
      .attr("stroke-width", "0.5px");
  }

  // Legend Bounds Labels (0% and Max%)
  legendGroup.append("text")
    .attr("x", 0)
    .attr("y", labelY)
    .attr("font-family", "'Inter', system-ui, sans-serif")
    .attr("font-size", "11px")
    .attr("font-weight", "600")
    .attr("fill", "#1a1a18")
    .text("0%");

  legendGroup.append("text")
    .attr("x", 240)
    .attr("y", labelY)
    .attr("text-anchor", "end")
    .attr("font-family", "'Inter', system-ui, sans-serif")
    .attr("font-size", "11px")
    .attr("font-weight", "600")
    .attr("fill", "#1a1a18")
    .text(maxVal + "%");
}

function exportMapSVG() {
  const svgEl = document.getElementById("choropleth-svg");
  if (!svgEl) return;
  const serializer = new XMLSerializer();
  const source = '<?xml version="1.0" encoding="UTF-8"?>\n' + serializer.serializeToString(svgEl);
  download(source, "global_adaptation_choropleth_map.svg", "image/svg+xml;charset=utf-8");
  toast("Exported Map SVG", "success");
}

function downloadMapAsPNG(filename = "global_adaptation_choropleth_map.png") {
  return new Promise((resolve) => {
    const svgEl = document.getElementById("choropleth-svg");
    if (!svgEl) { resolve(); return; }

    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;  // 2x high-res output
      canvas.height = 1000;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob(blob => {
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          a.remove();
          URL.revokeObjectURL(pngUrl);
          resolve();
        }, 150);
      }, "image/png");
    };
    img.onerror = () => resolve();
    img.src = url;
  });
}

function exportMapPNG() {
  downloadMapAsPNG("global_adaptation_choropleth_map.png").then(() => {
    toast("Exported High-Res PNG Map", "success");
  });
}

async function exportAllMapImages() {
  const select = document.getElementById("map-metric-select");
  if (!select || select.options.length === 0) {
    toast("No metrics available to export", "warning");
    return;
  }

  const options = Array.from(select.options);
  const originalIndex = select.selectedIndex;

  toast(`Starting Batch Export of ${options.length} Map Images...`, "info", 4000);

  for (let i = 0; i < options.length; i++) {
    const opt = options[i];
    select.selectedIndex = i;

    // Render map for current metric
    await renderChoroplethMap();

    // Clean file name
    const rawName = opt.text.replace(/[^a-z0-9]/gi, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "");
    const filename = `Choropleth_${i + 1}_${rawName}.png`;

    // Download PNG
    await downloadMapAsPNG(filename);
    toast(`Exported (${i + 1}/${options.length}): ${opt.text}`, "info", 1500);

    // Stagger downloads slightly to prevent browser download throttling
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Restore original metric choice
  select.selectedIndex = originalIndex;
  await renderChoroplethMap();

  toast(`Batch Export Complete! Downloaded ${options.length} High-Res Map Images.`, "success", 5000);
}

// ── Export Functions ──────────────────────────────────────────
function exportSingleJSON() {
  const r = reports[selectedReportIdx];
  if (!r?.results) return;
  download(JSON.stringify({ country: r.countryLabel, ...r.results }, null, 2), `${r.countryLabel}_analysis.json`, "application/json");
}

function exportComparisonCSV() {
  const themeNames = categories.map(c => c.name);
  let csv = "Country," + themeNames.map(t => `"${t.replace(/"/g, '""')}"`).join(",") + "\n";
  reports.forEach(r => {
    csv += `"${r.countryLabel.replace(/"/g, '""')}",` + themeNames.map(theme => {
      const t = (r.results?.topics || []).find(x => x.name === theme);
      return t ? t.percentage : 0;
    }).join(",") + "\n";
  });
  download(csv, "comparison_matrix.csv", "text/csv");
}

function exportFactsCSV() {
  const facts = getAllFacts();
  let csv = "";
  if (taxonomySchema === "policy_matrix") {
    csv = "Country,Type of Measure,Fact Type,Description,Quote,Timing of Measure,Depth of Change,Governance and Actor Level,Implementation Readiness,Adaptability and Robustness,Spatial Scope,Cost-Benefit Complexity,Adaptation Function,Strategy Type\n";
    facts.forEach(f => {
      csv += `"${f.country}","${f.theme}","${f.type}","${f.description.replace(/"/g, '""')}","${f.quote.replace(/"/g, '""')}","${f.timing_of_measure}","${f.depth_of_change}","${f.governance_level}","${f.readiness}","${f.robustness}","${f.spatial_scope}","${f.cost_benefit}","${f.function}","${f.strategy_type}"\n`;
    });
  } else {
    csv = "Country,Theme,Type,Description,Quote\n";
    facts.forEach(f => {
      csv += `"${f.country}","${f.theme}","${f.type}","${f.description.replace(/"/g, '""')}","${f.quote.replace(/"/g, '""')}"\n`;
    });
  }
  download(csv, "adaptation_facts_database.csv", "text/csv");
}

function exportFactsJSON() {
  download(JSON.stringify(getAllFacts(), null, 2), "adaptation_facts_database.json", "application/json");
}

function download(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 100);
}

// ── Utilities ────────────────────────────────────────────────
function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function cleanId(n) { return n.toLowerCase().replace(/[^a-z0-9]/g, "-"); }
function icons() { if (window.lucide) window.lucide.createIcons(); }

function mdToHtml(str) {
  if (!str) return "";
  let html = esc(str);
  // Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  
  // Custom Headings, Bullets, Paragraphs
  const lines = html.split("\n");
  let inList = false;
  
  const processed = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const item = trimmed.substring(2);
      if (!inList) {
        inList = true;
        return `<ul style="margin-left: 1.25rem; margin-bottom: 0.75rem; list-style-type: disc;"><li>${item}</li>`;
      }
      return `<li>${item}</li>`;
    } else {
      let suffix = "";
      if (inList) {
        inList = false;
        suffix = "</ul>";
      }
      
      if (trimmed.startsWith("### ")) {
        return suffix + `<h5 style="font-size: 0.9rem; font-weight: 600; margin-top: 0.85rem; margin-bottom: 0.35rem; color: var(--ink);">${trimmed.substring(4)}</h5>`;
      }
      if (trimmed.startsWith("## ")) {
        return suffix + `<h4 style="font-size: 0.98rem; font-weight: 600; margin-top: 1rem; margin-bottom: 0.4rem; color: var(--primary);">${trimmed.substring(3)}</h4>`;
      }
      if (trimmed.length === 0) {
        return suffix; // empty line
      }
      return suffix + `<p style="margin-bottom: 0.6rem;">${trimmed}</p>`;
    }
  });

  if (inList) {
    processed.push("</ul>");
  }

  return processed.join("\n").replace(/\n/g, "");
}

})();
