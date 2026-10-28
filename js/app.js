/**
 * ==========================================================================
 * Sakuin - Full CRUD Application Logic
 * File: js/app.js
 * ==========================================================================
 */

const STORAGE_KEY = "sakuin_modular_crud_v1";

// Asset Paths (Supports both local SVG assets & Unsplash high-res presets)
const ASSET_PRESETS = {
  konser: "assets/preset-konser.svg",
  gadget: "assets/preset-gadget.svg",
  liburan: "assets/preset-liburan.svg",
  kendaraan: "assets/preset-kendaraan.svg",
  localKonser: "assets/preset-konser.svg",
  localGadget: "assets/preset-gadget.svg",
  localLiburan: "assets/preset-liburan.svg",
  localKendaraan: "assets/preset-kendaraan.svg",
};

const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pad = (n) => String(n).padStart(2, "0");
function isoOf(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function todayISO() {
  return isoOf(new Date());
}
function nowTime() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function addDaysISO(n) {
  const d = new Date();
  d.setDate(d.getDate() + (parseInt(n) || 0));
  return isoOf(d);
}
function daysUntil(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const t = new Date();
  return Math.round(
    (new Date(y, m - 1, d) -
      new Date(t.getFullYear(), t.getMonth(), t.getDate())) /
      86400000,
  );
}
function dueLabel(n) {
  return n > 0
    ? `H-${n} jatuh tempo`
    : n === 0
      ? "Jatuh tempo hari ini"
      : `Terlambat ${-n} hari`;
}
function daysLeftInMonth() {
  const t = new Date();
  return (
    new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate() - t.getDate() + 1
  );
}
function getTodayTx() {
  const t = todayISO();
  return appData.transactions.filter((x) => x.date === t);
}

// Parser input cepat: "Kopi 25k", "Nasi 32rb", "Laptop 1,5jt", "Es teh 2 gelas 10k", "Bensin 1.500"
function parseQuick(val) {
  const ms = [
    ...val.matchAll(/(\d+(?:[.,]\d+)*)\s*(k|rb|ribu|jt|juta)?(?![a-z])/gi),
  ];
  if (!ms.length) return { amount: 0, name: val.trim() };
  const m = ms.find((x) => x[2]) || ms[ms.length - 1];
  let amount;
  if (m[2]) {
    const mult = /^(jt|juta)$/i.test(m[2]) ? 1e6 : 1e3;
    amount = Math.round(parseFloat(m[1].replace(",", ".")) * mult);
  } else {
    amount = parseInt(m[1].replace(/[.,]/g, ""), 10);
    if (amount < 1000) amount *= 1000;
  }
  const name =
    (val.slice(0, m.index) + " " + val.slice(m.index + m[0].length))
      .replace(/\s+/g, " ")
      .trim() || val.trim();
  return { amount, name };
}

const defaultState = {
  baseSafeToSpend: 0,
  remainingDays: daysLeftInMonth(),
  transactions: [],
  radar: [],
  goals: [],
  splitBills: [],
  vibes: [],
};

function normalizeState(p) {
  const s = JSON.parse(JSON.stringify(defaultState));
  if (!p || typeof p !== "object") return s;
  for (const k of ["transactions", "radar", "goals", "splitBills", "vibes"])
    if (Array.isArray(p[k]))
      s[k] = p[k].filter((x) => x && typeof x === "object");
  if (Number(p.baseSafeToSpend) >= 0)
    s.baseSafeToSpend = Math.round(Number(p.baseSafeToSpend));
  if (Number(p.remainingDays) > 0)
    s.remainingDays = Math.round(Number(p.remainingDays));
  const t = todayISO();
  s.transactions.forEach((x) => {
    x.amount = Number(x.amount) || 0;
    if (!x.date) x.date = t;
  });
  s.radar.forEach((r) => {
    r.amount = Number(r.amount) || 0;
    if (!r.dueDate) r.dueDate = addDaysISO(r.days);
  });
  s.goals.forEach((g) => {
    g.current = Number(g.current) || 0;
    g.target = Math.max(1, Number(g.target) || 1);
    g.img = g.img || ASSET_PRESETS.konser;
  });
  s.splitBills.forEach((b) => {
    b.subtotal = Number(b.subtotal) || 0;
    b.members = Math.max(1, Number(b.members) || 1);
    b.taxPct = Number(b.taxPct) || 0;
  });
  return s;
}

let appData = loadState();
let tempGoalImg = "";
let splitTextDirty = false;
let currentSplitTone = "santai";
let lastDeletedBackup = null;
let toastTimer = null;

// ================= STATE PERSISTENCE =================
function loadState() {
  let parsed = null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) parsed = JSON.parse(raw);
  } catch (e) {
    console.warn("Gagal membaca localStorage:", e);
  }
  return normalizeState(parsed);
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
  } catch (e) {
    console.warn(e);
    showToast("⚠️ Penyimpanan penuh/diblokir. Unduh backup agar data aman.");
  }
}

function resetDefaultData() {
  if (
    !confirm(
      "Hapus SEMUA data dan mulai dari awal? Tindakan ini tidak bisa dibatalkan.",
    )
  )
    return;
  appData = JSON.parse(JSON.stringify(defaultState));
  try {
    localStorage.removeItem("sakuin_setup_done");
  } catch (e) {}
  saveState();
  renderAll();
  showToast("🔄 Semua data berhasil di-reset ke pengaturan awal!");
  // Tampilkan onboarding lagi setelah reset
  setTimeout(() => openOnboardingModal(), 300);
}

// Initialize on DOM Ready
window.addEventListener("DOMContentLoaded", () => {
  initTheme();
  renderAll();
  document.getElementById("splitCustomText").addEventListener("input", () => {
    splitTextDirty = true;
  });
  const closeAll = () =>
    document.querySelectorAll('[id$="Modal"]').forEach((m) => {
      m.classList.add("hidden");
      m.classList.remove("flex");
    });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
  document.querySelectorAll('[id$="Modal"]').forEach((m) =>
    m.addEventListener("mousedown", (e) => {
      if (e.target === m) {
        m.classList.add("hidden");
        m.classList.remove("flex");
      }
    }),
  );
  triggerNotification(true);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
    navigator.serviceWorker.register("sw.js").catch(() => {});

  // Rotating placeholder for quick input
  const placeholders = [
    "Ketik: 'Kopi 25k', 'MRT 14rb', 'Nasi Padang 32k'...",
    "Coba: 'Grab 18rb', 'Indomaret 45k', 'Bensin 50k'...",
    "Format: 'nama barang + nominal', misal: 'Es teh 8k'",
    "Tip: ketik nominal dalam ribu (k) atau juta (jt) ✨",
  ];
  let phIdx = 0;
  const quickInputEl = document.getElementById("quickInput");
  if (quickInputEl) {
    setInterval(() => {
      phIdx = (phIdx + 1) % placeholders.length;
      quickInputEl.placeholder = placeholders[phIdx];
    }, 3000);
  }

  // Tampilkan onboarding setup jika user baru (belum set budget)
  checkFirstTimeSetup();
});

function checkFirstTimeSetup() {
  let hasSetup = false;
  try {
    hasSetup = localStorage.getItem("sakuin_setup_done") === "1";
  } catch (e) {}
  if (!hasSetup && appData.baseSafeToSpend === 0) {
    openOnboardingModal();
  }
}

function openOnboardingModal() {
  const m = document.getElementById("onboardingModal");
  if (m) {
    // Pre-fill sisa hari bulan ini
    const daysInput = document.getElementById("onboardingDaysInput");
    if (daysInput && !daysInput.value) daysInput.value = daysLeftInMonth();
    m.classList.remove("hidden");
    m.classList.add("flex");
    if (window.lucide) lucide.createIcons();
  }
}

function closeOnboardingModal() {
  const m = document.getElementById("onboardingModal");
  if (m) {
    m.classList.remove("flex");
    m.classList.add("hidden");
  }
}

function saveOnboarding() {
  const newLimit =
    parseInt(document.getElementById("onboardingDailyInput").value) || 0;
  const newDays =
    parseInt(document.getElementById("onboardingDaysInput").value) ||
    daysLeftInMonth();
  if (newLimit < 10000) {
    showToast("⚠️ Masukkan limit minimal Rp 10.000/hari ya!");
    return;
  }
  appData.baseSafeToSpend = newLimit;
  appData.remainingDays = Math.max(1, newDays);
  try {
    localStorage.setItem("sakuin_setup_done", "1");
  } catch (e) {}
  closeOnboardingModal();
  renderAll();
  showToast(
    `🎉 Selamat datang di Sakuin! Limit harian Rp ${newLimit.toLocaleString("id-ID")} siap.`,
  );
}

function renderAll() {
  saveState();
  renderTransactions();
  renderRadar();
  renderGoals();
  renderSplitBills();
  renderVibes();
  calculateSafeToSpend();
  if (window.lucide) {
    lucide.createIcons();
  }
}

// ================= 1. CRUD SAFE-TO-SPEND & BUDGET =================
function calculateSafeToSpend() {
  const todayTotal = getTodayTx().reduce((acc, curr) => acc + curr.amount, 0);
  const remainingToday = appData.baseSafeToSpend - todayTotal;
  const monthlyBudget = appData.baseSafeToSpend * appData.remainingDays;
  const monthlyLeft = monthlyBudget - todayTotal;

  document.getElementById("todayExpense").innerText =
    "Rp " + todayTotal.toLocaleString("id-ID");
  document.getElementById("safeToSpendAmount").innerText =
    "Rp " + remainingToday.toLocaleString("id-ID");
  document.getElementById("baseLimitLabel").innerText =
    `/ Rp ${appData.baseSafeToSpend.toLocaleString("id-ID")} limit harian`;
  document.getElementById("remainingDaysLabel").innerText =
    `${appData.remainingDays} hari`;
  document.getElementById("monthlyBudgetDisplay").innerText =
    "Rp " + monthlyBudget.toLocaleString("id-ID");
  document.getElementById("monthlyRemaining").innerText =
    "Rp " + Math.max(0, monthlyLeft).toLocaleString("id-ID");

  const statusBadge = document.getElementById("statusBadge");
  if (remainingToday > 40000) {
    statusBadge.className =
      "px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 flex items-center gap-1";
    statusBadge.innerHTML = `<i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Aman Terkendali`;
  } else if (remainingToday >= 0) {
    statusBadge.className =
      "px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 flex items-center gap-1";
    statusBadge.innerHTML = `<i data-lucide="alert-circle" class="w-3.5 h-3.5"></i> Mulai Tipis`;
  } else {
    statusBadge.className =
      "px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 flex items-center gap-1";
    statusBadge.innerHTML = `<i data-lucide="alert-triangle" class="w-3.5 h-3.5"></i> Over Limit`;
  }
}

function openBudgetModal() {
  document.getElementById("budgetDailyInput").value = appData.baseSafeToSpend;
  document.getElementById("budgetDaysInput").value = appData.remainingDays;
  document.getElementById("budgetModal").classList.remove("hidden");
  document.getElementById("budgetModal").classList.add("flex");
}

function closeBudgetModal() {
  document.getElementById("budgetModal").classList.remove("flex");
  document.getElementById("budgetModal").classList.add("hidden");
}

function saveBudgetConfig() {
  const newLimit =
    parseInt(document.getElementById("budgetDailyInput").value) || 150000;
  const newDays =
    parseInt(document.getElementById("budgetDaysInput").value) || 1;
  appData.baseSafeToSpend = Math.max(10000, newLimit);
  appData.remainingDays = Math.max(1, newDays);
  closeBudgetModal();
  renderAll();
  showToast(
    `✅ Limit Safe-to-Spend diperbarui: Rp ${appData.baseSafeToSpend.toLocaleString("id-ID")}/hari`,
  );
}

// ================= 2. CRUD TRANSAKSI HARIAN =================
function renderTransactions() {
  const container = document.getElementById("txList");
  document.getElementById("txCountBadge").innerText =
    `${getTodayTx().length} item`;

  if (getTodayTx().length === 0) {
    container.innerHTML = `<div class="p-4 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">Belum ada pengeluaran hari ini. Klik "+ Tambah Transaksi" atau ketik di atas.</div>`;
    return;
  }
  container.innerHTML = getTodayTx()
    .map(
      (item) => `
        <div class="flex items-center justify-between p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80">
            <div class="flex items-center space-x-2.5 min-w-0">
                <span class="text-[11px] px-2 py-0.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 font-semibold text-zinc-700 dark:text-zinc-300 flex-shrink-0">${esc(item.category)}</span>
                <div class="truncate">
                    <span class="text-xs font-bold text-zinc-800 dark:text-zinc-100 block truncate">${esc(item.name)}</span>
                    <span class="text-[10px] text-zinc-400 num-font">${item.time} WIB</span>
                </div>
            </div>
            <div class="flex items-center space-x-2 flex-shrink-0 ml-2">
                <span class="num-font text-xs font-bold text-zinc-800 dark:text-zinc-200">-Rp ${item.amount.toLocaleString("id-ID")}</span>
                <button onclick="editTx(${item.id})" class="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-brand hover:border-brand transition-all" title="Edit Transaksi">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteTx(${item.id})" class="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-600 hover:border-rose-500 transition-all" title="Hapus Transaksi">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    `,
    )
    .join("");
}

function openTxModal(editItem = null) {
  document.getElementById("txModal").classList.remove("hidden");
  document.getElementById("txModal").classList.add("flex");
  const now = new Date();
  const defaultTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  if (editItem) {
    document.getElementById("txModalTitle").innerHTML =
      `<i data-lucide="pencil" class="w-4 h-4 text-brand"></i><span>Edit Transaksi</span>`;
    document.getElementById("txEditId").value = editItem.id;
    document.getElementById("txNameInput").value = editItem.name;
    document.getElementById("txAmountInput").value = editItem.amount;
    document.getElementById("txTimeInput").value = editItem.time || defaultTime;
    document.getElementById("txCategoryInput").value = editItem.category;
  } else {
    document.getElementById("txModalTitle").innerHTML =
      `<i data-lucide="plus-circle" class="w-4 h-4 text-brand"></i><span>Tambah Transaksi Baru</span>`;
    document.getElementById("txEditId").value = "";
    document.getElementById("txNameInput").value = "";
    document.getElementById("txAmountInput").value = "";
    document.getElementById("txTimeInput").value = defaultTime;
    document.getElementById("txCategoryInput").value = "☕ F&B";
  }
  if (window.lucide) lucide.createIcons();
}

function closeTxModal() {
  document.getElementById("txModal").classList.remove("flex");
  document.getElementById("txModal").classList.add("hidden");
}

function saveTx() {
  const id = document.getElementById("txEditId").value;
  const name =
    document.getElementById("txNameInput").value.trim() || "Pengeluaran Harian";
  const amount = parseInt(document.getElementById("txAmountInput").value) || 0;
  const time = document.getElementById("txTimeInput").value.trim() || "12:00";
  const category = document.getElementById("txCategoryInput").value;

  if (amount <= 0) {
    showToast("⚠️ Masukkan nominal pengeluaran lebih dari Rp 0!");
    return;
  }

  if (id) {
    const item = appData.transactions.find((t) => t.id == id);
    if (item) {
      item.name = name;
      item.amount = amount;
      item.time = time;
      item.category = category;
      showToast(`✏️ Transaksi "${name}" berhasil diperbarui.`);
    }
  } else {
    appData.transactions.unshift({
      date: todayISO(),
      id: Date.now(),
      name,
      amount,
      category,
      time,
    });
    showToast(`✅ Tercatat: "${name}" (-Rp ${amount.toLocaleString("id-ID")})`);
  }
  closeTxModal();
  renderAll();
}

function editTx(id) {
  const item = appData.transactions.find((t) => t.id === id);
  if (item) openTxModal(item);
}

function deleteTx(id) {
  const idx = appData.transactions.findIndex((t) => t.id === id);
  if (idx !== -1) {
    const removed = appData.transactions.splice(idx, 1)[0];
    lastDeletedBackup = { type: "transactions", item: removed, index: idx };
    renderAll();
    showToast(`🗑️ Transaksi "${removed.name}" dihapus.`, true);
  }
}

function handleQuickInput(e) {
  if (e.key === "Enter") submitQuickAdd();
}

function submitQuickAdd() {
  const input = document.getElementById("quickInput");
  const val = input.value.trim();
  if (!val) {
    showToast("⚠️ Ketik nama & nominal dulu, contoh: Kopi 25k");
    return;
  }

  const { amount, name: cleanName } = parseQuick(val);
  if (amount <= 0) {
    showToast("⚠️ Nominal tidak terbaca, contoh: Kopi 25k");
    return;
  }
  const lower = cleanName.toLowerCase();
  let category = "⚡ Cepat";
  if (
    lower.includes("kopi") ||
    lower.includes("makan") ||
    lower.includes("nasi") ||
    lower.includes("ayam") ||
    lower.includes("teh")
  )
    category = "☕ F&B";
  else if (
    lower.includes("ojol") ||
    lower.includes("gojek") ||
    lower.includes("grab") ||
    lower.includes("mrt") ||
    lower.includes("bensin")
  )
    category = "🛵 Transport";
  else if (
    lower.includes("beli") ||
    lower.includes("indo") ||
    lower.includes("alfa")
  )
    category = "🛒 Belanja";

  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  appData.transactions.unshift({
    date: todayISO(),
    id: Date.now(),
    name: cleanName,
    amount,
    category,
    time: timeStr,
  });
  input.value = "";
  renderAll();
  showToast(
    `✨ Tercatat 3 detik: "${cleanName}" (-Rp ${amount.toLocaleString("id-ID")})`,
  );
}

// ================= 3. CRUD RADAR TAGIHAN & PAYLATER =================
function renderRadar() {
  const container = document.getElementById("radarList");
  appData.radar.forEach((r) => {
    r.days = daysUntil(r.dueDate);
  });
  const unpaidTotal = appData.radar
    .filter((r) => !r.paid)
    .reduce((acc, curr) => acc + curr.amount, 0);
  document.getElementById("radarTotalAmount").innerText =
    "Rp " + unpaidTotal.toLocaleString("id-ID");

  // Update urgent badge count
  const urgentCount = appData.radar.filter(
    (r) => !r.paid && daysUntil(r.dueDate) <= 3,
  ).length;
  const urgentBadge = document.getElementById("radarUrgentBadge");
  if (urgentBadge) {
    if (urgentCount > 0) {
      urgentBadge.textContent = `⚠️ ${urgentCount} tagihan jatuh tempo ≤3 hari`;
      urgentBadge.classList.remove("hidden");
    } else {
      urgentBadge.classList.add("hidden");
    }
  }

  if (appData.radar.length === 0) {
    container.innerHTML = `<div class="p-5 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <div class="text-2xl mb-2">🔔</div>
            <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Belum ada tagihan di radar.</p>
            <p class="text-[10px] text-zinc-400 mt-1">Contoh: Netflix 54k, ShopeePayLater 150k, dll.</p>
        </div>`;
    return;
  }

  container.innerHTML = appData.radar
    .map((item) => {
      const days = daysUntil(item.dueDate);
      let urgencyClass = "";
      let urgencyBg = "";
      if (!item.paid) {
        if (days <= 0) {
          urgencyClass = "text-rose-600 dark:text-rose-400 font-semibold";
          urgencyBg = "";
        } else if (days <= 3) {
          urgencyClass = "text-amber-600 dark:text-amber-400 font-semibold";
          urgencyBg = "";
        } else {
          urgencyClass = "text-zinc-500 dark:text-zinc-400 font-semibold";
          urgencyBg = "";
        }
      }
      return `
        <div class="p-3 rounded-2xl ${item.paid ? "bg-zinc-100/60 dark:bg-zinc-900/30 opacity-65" : "bg-zinc-50 dark:bg-zinc-900/60"} border border-zinc-100 dark:border-zinc-800/80 space-y-2">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-2.5 min-w-0">
                    <button onclick="toggleRadarPaid(${item.id})" title="${item.paid ? "Tandai Belum Lunas" : "Tandai Lunas"}" class="w-7 h-7 rounded-xl ${item.paid ? "bg-emerald-600 text-white" : "bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-600 text-transparent hover:border-brand"} flex items-center justify-center flex-shrink-0 transition-all">
                        <i data-lucide="check" class="w-4 h-4"></i>
                    </button>
                    <div class="truncate">
                        <h4 class="text-xs font-bold ${item.paid ? "line-through text-zinc-400" : "text-zinc-800 dark:text-zinc-100"} truncate">${esc(item.name)}</h4>
                        ${item.note ? `<p class="text-[10px] text-zinc-400 truncate">${esc(item.note)}</p>` : ""}
                        <div class="flex items-center gap-1.5 mt-0.5">
                            <span class="text-[10px] px-1.5 py-0.2 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium">${esc(item.type || "Subscription")}</span>
                            <span class="text-[10px] ${item.paid ? "text-emerald-600 font-semibold" : urgencyClass}">
                                ${item.paid ? "✓ Lunas" : dueLabel(days)}
                            </span>
                        </div>
                    </div>
                </div>
                <span class="num-font text-xs font-bold flex-shrink-0">${item.paid ? "Rp 0" : "Rp " + item.amount.toLocaleString("id-ID")}</span>
            </div>
            <div class="flex items-center justify-end gap-1.5 pt-1 border-t border-zinc-200/50 dark:border-zinc-800/60">
                <button onclick="toggleRadarPaid(${item.id})" class="px-2 py-1 rounded-lg text-[10px] font-semibold bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-brand">
                    ${item.paid ? "Batal Lunas" : "✓ Tandai Lunas"}
                </button>
                <button onclick="editRadar(${item.id})" class="p-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-amber-600" title="Edit Tagihan">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="deleteRadar(${item.id})" class="p-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-600" title="Hapus Tagihan">
                    <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
            </div>
        </div>
    `;
    })
    .join("");
}

function toggleRadarPaid(id) {
  const item = appData.radar.find((r) => r.id === id);
  if (item) {
    item.paid = !item.paid;
    renderAll();
    showToast(
      item.paid
        ? `✅ Tagihan "${item.name}" ditandai Lunas!`
        : `🔄 Status "${item.name}" dikembalikan belum lunas.`,
    );
  }
}

function openRadarModal(editItem = null) {
  document.getElementById("radarModal").classList.remove("hidden");
  document.getElementById("radarModal").classList.add("flex");
  if (editItem) {
    document.getElementById("radarModalTitle").innerHTML =
      `<i data-lucide="pencil" class="w-4 h-4 text-amber-600"></i><span>Edit Tagihan Radar</span>`;
    document.getElementById("radarEditId").value = editItem.id;
    document.getElementById("radarNameInput").value = editItem.name;
    document.getElementById("radarAmountInput").value = editItem.amount;
    document.getElementById("radarDaysInput").value = Math.max(
      0,
      daysUntil(editItem.dueDate),
    );
    document.getElementById("radarTypeInput").value =
      editItem.type || "Subscription";
    const noteEl = document.getElementById("radarNoteInput");
    if (noteEl) noteEl.value = editItem.note || "";
  } else {
    document.getElementById("radarModalTitle").innerHTML =
      `<i data-lucide="bell-ring" class="w-4 h-4 text-amber-600"></i><span>Tambah Tagihan / PayLater</span>`;
    document.getElementById("radarEditId").value = "";
    document.getElementById("radarNameInput").value = "";
    document.getElementById("radarAmountInput").value = "";
    document.getElementById("radarDaysInput").value = "3";
    document.getElementById("radarTypeInput").value = "Subscription";
    const noteEl = document.getElementById("radarNoteInput");
    if (noteEl) noteEl.value = "";
  }
  if (window.lucide) lucide.createIcons();
}

function closeRadarModal() {
  document.getElementById("radarModal").classList.remove("flex");
  document.getElementById("radarModal").classList.add("hidden");
}

function saveRadar() {
  const id = document.getElementById("radarEditId").value;
  const name =
    document.getElementById("radarNameInput").value.trim() ||
    "Langganan Bulanan";
  const amount =
    parseInt(document.getElementById("radarAmountInput").value) || 0;
  const days = parseInt(document.getElementById("radarDaysInput").value) || 3;
  const type = document.getElementById("radarTypeInput").value;
  const noteEl = document.getElementById("radarNoteInput");
  const note = noteEl ? noteEl.value.trim() : "";

  if (amount <= 0) {
    showToast("⚠️ Masukkan nominal tagihan yang valid!");
    return;
  }

  if (id) {
    const item = appData.radar.find((r) => r.id == id);
    if (item) {
      item.name = name;
      item.amount = amount;
      item.days = days;
      item.dueDate = addDaysISO(days);
      item.type = type;
      item.note = note;
      showToast(`✏️ Tagihan "${name}" diperbarui.`);
    }
  } else {
    appData.radar.unshift({
      dueDate: addDaysISO(days),
      id: Date.now(),
      name,
      amount,
      days,
      type,
      note,
      paid: false,
    });
    showToast(`🔔 Tagihan "${name}" ditambahkan ke Radar.`);
  }
  closeRadarModal();
  renderAll();
}

function editRadar(id) {
  const item = appData.radar.find((r) => r.id === id);
  if (item) openRadarModal(item);
}

function deleteRadar(id) {
  const idx = appData.radar.findIndex((r) => r.id === id);
  if (idx !== -1) {
    const removed = appData.radar.splice(idx, 1)[0];
    lastDeletedBackup = { type: "radar", item: removed, index: idx };
    renderAll();
    showToast(`🗑️ Tagihan "${removed.name}" dihapus.`, true);
  }
}

// ================= 4. CRUD VISUAL GOAL POCKETS + FOTO =================
function renderGoals() {
  const container = document.getElementById("goalsDisplay");
  document.getElementById("goalsCount").innerText =
    `Target aktif: ${appData.goals.length}`;
  const totalSaved = appData.goals.reduce((acc, g) => acc + g.current, 0);
  document.getElementById("goalsTotalSaved").innerText =
    "Rp " + totalSaved.toLocaleString("id-ID");

  if (appData.goals.length === 0) {
    container.innerHTML = `<div class="p-5 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <div class="text-2xl mb-2">🎯</div>
            <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Belum ada kantong tabungan impian.</p>
            <p class="text-[10px] text-zinc-400 mt-1">Mulai dari yang kecil — konser, gadget, liburan!</p>
        </div>`;
    return;
  }

  container.innerHTML = appData.goals
    .map((g, idx) => {
      const pct = Math.min(
        100,
        Math.round((g.current / Math.max(1, g.target)) * 100),
      );
      return `
        <div class="p-3 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border ${idx === 0 ? "border-brand/40 dark:border-brand/40" : "border-zinc-100 dark:border-zinc-800/80"} space-y-2.5">
            <div class="relative h-28 rounded-xl overflow-hidden">
                <img src="${esc(g.img)}" alt="${esc(g.title)}" onerror="this.src='assets/preset-konser.svg'" class="w-full h-full object-cover">
                <div class="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent p-2.5 flex flex-col justify-between text-white">
                    <div class="flex justify-between items-start">
                        <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-black/45 backdrop-blur-md">${esc(g.tag)}</span>
                        ${idx === 0 ? '<span class="text-[10px] font-bold px-2 py-0.5 rounded-md bg-brand text-white">📌 Pinned</span>' : `<button onclick="pinGoalTop(${g.id})" class="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-black/50 hover:bg-brand text-white transition-all">Pin ke Atas</button>`}
                    </div>
                    <div class="flex justify-between items-end">
                        <h4 class="text-xs font-bold truncate pr-2">${esc(g.title)}</h4>
                        <span class="num-font text-xs font-bold">${pct}%</span>
                    </div>
                </div>
            </div>

            <div class="space-y-1">
                <div class="flex justify-between text-[11px] font-medium">
                    <span class="num-font text-zinc-700 dark:text-zinc-200 font-bold">Rp ${g.current.toLocaleString("id-ID")}</span>
                    <span class="num-font text-zinc-400"> dari Rp ${g.target.toLocaleString("id-ID")}</span>
                </div>
                <div class="w-full h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div class="h-full bg-brand rounded-full transition-all duration-500" style="width: ${pct}%;"></div>
                </div>
                <div class="text-[10px] ${pct >= 100 ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-zinc-400"}">
                    ${pct >= 100 ? "🎉 Target tercapai!" : `Kurang Rp ${(g.target - g.current).toLocaleString("id-ID")} lagi untuk mencapai target`}
                </div>
            </div>

            <div class="flex items-center justify-between pt-1">
                <div class="flex flex-wrap gap-1">
                    <button onclick="topUpGoalAmount(${g.id}, 10000)" class="rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white text-[10px] px-1.5 py-1 font-semibold transition-all">+10k</button>
                    <button onclick="topUpGoalAmount(${g.id}, 25000)" class="rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white text-[10px] px-1.5 py-1 font-semibold transition-all">+25k</button>
                    <button onclick="topUpGoalAmount(${g.id}, 50000)" class="rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white text-[10px] px-1.5 py-1 font-semibold transition-all">+50k</button>
                    <button onclick="topUpGoalAmount(${g.id}, 100000)" class="rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white text-[10px] px-1.5 py-1 font-semibold transition-all">+100k</button>
                    <button onclick="topUpGoalCustom(${g.id})" class="rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white text-[10px] px-1.5 py-1 font-semibold transition-all">Kustom</button>
                </div>
                <div class="flex items-center space-x-1">
                    <button onclick="editGoal(${g.id})" class="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-brand" title="Edit & Ganti Foto">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="deleteGoal(${g.id})" class="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-600" title="Hapus Target">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    })
    .join("");
}

function quickTopUpGoal(id) {
  const g = appData.goals.find((item) => item.id === id);
  if (g) {
    g.current = Math.min(g.target, g.current + 100000);
    renderAll();
    showToast(`🎉 Tabungan "${g.title}" bertambah Rp 100.000!`);
  }
}

function topUpGoalAmount(id, amount) {
  const g = appData.goals.find((item) => item.id === id);
  if (g) {
    g.current = Math.min(g.target, g.current + amount);
    renderAll();
    showToast(
      `🎉 Tabungan "${g.title}" bertambah Rp ${amount.toLocaleString("id-ID")}!`,
    );
  }
}

function topUpGoalCustom(id) {
  openCustomNominalModal({
    mode: "goal-card",
    goalId: id,
    title: "Top Up Tabungan",
    subtitle: "Berapa yang ingin kamu tambahkan?",
    iconColor:
      "bg-brand-light dark:bg-brand/20 text-brand dark:text-brand-dark",
    confirmLabel: "Top Up Sekarang",
    chips: [
      { label: "+10k", value: 10000 },
      { label: "+25k", value: 25000 },
      { label: "+50k", value: 50000 },
      { label: "+75k", value: 75000 },
      { label: "+100k", value: 100000 },
      { label: "+150k", value: 150000 },
      { label: "+200k", value: 200000 },
      { label: "+500k", value: 500000 },
    ],
    isAdditive: true,
  });
}

// Quick fill for goal modal (adds to current value)
function goalQuickFill(amount) {
  const el = document.getElementById("goalCurrentInput");
  if (!el) return;
  el.value = (parseInt(el.value) || 0) + amount;
}

function goalQuickFillCustom() {
  openCustomNominalModal({
    mode: "goal-modal",
    title: "Tambah Saldo Tabungan",
    subtitle: "Berapa yang ingin kamu tambahkan?",
    iconColor:
      "bg-brand-light dark:bg-brand/20 text-brand dark:text-brand-dark",
    confirmLabel: "Tambahkan ke Saldo",
    chips: [
      { label: "+10k", value: 10000 },
      { label: "+20k", value: 20000 },
      { label: "+50k", value: 50000 },
      { label: "+75k", value: 75000 },
      { label: "+100k", value: 100000 },
      { label: "+150k", value: 150000 },
      { label: "+200k", value: 200000 },
      { label: "+500k", value: 500000 },
    ],
    isAdditive: true,
  });
}

// Quick fill for radar modal (replaces value)
function radarQuickFill(amount) {
  const el = document.getElementById("radarAmountInput");
  if (el) el.value = amount;
}

function radarQuickFillCustom() {
  openCustomNominalModal({
    mode: "radar-modal",
    title: "Nominal Tagihan Kustom",
    subtitle: "Masukkan nominal tagihan kamu",
    iconColor:
      "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400",
    confirmLabel: "Pakai Nominal Ini",
    chips: [
      { label: "10k", value: 10000 },
      { label: "20k", value: 20000 },
      { label: "50k", value: 50000 },
      { label: "79k", value: 79000 },
      { label: "99k", value: 99000 },
      { label: "150k", value: 150000 },
      { label: "200k", value: 200000 },
      { label: "500k", value: 500000 },
    ],
    isAdditive: false,
  });
}

function pinGoalTop(id) {
  const idx = appData.goals.findIndex((item) => item.id === id);
  if (idx > 0) {
    const [picked] = appData.goals.splice(idx, 1);
    appData.goals.unshift(picked);
    renderAll();
    showToast(`📌 "${picked.title}" dijadikan target utama!`);
  }
}

function openGoalModal(editItem = null) {
  document.getElementById("goalModal").classList.remove("hidden");
  document.getElementById("goalModal").classList.add("flex");
  if (editItem) {
    document.getElementById("goalModalTitle").innerHTML =
      `<i data-lucide="pencil" class="w-4 h-4 text-brand"></i><span>Edit Target & Foto Sampul</span>`;
    document.getElementById("goalEditId").value = editItem.id;
    document.getElementById("goalTitleInput").value = editItem.title;
    document.getElementById("goalTagInput").value = editItem.tag;
    document.getElementById("goalCurrentInput").value = editItem.current;
    document.getElementById("goalTargetInput").value = editItem.target;
    tempGoalImg = editItem.img;
    document.getElementById("goalPreviewImg").src = tempGoalImg;
  } else {
    document.getElementById("goalModalTitle").innerHTML =
      `<i data-lucide="target" class="w-4 h-4 text-brand"></i><span>Buat Goal Pocket Baru</span>`;
    document.getElementById("goalEditId").value = "";
    document.getElementById("goalTitleInput").value = "";
    document.getElementById("goalTagInput").value = "Impian";
    document.getElementById("goalCurrentInput").value = "250000";
    document.getElementById("goalTargetInput").value = "2000000";
    tempGoalImg = ASSET_PRESETS.liburan;
    document.getElementById("goalPreviewImg").src = tempGoalImg;
  }
  if (window.lucide) lucide.createIcons();
}

function closeGoalModal() {
  document.getElementById("goalModal").classList.remove("flex");
  document.getElementById("goalModal").classList.add("hidden");
}

function handleGoalPhotoUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    const s = Math.min(1, 800 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    tempGoalImg = c.toDataURL("image/jpeg", 0.8);
    document.getElementById("goalPreviewImg").src = tempGoalImg;
    URL.revokeObjectURL(url);
  };
  img.onerror = () => showToast("⚠️ Gambar tidak bisa dibaca.");
  img.src = url;
}

function selectPresetPhoto(presetKey) {
  const url = ASSET_PRESETS[presetKey] || presetKey;
  tempGoalImg = url;
  document.getElementById("goalPreviewImg").src = url;
}

function saveGoal() {
  const id = document.getElementById("goalEditId").value;
  const title =
    document.getElementById("goalTitleInput").value.trim() || "Target Impian";
  const tag = document.getElementById("goalTagInput").value.trim() || "Goal";
  const current =
    parseInt(document.getElementById("goalCurrentInput").value) || 0;
  const target = Math.max(
    10000,
    parseInt(document.getElementById("goalTargetInput").value) || 1000000,
  );
  const img = tempGoalImg || ASSET_PRESETS.konser;

  if (id) {
    const item = appData.goals.find((g) => g.id == id);
    if (item) {
      item.title = title;
      item.tag = tag;
      item.current = current;
      item.target = target;
      item.img = img;
      showToast(`✏️ Target "${title}" berhasil diperbarui!`);
    }
  } else {
    appData.goals.push({
      id: Date.now(),
      title,
      tag,
      current,
      target,
      img,
    });
    showToast(`🎯 Target baru "${title}" berhasil dibuat!`);
  }
  closeGoalModal();
  renderAll();
}

function editGoal(id) {
  const item = appData.goals.find((g) => g.id === id);
  if (item) openGoalModal(item);
}

function deleteGoal(id) {
  const idx = appData.goals.findIndex((g) => g.id === id);
  if (idx !== -1) {
    const removed = appData.goals.splice(idx, 1)[0];
    lastDeletedBackup = { type: "goals", item: removed, index: idx };
    renderAll();
    showToast(`🗑️ Target "${removed.title}" dihapus.`, true);
  }
}

// ================= 5. CRUD INSTANT SPLIT BILL & CUSTOM WA =================
function renderSplitBills() {
  const container = document.getElementById("splitBillList");
  if (appData.splitBills.length === 0) {
    container.innerHTML = `<div class="p-5 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
            <div class="text-2xl mb-2">🧾</div>
            <p class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">Belum ada riwayat patungan.</p>
            <p class="text-[10px] text-zinc-400 mt-1">Contoh: nongkrong 4 orang, makan siang bareng, dll.</p>
        </div>`;
    return;
  }

  container.innerHTML = appData.splitBills
    .map((bill) => {
      const totalWithTax = Math.round(bill.subtotal * (1 + bill.taxPct / 100));
      const perPerson = Math.round(totalWithTax / Math.max(1, bill.members));
      return `
        <div class="p-3 rounded-2xl ${bill.settled ? "bg-zinc-100/60 dark:bg-zinc-900/30 opacity-65" : "bg-zinc-50 dark:bg-zinc-900/60"} border border-zinc-100 dark:border-zinc-800/80 space-y-2">
            <div class="flex items-start justify-between">
                <div class="min-w-0">
                    <h4 class="text-xs font-bold ${bill.settled ? "line-through text-zinc-400" : "text-zinc-800 dark:text-zinc-100"} truncate">${esc(bill.title)}</h4>
                    <p class="text-[10px] text-zinc-400 mt-0.5">${bill.members} orang • Pajak ${bill.taxPct}% • ${esc(bill.account)}</p>
                </div>
                <div class="text-right flex-shrink-0 ml-2">
                    <span class="num-font text-xs font-bold text-sky-600 dark:text-sky-400 block">Rp ${perPerson.toLocaleString("id-ID")}/org</span>
                    <span class="num-font text-[10px] text-zinc-400">Total Rp ${totalWithTax.toLocaleString("id-ID")}</span>
                </div>
            </div>

            <p class="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-2 bg-white dark:bg-zinc-800/70 p-2 rounded-xl border border-zinc-100 dark:border-zinc-800">
                "${esc(bill.customText)}"
            </p>

            <div class="flex items-center justify-between pt-1">
                <div class="flex items-center gap-1">
                    <button onclick="sendSavedBillWA(${bill.id})" class="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-semibold flex items-center gap-1 shadow-sm">
                        <i data-lucide="send" class="w-3 h-3"></i> Kirim WA
                    </button>
                    <button onclick="toggleSplitSettled(${bill.id})" class="px-2 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-[10px] font-semibold">
                        ${bill.settled ? "Buka Lagi" : "✓ Lunas"}
                    </button>
                </div>
                <div class="flex items-center gap-1">
                    <button onclick="editSplitBill(${bill.id})" class="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-sky-600" title="Edit Bill & Teks WA">
                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                    </button>
                    <button onclick="deleteSplitBill(${bill.id})" class="p-1.5 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-rose-600" title="Hapus Split Bill">
                        <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                    </button>
                </div>
            </div>
        </div>
        `;
    })
    .join("");
}

function openSplitBillModal(editItem = null) {
  document.getElementById("splitBillModal").classList.remove("hidden");
  document.getElementById("splitBillModal").classList.add("flex");
  if (editItem) {
    document.getElementById("splitModalTitle").innerHTML =
      `<i data-lucide="pencil" class="w-4 h-4 text-sky-600"></i><span>Edit Split Bill & Teks WA</span>`;
    document.getElementById("splitEditId").value = editItem.id;
    document.getElementById("splitTitleInput").value = editItem.title;
    document.getElementById("splitBillTotal").value = editItem.subtotal;
    document.getElementById("splitBillMembers").value = editItem.members;
    document.getElementById("splitBillTax").value = editItem.taxPct;
    document.getElementById("splitBillAccount").value = editItem.account;
    document.getElementById("splitCustomText").value = editItem.customText;
    updateSplitPerPersonBadge();
    splitTextDirty = true;
  } else {
    splitTextDirty = false;
    document.getElementById("splitModalTitle").innerHTML =
      `<i data-lucide="receipt" class="w-4 h-4 text-sky-600"></i><span>Buat Split Bill Baru</span>`;
    document.getElementById("splitEditId").value = "";
    document.getElementById("splitTitleInput").value = "Nongkrong Bareng";
    document.getElementById("splitBillTotal").value = "200000";
    document.getElementById("splitBillMembers").value = "4";
    document.getElementById("splitBillTax").value = "15";
    document.getElementById("splitBillAccount").value = "";
    calculateSplitBillPreview();
  }
  if (window.lucide) lucide.createIcons();
}

function closeSplitBillModal() {
  document.getElementById("splitBillModal").classList.remove("flex");
  document.getElementById("splitBillModal").classList.add("hidden");
}

function updateSplitPerPersonBadge() {
  const bill = parseFloat(document.getElementById("splitBillTotal").value) || 0;
  const members = Math.max(
    1,
    parseInt(document.getElementById("splitBillMembers").value) || 1,
  );
  const taxPct = parseFloat(document.getElementById("splitBillTax").value) || 0;
  const totalWithTax = Math.round(bill * (1 + taxPct / 100));
  const perPerson = Math.round(totalWithTax / members);
  document.getElementById("splitPerPerson").innerText =
    "Rp " + perPerson.toLocaleString("id-ID");
  return { bill, members, taxPct, totalWithTax, perPerson };
}

function calculateSplitBillPreview() {
  updateSplitPerPersonBadge();
  if (!splitTextDirty) setSplitTone(currentSplitTone);
}

function setSplitTone(tone) {
  currentSplitTone = tone;
  splitTextDirty = false;
  const { bill, members, taxPct, totalWithTax, perPerson } =
    updateSplitPerPersonBadge();
  const title =
    document.getElementById("splitTitleInput").value.trim() || "Nongkrong";
  const account = document.getElementById("splitBillAccount").value.trim();

  let msg = "";
  if (tone === "santai") {
    msg = `Halo gais! Rekap patungan *${title}* tadi yaa:
• Subtotal: Rp ${bill.toLocaleString("id-ID")} (+Pajak/Servis ${taxPct}% = Rp ${totalWithTax.toLocaleString("id-ID")})
• Dibagi ${members} orang: *Rp ${perPerson.toLocaleString("id-ID")} / orang*

Bisa transfer ke: ${account}
Thanks everyone! ✨`;
  } else if (tone === "halus") {
    msg = `Bestie! Patungan *${title}* udah dihitung nih biar dompet kita tetep safe-to-spend 🥑
Per orang jatuhnya *Rp ${perPerson.toLocaleString("id-ID")}* yaa (total Rp ${totalWithTax.toLocaleString("id-ID")} dibagi ${members}).
Yuk ditransfer ke: ${account} 🙏`;
  } else {
    msg = `Halo rekan-rekan, berikut rincian pembayaran *${title}*:
- Total Tagihan (+Pajak ${taxPct}%): Rp ${totalWithTax.toLocaleString("id-ID")}
- Jumlah Anggota: ${members} orang
- Nominal per Orang: *Rp ${perPerson.toLocaleString("id-ID")}*

Pembayaran dapat ditransfer melalui: ${account}. Terima kasih.`;
  }
  document.getElementById("splitCustomText").value = msg;
}

function appendSplitChip(extraText) {
  const area = document.getElementById("splitCustomText");
  area.value = area.value.trim() + "\n" + extraText;
  splitTextDirty = true;
}

function saveSplitBillRecord() {
  const id = document.getElementById("splitEditId").value;
  const title =
    document.getElementById("splitTitleInput").value.trim() || "Split Bill";
  const subtotal =
    parseInt(document.getElementById("splitBillTotal").value) || 0;
  const members = Math.max(
    1,
    parseInt(document.getElementById("splitBillMembers").value) || 1,
  );
  const taxPct = parseFloat(document.getElementById("splitBillTax").value) || 0;
  const account =
    document.getElementById("splitBillAccount").value.trim() || "";
  const customText = document.getElementById("splitCustomText").value.trim();

  if (id) {
    const item = appData.splitBills.find((s) => s.id == id);
    if (item) {
      item.title = title;
      item.subtotal = subtotal;
      item.members = members;
      item.taxPct = taxPct;
      item.account = account;
      item.customText = customText;
      showToast(`✏️ Split Bill "${title}" berhasil diperbarui!`);
    }
  } else {
    appData.splitBills.unshift({
      id: Date.now(),
      title,
      subtotal,
      members,
      taxPct,
      account,
      customText,
      settled: false,
    });
    showToast(`🧾 Split Bill "${title}" berhasil disimpan!`);
  }
  closeSplitBillModal();
  renderAll();
}

function editSplitBill(id) {
  const item = appData.splitBills.find((s) => s.id === id);
  if (item) openSplitBillModal(item);
}

function deleteSplitBill(id) {
  const idx = appData.splitBills.findIndex((s) => s.id === id);
  if (idx !== -1) {
    const removed = appData.splitBills.splice(idx, 1)[0];
    lastDeletedBackup = { type: "splitBills", item: removed, index: idx };
    renderAll();
    showToast(`🗑️ Split Bill "${removed.title}" dihapus.`, true);
  }
}

function toggleSplitSettled(id) {
  const item = appData.splitBills.find((s) => s.id === id);
  if (item) {
    item.settled = !item.settled;
    renderAll();
    showToast(
      item.settled
        ? `✅ Split Bill "${item.title}" lunas!`
        : `🔄 Split Bill "${item.title}" dibuka kembali.`,
    );
  }
}

function sendSavedBillWA(id) {
  const item = appData.splitBills.find((s) => s.id === id);
  if (item) {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(item.customText)}`,
      "_blank",
      "noopener",
    );
  }
}

function copySplitBillText() {
  const ta = document.getElementById("splitCustomText");
  const done = () => showToast("📋 Teks WhatsApp berhasil disalin!");
  const fail = () =>
    showToast("⚠️ Gagal menyalin, salin manual dari kotak teks.");
  if (navigator.clipboard && window.isSecureContext)
    navigator.clipboard.writeText(ta.value).then(done).catch(fail);
  else {
    ta.select();
    try {
      document.execCommand("copy") ? done() : fail();
    } catch (e) {
      fail();
    }
  }
}

function sendToWhatsApp() {
  const txt = encodeURIComponent(
    document.getElementById("splitCustomText").value,
  );
  window.open(`https://wa.me/?text=${txt}`, "_blank", "noopener");
}

// ================= 6. CRUD WEEKLY VIBE CHECK (INSIGHTS) =================
function renderVibes() {
  const container = document.getElementById("vibeList");
  document.getElementById("vibeCountLabel").innerText =
    `${appData.vibes.length} poin insight aktif`;

  if (appData.vibes.length === 0) {
    container.innerHTML = `<div class="p-4 text-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 text-xs text-zinc-400">Belum ada catatan evaluasi mingguan.</div>`;
    return;
  }

  container.innerHTML = appData.vibes
    .map(
      (item) => `
        <div class="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/80 space-y-1.5">
            <div class="flex items-center justify-between">
                <div class="flex items-center space-x-1.5 text-brand dark:text-brand-dark font-bold text-xs">
                    <i data-lucide="${esc(item.icon)}" class="w-3.5 h-3.5"></i>
                    <span>${esc(item.title)}</span>
                </div>
                <div class="flex items-center space-x-1">
                    <button onclick="editVibe(${item.id})" class="p-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-brand" title="Edit Insight">
                        <i data-lucide="pencil" class="w-3 h-3"></i>
                    </button>
                    <button onclick="deleteVibe(${item.id})" class="p-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-500 hover:text-rose-600" title="Hapus Insight">
                        <i data-lucide="trash-2" class="w-3 h-3"></i>
                    </button>
                </div>
            </div>
            <p class="text-zinc-600 dark:text-zinc-300 leading-relaxed text-xs">
                "${esc(item.text)}"
            </p>
        </div>
    `,
    )
    .join("");
}

function openVibeModal(editItem = null) {
  document.getElementById("vibeModal").classList.remove("hidden");
  document.getElementById("vibeModal").classList.add("flex");
  if (editItem) {
    document.getElementById("vibeModalTitle").innerHTML =
      `<i data-lucide="pencil" class="w-4 h-4 text-emerald-600"></i><span>Edit Insight Mingguan</span>`;
    document.getElementById("vibeEditId").value = editItem.id;
    document.getElementById("vibeTitleInput").value = editItem.title;
    document.getElementById("vibeIconInput").value = editItem.icon;
    document.getElementById("vibeTextInput").value = editItem.text;
  } else {
    document.getElementById("vibeModalTitle").innerHTML =
      `<i data-lucide="sparkles" class="w-4 h-4 text-emerald-600"></i><span>Tambah Insight Mingguan</span>`;
    document.getElementById("vibeEditId").value = "";
    document.getElementById("vibeTitleInput").value = "";
    document.getElementById("vibeIconInput").value = "sparkles";
    document.getElementById("vibeTextInput").value = "";
  }
  if (window.lucide) lucide.createIcons();
}

function closeVibeModal() {
  document.getElementById("vibeModal").classList.remove("flex");
  document.getElementById("vibeModal").classList.add("hidden");
}

function saveVibe() {
  const id = document.getElementById("vibeEditId").value;
  const title =
    document.getElementById("vibeTitleInput").value.trim() ||
    "Catatan Mingguan";
  const icon = document.getElementById("vibeIconInput").value;
  const text =
    document.getElementById("vibeTextInput").value.trim() ||
    "Pengeluaran minggu ini masih sesuai rencana.";

  if (id) {
    const item = appData.vibes.find((v) => v.id == id);
    if (item) {
      item.title = title;
      item.icon = icon;
      item.text = text;
      showToast(`✏️ Insight "${title}" diperbarui.`);
    }
  } else {
    appData.vibes.unshift({
      id: Date.now(),
      title,
      icon,
      text,
    });
    showToast(`✨ Insight "${title}" ditambahkan.`);
  }
  closeVibeModal();
  renderAll();
}

function editVibe(id) {
  const item = appData.vibes.find((v) => v.id === id);
  if (item) openVibeModal(item);
}

function deleteVibe(id) {
  const idx = appData.vibes.findIndex((v) => v.id === id);
  if (idx !== -1) {
    const removed = appData.vibes.splice(idx, 1)[0];
    lastDeletedBackup = { type: "vibes", item: removed, index: idx };
    renderAll();
    showToast(`🗑️ Insight "${removed.title}" dihapus.`, true);
  }
}

// ================= UNDO DELETE & UTILITIES =================

// ================= CUSTOM NOMINAL MODAL =================
let _customNominalConfig = null;

function openCustomNominalModal(config) {
  _customNominalConfig = config;
  const modal = document.getElementById('customNominalModal');
  if (!modal) return;

  // Set title & subtitle
  const titleEl = document.getElementById('customNominalTitle');
  const subtitleEl = document.getElementById('customNominalSubtitle');
  const iconEl = document.getElementById('customNominalIcon');
  if (titleEl) titleEl.textContent = config.title || 'Nominal Kustom';
  if (subtitleEl) subtitleEl.textContent = config.subtitle || 'Masukkan jumlah yang kamu mau';
  if (iconEl) iconEl.className = `w-8 h-8 rounded-xl flex items-center justify-center ${config.iconColor || 'bg-brand-light dark:bg-brand/20 text-brand dark:text-brand-dark'}`;

  // Render chips
  const chipsContainer = document.getElementById('customNominalChips');
  if (chipsContainer && config.chips) {
    chipsContainer.innerHTML = config.chips.map(chip => `
      <button type="button" onclick="selectCustomNominalChip(${chip.value})"
        class="rounded-xl bg-zinc-100 dark:bg-zinc-800 hover:bg-brand hover:text-white text-[11px] px-2 py-1.5 font-semibold transition-all text-center">
        ${chip.label}
      </button>
    `).join('');
  }

  // Reset input & preview
  const inputEl = document.getElementById('customNominalInput');
  if (inputEl) inputEl.value = '';
  const previewEl = document.getElementById('customNominalPreview');
  if (previewEl) previewEl.innerHTML = '<span class="text-zinc-400 text-xs">Masukkan nominal di atas</span>';

  // Set confirm button label
  const confirmLabel = document.getElementById('customNominalConfirmLabel');
  if (confirmLabel) confirmLabel.textContent = config.confirmLabel || 'Konfirmasi';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
  if (window.lucide) lucide.createIcons();
  setTimeout(() => { const inp = document.getElementById('customNominalInput'); if (inp) inp.focus(); }, 100);
}

function closeCustomNominalModal() {
  const modal = document.getElementById('customNominalModal');
  if (modal) {
    modal.classList.remove('flex');
    modal.classList.add('hidden');
  }
  _customNominalConfig = null;
}

function selectCustomNominalChip(value) {
  const inputEl = document.getElementById('customNominalInput');
  if (inputEl) {
    inputEl.value = value;
    onCustomNominalInput();
  }
}

function onCustomNominalInput() {
  const inputEl = document.getElementById('customNominalInput');
  const previewEl = document.getElementById('customNominalPreview');
  if (!inputEl || !previewEl) return;
  const val = parseInt(inputEl.value) || 0;
  if (val > 0) {
    const label = _customNominalConfig?.isAdditive ? 'Tambahkan' : 'Nominal';
    previewEl.innerHTML = `<span class="num-font font-bold text-brand dark:text-brand-dark text-base">${label}: Rp ${val.toLocaleString('id-ID')}</span>`;
  } else {
    previewEl.innerHTML = '<span class="text-zinc-400 text-xs">Masukkan nominal di atas</span>';
  }
}

function confirmCustomNominal() {
  const inputEl = document.getElementById('customNominalInput');
  const val = parseInt(inputEl?.value) || 0;
  if (val <= 0) {
    showToast('⚠️ Masukkan nominal yang valid (lebih dari 0).');
    return;
  }
  const config = _customNominalConfig;
  if (!config) return;

  if (config.mode === 'goal-modal') {
    // Tambahkan ke input dana terkumpul di modal goal
    const el = document.getElementById('goalCurrentInput');
    if (el) el.value = (parseInt(el.value) || 0) + val;
    closeCustomNominalModal();
    showToast(`✅ +Rp ${val.toLocaleString('id-ID')} ditambahkan ke saldo tabungan.`);
  } else if (config.mode === 'goal-card') {
    // Top up goal langsung dari card
    const g = appData.goals.find(item => item.id === config.goalId);
    if (g) {
      g.current = Math.min(g.target, g.current + val);
      closeCustomNominalModal();
      renderAll();
      showToast(`🎉 Tabungan "${g.title}" bertambah Rp ${val.toLocaleString('id-ID')}!`);
    }
  } else if (config.mode === 'radar-modal') {
    // Set nominal di modal radar
    const el = document.getElementById('radarAmountInput');
    if (el) el.value = val;
    closeCustomNominalModal();
  } else {
    closeCustomNominalModal();
  }
}
// ===============================================================
function undoLastDelete() {
  if (!lastDeletedBackup) return;
  const { type, item, index } = lastDeletedBackup;
  if (appData[type]) {
    appData[type].splice(index, 0, item);
    lastDeletedBackup = null;
    renderAll();
    showToast("↩️ Data berhasil dikembalikan!");
  }
}

function openScanModal() {
  document.getElementById("scanModal").classList.remove("hidden");
  document.getElementById("scanModal").classList.add("flex");
}

function closeScanModal() {
  document.getElementById("scanModal").classList.remove("flex");
  document.getElementById("scanModal").classList.add("hidden");
}

function parseEMV(s) {
  const o = {};
  let i = 0;
  while (i + 4 <= s.length) {
    const len = parseInt(s.substr(i + 2, 2), 10);
    if (isNaN(len)) break;
    o[s.substr(i, 2)] = s.substr(i + 4, len);
    i += 4 + len;
  }
  return o;
}

async function handleScanFile(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  closeScanModal();
  let name = "",
    amount = 0,
    ok = false;
  if ("BarcodeDetector" in window) {
    try {
      const res = await new BarcodeDetector({ formats: ["qr_code"] }).detect(
        await createImageBitmap(file),
      );
      if (res.length) {
        const t = parseEMV(res[0].rawValue);
        name = (t["59"] || "").trim();
        amount = Math.round(parseFloat(t["54"]) || 0);
        ok = !!name || amount > 0;
      }
    } catch (err) {
      console.warn(err);
    }
  }
  if (ok && amount > 0) {
    appData.transactions.unshift({
      date: todayISO(),
      id: Date.now(),
      name: name || "Pembayaran QRIS",
      amount,
      category: "⚡ Cepat",
      time: nowTime(),
    });
    renderAll();
    showToast(
      `📷 QRIS terbaca: "${name || "QRIS"}" Rp ${amount.toLocaleString("id-ID")}`,
    );
    return;
  }
  openTxModal();
  document.getElementById("txNameInput").value = name || "Pembayaran QRIS";
  showToast(
    ok
      ? "📷 Merchant terbaca, isi nominalnya ya."
      : "ℹ️ QR tidak terbaca otomatis di browser ini. Catat manual saja.",
  );
}

function initTheme() {
  let t = null;
  try {
    t = localStorage.getItem("sakuin_theme");
  } catch (e) {}
  const dark = t
    ? t === "dark"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", dark);
}

function toggleDarkMode() {
  const d = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("sakuin_theme", d ? "dark" : "light");
  } catch (e) {}
}

function exportData() {
  const blob = new Blob(
    [
      JSON.stringify(
        { app: "sakuin", exportedAt: new Date().toISOString(), data: appData },
        null,
        2,
      ),
    ],
    { type: "application/json" },
  );
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sakuin-backup-${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast("💾 Backup berhasil diunduh.");
}

function importData(e) {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const j = JSON.parse(r.result);
      const d = normalizeState(j.data || j);
      if (!confirm("Timpa data saat ini dengan isi backup?")) return;
      appData = d;
      renderAll();
      showToast("✅ Data berhasil dipulihkan.");
    } catch (err) {
      showToast("⚠️ File backup tidak valid.");
    }
  };
  r.readAsText(f);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPage(name) {
  const pages = {
    home: ['sectionHome'],
    radar: ['sectionRadar'],
    goals: ['sectionGoals'],
    split: ['sectionSplit', 'sectionVibe'],
  };
  // Hide semua sections
  Object.values(pages).flat().forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
  // Show target sections
  (pages[name] || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  });
  // Update nav active state
  const navMap = { home: 'navHome', radar: 'navRadar', goals: 'navGoals', split: 'navSplit' };
  const activeClass = ['text-brand', 'dark:text-brand-dark'];
  const inactiveClass = ['text-zinc-400', 'hover:text-zinc-700', 'dark:hover:text-zinc-200'];
  Object.entries(navMap).forEach(([page, btnId]) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (page === name) {
      btn.classList.remove(...inactiveClass);
      btn.classList.add(...activeClass);
    } else {
      btn.classList.remove(...activeClass);
      btn.classList.add(...inactiveClass);
    }
  });
  // Simpan state halaman aktif
  window._activePage = name;
}

function triggerNotification(onlyIfDue = false) {
  const due = appData.radar
    .filter((r) => !r.paid && daysUntil(r.dueDate) <= 3)
    .sort((a, b) => daysUntil(a.dueDate) - daysUntil(b.dueDate));
  if (!due.length) {
    if (!onlyIfDue)
      showToast("✅ Tidak ada tagihan jatuh tempo dalam 3 hari ke depan.");
    return;
  }
  const r = due[0],
    more = due.length > 1 ? ` (+${due.length - 1} lainnya)` : "";
  showToast(
    `🔔 ${r.name} Rp ${r.amount.toLocaleString("id-ID")} — ${dueLabel(daysUntil(r.dueDate))}${more}`,
  );
}

function showToast(text, showUndo = false) {
  const toast = document.getElementById("toastNotification");
  const undoBtn = document.getElementById("undoBtn");
  document.getElementById("toastText").innerText = text;
  if (showUndo && lastDeletedBackup) {
    undoBtn.classList.remove("hidden");
  } else {
    undoBtn.classList.add("hidden");
  }
  toast.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
  }, 5000);
}

function hideNotification() {
  document.getElementById("toastNotification").classList.add("hidden");
}
