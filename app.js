/**
 * PMG PHARMACY - BLUEBOOK DRUG REFERENCE PWA (app.js)
 * High-performance clinical reference with secure teammate authentication,
 * 13-column drug database search, Frank Shann paediatric dosing, and safety badges.
 */

// --- CONFIGURATION & BACKEND ENDPOINTS ---
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwY_lVzzrHYb9VAqbx0me6BjXJfPsg3nHPhyPwKgj_ocryi1w-Vkf8BC02OR_8wvd9rIw/exec";
const CACHE_KEY_DRUGS = "pmg_bluebook_drugdata";
const CACHE_KEY_TIMESTAMP = "pmg_bluebook_timestamp";
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours offline cache

// Global Application State
var allDrugs = [];
var filteredDrugs = [];
var currentCategory = "All";
var currentUser = null;

// Helper selector
function $(id) {
  return document.getElementById(id);
}

// ==========================================
// 1. SECURE TEAMMATE AUTHENTICATION
// ==========================================

/**
 * Log in teammate via Google Apps Script backend
 */
async function loginUser(username, password) {
  const errEl = $("loginError");
  const btn = $("loginSubmitBtn");
  const userInput = $("loginUsername");
  const passInput = $("loginPassword");

  const cleanUser = (username || (userInput ? userInput.value : "")).trim().toLowerCase();
  const cleanPass = (password || (passInput ? passInput.value : "")).trim();

  if (!cleanUser || !cleanPass) {
    showAuthError("Please enter both username and password.");
    return;
  }

  if (errEl) {
    errEl.innerText = "Verifying credentials with server...";
    errEl.style.color = "#0284c7";
    errEl.style.display = "block";
  }
  if (btn) btn.disabled = true;

  try {
    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "login",
        username: cleanUser,
        password: cleanPass
      })
    });

    const result = await response.json();

    if (result && result.success) {
      // Store session in localStorage
      localStorage.setItem("bluebook_auth_token", result.token || "valid_token");
      localStorage.setItem("bluebook_user", JSON.stringify(result.user));
      currentUser = result.user;

      if (errEl) errEl.style.display = "none";
      if (passInput) passInput.value = "";

      showAppDashboard();
      initDrugData(); // Fetch or load cached clinical data
    } else {
      showAuthError(result.error || "Invalid username or password.");
      if (passInput) passInput.value = "";
    }
  } catch (err) {
    console.error("Authentication connection error:", err);
    showAuthError("Network error connecting to verification server.");
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Log out teammate and scrub state
 */
function logoutUser() {
  localStorage.removeItem("bluebook_auth_token");
  localStorage.removeItem("bluebook_user");
  currentUser = null;
  showLoginScreen();
}

/**
 * Check existing authentication session on app launch
 */
function checkAuthSession() {
  const token = localStorage.getItem("bluebook_auth_token");
  const userStr = localStorage.getItem("bluebook_user");

  if (token && userStr) {
    try {
      currentUser = JSON.parse(userStr);
      showAppDashboard();
      initDrugData();
      // Silent background re-verification in case teammate was set to Inactive
      verifySessionBackground(currentUser.username);
      return;
    } catch (e) {
      logoutUser();
    }
  } else {
    showLoginScreen();
  }
}

/**
 * Silent background verification against Google Sheet
 */
async function verifySessionBackground(username) {
  try {
    const res = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "checkSession",
        username: username
      })
    });
    const data = await res.json();
    if (data && !data.success) {
      console.warn("Session revoked by administrator.");
      logoutUser();
    }
  } catch (e) {
    console.log("Offline mode, background check skipped:", e);
  }
}

function showAuthError(msg) {
  const errEl = $("loginError");
  if (errEl) {
    errEl.innerText = msg;
    errEl.style.color = "#dc2626";
    errEl.style.display = "block";
  }
}

function showLoginScreen() {
  const loginView = $("loginView") || $("authOverlay");
  const appView = $("appDashboard") || $("mainContent");
  if (loginView) loginView.style.display = "flex";
  if (appView) appView.style.display = "none";
}

function showAppDashboard() {
  const loginView = $("loginView") || $("authOverlay");
  const appView = $("appDashboard") || $("mainContent");
  if (loginView) loginView.style.display = "none";
  if (appView) appView.style.display = "block";

  const userBadge = $("userDisplayName");
  if (userBadge && currentUser) {
    userBadge.innerText = currentUser.displayName || currentUser.username;
  }
}

// ==========================================
// 2. DRUG DATABASE ENGINE & CACHING
// ==========================================

/**
 * Initialize drug database: uses local cache first for instant speed, then refreshes
 */
async function initDrugData() {
  const cachedData = localStorage.getItem(CACHE_KEY_DRUGS);
  const cacheTime = parseInt(localStorage.getItem(CACHE_KEY_TIMESTAMP) || "0", 10);
  const isExpired = (Date.now() - cacheTime) > CACHE_TTL_MS;

  if (cachedData) {
    try {
      allDrugs = JSON.parse(cachedData);
      filteredDrugs = [...allDrugs];
      renderDrugList();
      populateCategoryFilters();
      if (!isExpired) return;
    } catch (e) {}
  }

  await fetchDrugDataFromCloud();
}

/**
 * Fetch 13-column drug database from Google Apps Script Web App
 */
async function fetchDrugDataFromCloud() {
  const statusEl = $("syncStatus");
  if (statusEl) statusEl.innerText = "Syncing clinical database...";

  try {
    const res = await fetch(SCRIPT_URL + "?action=getDrugData&t=" + Date.now());
    const data = await res.json();

    if (data && data.success && Array.isArray(data.drugs)) {
      allDrugs = data.drugs;
      filteredDrugs = [...allDrugs];

      try {
        localStorage.setItem(CACHE_KEY_DRUGS, JSON.stringify(allDrugs));
        localStorage.setItem(CACHE_KEY_TIMESTAMP, Date.now().toString());
      } catch (e) {}

      renderDrugList();
      populateCategoryFilters();

      if (statusEl) {
        statusEl.innerText = `Updated: ${allDrugs.length} medications loaded`;
        setTimeout(() => { statusEl.innerText = ""; }, 3000);
      }
    } else {
      if (statusEl) statusEl.innerText = "Using cached clinical database";
    }
  } catch (err) {
    console.warn("Could not reach Google Sheets, running from local cache:", err);
    if (statusEl) statusEl.innerText = "Offline Mode (Cached Data)";
  }
}

// ==========================================
// 3. CLINICAL SEARCH & FILTERING ENGINE
// ==========================================

/**
 * Omni-search across all critical drug fields
 */
function handleDrugSearch() {
  const searchInput = $("drugSearchInput");
  const query = (searchInput ? searchInput.value : "").trim().toLowerCase();

  filteredDrugs = allDrugs.filter(drug => {
    // 1. Category filter
    const matchesCat = (currentCategory === "All") || 
      (drug.Class && drug.Class.toLowerCase().includes(currentCategory.toLowerCase()));

    if (!matchesCat) return false;
    if (!query) return true;

    // 2. Multi-field search
    const brand = String(drug.OriginalBrandName || "").toLowerCase();
    const active = String(drug.ActiveIngredient || "").toLowerCase();
    const generic = String(drug.GenericBrandName || "").toLowerCase();
    const indications = String(drug.Indications || "").toLowerCase();
    const drugClass = String(drug.Class || "").toLowerCase();
    const moa = String(drug.MOA || "").toLowerCase();
    const counseling = String(drug.CounselingPoints || "").toLowerCase();

    return brand.includes(query) ||
           active.includes(query) ||
           generic.includes(query) ||
           indications.includes(query) ||
           drugClass.includes(query) ||
           moa.includes(query) ||
           counseling.includes(query);
  });

  renderDrugList();
}

/**
 * Filter by drug class
 */
function setCategoryFilter(category) {
  currentCategory = category;
  
  document.querySelectorAll(".category-pill").forEach(pill => {
    if (pill.dataset.category === category) {
      pill.classList.add("active");
    } else {
      pill.classList.remove("active");
    }
  });

  handleDrugSearch();
}

function populateCategoryFilters() {
  const container = $("categoryFilterContainer");
  if (!container) return;

  const categories = ["All", "Analgesic", "Antihistamine", "Respiratory", "Antibiotic", "Gastrointestinal", "Diuretic", "Cardiovascular", "Dermatology", "Endocrine"];
  
  container.innerHTML = categories.map(cat => `
    <button class="category-pill ${cat === currentCategory ? 'active' : ''}" 
            data-category="${cat}" 
            onclick="setCategoryFilter('${cat}')">
      ${cat}
    </button>
  `).join("");
}

// ==========================================
// 4. RENDERING DRUG CARDS & CLINICAL MODALS
// ==========================================

function renderDrugList() {
  const listContainer = $("drugListContainer");
  const countBadge = $("drugResultsCount");
  if (!listContainer) return;

  if (countBadge) {
    countBadge.innerText = `${filteredDrugs.length} medications found`;
  }

  if (filteredDrugs.length === 0) {
    listContainer.innerHTML = `
      <div class="empty-state" style="text-align:center; padding:30px 10px; color:#64748b;">
        <div style="font-size: 2.2rem; margin-bottom: 6px;">🔍</div>
        <p style="margin:0; font-weight:700;">No medications found.</p>
        <small>Try searching by brand (e.g. Diamox, Panadol) or active ingredient (e.g. Acetazolamide).</small>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = filteredDrugs.map((drug, index) => {
    const isAltitude = String(drug.ActiveIngredient || "").toLowerCase().includes("acetazolamide");

    return `
      <div class="drug-card ${isAltitude ? 'highlight-card' : ''}" onclick="openDrugDetailModal(${index})">
        <div class="drug-card-header">
          <div>
            <h3 class="drug-brand-title">${escapeHtml(drug.OriginalBrandName || "Generic")}</h3>
            <div class="drug-active-ingredient">${escapeHtml(drug.ActiveIngredient || "")}</div>
          </div>
          <span class="class-badge">${escapeHtml(drug.Class ? drug.Class.split('/')[0].trim() : "General")}</span>
        </div>

        <div class="drug-generic-row">
          <span class="label">PMG Generics:</span> 
          <span class="val">${escapeHtml(drug.GenericBrandName || "N/A")}</span>
        </div>

        <div class="drug-indication-row">
          <span class="label">Indications:</span> 
          <span class="val">${escapeHtml(truncate(drug.Indications, 110))}</span>
        </div>

        <div class="drug-safety-tags">
          ${renderPregnancyBadge(drug.PregnancySuitability)}
          ${renderG6pdBadge(drug.G6PDSuitability)}
          ${isAltitude ? '<span class="safety-badge badge-altitude">🏔️ Altitude Sickness</span>' : ''}
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Open 13-column clinical detail modal
 */
function openDrugDetailModal(index) {
  const drug = filteredDrugs[index];
  if (!drug) return;

  const modal = $("drugModal");
  const modalContent = $("drugModalDetails");
  if (!modal || !modalContent) return;

  const isAcetazolamide = String(drug.ActiveIngredient || "").toLowerCase().includes("acetazolamide");

  modalContent.innerHTML = `
    <div class="modal-header-section">
      <div class="modal-title-group">
        <span class="modal-class-tag">${escapeHtml(drug.Class || "Pharmacological Class")}</span>
        <h2 class="modal-drug-title">${escapeHtml(drug.OriginalBrandName || "")}</h2>
        <div class="modal-active-title">Active Ingredient: <b>${escapeHtml(drug.ActiveIngredient || "")}</b></div>
        <div class="modal-generics-tag">🏪 PMG Stock Brands: ${escapeHtml(drug.GenericBrandName || "None listed")}</div>
      </div>
      <button class="modal-close-btn" onclick="closeDrugDetailModal()">✕</button>
    </div>

    <div class="modal-safety-bar">
      ${renderPregnancyBadge(drug.PregnancySuitability, true)}
      ${renderG6pdBadge(drug.G6PDSuitability, true)}
    </div>

    <div class="clinical-details-grid">
      
      <!-- Primary Indications -->
      <div class="detail-block">
        <h4>📋 Indications</h4>
        <p>${formatClinicalText(drug.Indications)}</p>
      </div>

      <!-- Mechanism of Action -->
      <div class="detail-block">
        <h4>🔬 Mechanism of Action (MOA)</h4>
        <p>${formatClinicalText(drug.MOA)}</p>
      </div>

      <!-- Adult Dosing (Specially Highlighted for Altitude Cases) -->
      <div class="detail-block dose-block ${isAcetazolamide ? 'altitude-highlight' : ''}">
        <h4>💊 Adult Dosage & Administration ${isAcetazolamide ? '🏔️ [High Altitude Protocol]' : ''}</h4>
        <div class="dose-content">${formatClinicalText(drug.DoseAdult)}</div>
      </div>

      <!-- Paediatric Dosing (Frank Shann) -->
      <div class="detail-block dose-block paediatric-block">
        <h4>👶 Paediatric Dosing (Frank Shann Guidelines)</h4>
        <div class="dose-content">${formatClinicalText(drug.DoseKids)}</div>
      </div>

      <!-- Patient Counseling Points -->
      <div class="detail-block counseling-block">
        <h4>🗣️ Patient Counseling Pearls</h4>
        <p>${formatClinicalText(drug.CounselingPoints)}</p>
      </div>

      <!-- Adverse Effects -->
      <div class="detail-block">
        <h4>⚠️ Side Effects & Precautions</h4>
        <p>${formatClinicalText(drug.SideEffects)}</p>
      </div>

      <!-- Key Interactions -->
      <div class="detail-block">
        <h4>🔄 Drug & Food Interactions</h4>
        <p>${formatClinicalText(drug.Interactions)}</p>
      </div>

    </div>
  `;

  modal.style.display = "flex";
  document.body.style.overflow = "hidden";
}

function closeDrugDetailModal() {
  const modal = $("drugModal");
  if (modal) modal.style.display = "none";
  document.body.style.overflow = "auto";
}

// ==========================================
// 5. SAFETY BADGE HELPERS
// ==========================================

function renderPregnancyBadge(text) {
  if (!text) return '<span class="safety-badge badge-neutral">Pregnancy: Consult</span>';
  const lower = text.toLowerCase();

  if (lower.includes("safe") || lower.includes("category a") || lower.includes("category b")) {
    return `<span class="safety-badge badge-safe">🤰 Pregnancy: Safe</span>`;
  } else if (lower.includes("contraindicated") || lower.includes("category x") || lower.includes("avoid")) {
    return `<span class="safety-badge badge-danger">🚫 Pregnancy: Contraindicated</span>`;
  } else {
    return `<span class="safety-badge badge-caution">⚠️ Pregnancy: Caution</span>`;
  }
}

function renderG6pdBadge(text) {
  if (!text) return '<span class="safety-badge badge-neutral">G6PD: Check</span>';
  const lower = text.toLowerCase();

  if (lower.includes("safe")) {
    return `<span class="safety-badge badge-safe">🩸 G6PD: Safe</span>`;
  } else if (lower.includes("contraindicated") || lower.includes("avoid")) {
    return `<span class="safety-badge badge-danger">🚫 G6PD: Contraindicated</span>`;
  } else {
    return `<span class="safety-badge badge-caution">⚠️ G6PD: Caution</span>`;
  }
}

// ==========================================
// 6. FORMATTING UTILITIES
// ==========================================

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function truncate(str, len) {
  if (!str) return "";
  return str.length > len ? str.substring(0, len) + "..." : str;
}

function formatClinicalText(text) {
  if (!text) return "<em>Not specified</em>";
  return escapeHtml(text)
    .replace(/(ALTITUDE ILLNESS|AMS Prophylaxis|AMS Treatment|Frank Shann|Max:)/g, '<b>$1</b>')
    .replace(/Category ([ABCDF|X])/g, '<b>Category $1</b>');
}

// ==========================================
// 7. INITIALIZATION
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  checkAuthSession();

  const searchInput = $("drugSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", handleDrugSearch);
  }

  const modal = $("drugModal");
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDrugDetailModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDrugDetailModal();
  });
});
