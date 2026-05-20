
import { useState, useEffect, useRef, useCallback } from "react";

// ─── IndexedDB Helper ───────────────────────────────────────────────────────
const DB_NAME = "ShopMasterDB";
const DB_VERSION = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      const stores = [
        { name: "settings", key: "key" },
        { name: "categories", key: "id", auto: true },
        { name: "products", key: "id", auto: true },
        { name: "stores", key: "id", auto: true },
        { name: "shoppingTypes", key: "id", auto: true },
        { name: "baseLists", key: "id", auto: true },
        { name: "baseItems", key: "id", auto: true },
        { name: "sessions", key: "id", auto: true },
        { name: "purchases", key: "id", auto: true },
        { name: "exportHistory", key: "id", auto: true },
      ];
      stores.forEach(({ name, key, auto }) => {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: key, autoIncrement: !!auto });
        }
      });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbPutRaw(storeName, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    // Use put which will insert-or-update regardless of autoIncrement state
    const req = store.put(value);
    req.onsuccess = () => res(req.result);
    req.onerror = (e) => {
      // Silently skip duplicate key errors and continue
      e.preventDefault();
      res(null);
    };
    tx.onerror = (e) => { e.preventDefault(); res(null); };
  });
}
async function dbGet(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbGetAll(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbPut(store, value) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).put(value);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbDelete(store, key) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).delete(key);
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
async function dbClear(store) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(store, "readwrite");
    const req = tx.objectStore(store).clear();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// ─── Seed Data ──────────────────────────────────────────────────────────────
const SEED_CATEGORIES = [
  { id: 1, name: "Lácteos", icon: "🥛" },
  { id: 2, name: "Panadería", icon: "🍞" },
  { id: 3, name: "Carnes", icon: "🥩" },
  { id: 4, name: "Frutas y Verduras", icon: "🥦" },
  { id: 5, name: "Limpieza", icon: "🧹" },
  { id: 6, name: "Bebidas", icon: "🥤" },
  { id: 7, name: "Congelados", icon: "🧊" },
  { id: 8, name: "Otros", icon: "📦" },
];

async function seedData() {
  const existing = await dbGetAll("categories");
  if (existing.length === 0) {
    for (const cat of SEED_CATEGORIES) await dbPut("categories", cat);
  }
  const settings = await dbGet("settings", "currency");
  if (!settings) await dbPut("settings", { key: "currency", value: "USD", symbol: "$" });
  const budget = await dbGet("settings", "monthlyBudget");
  if (!budget) await dbPut("settings", { key: "monthlyBudget", value: 0 });
  // Seed shopping types
  const types = await dbGetAll("shoppingTypes");
  if (types.length === 0) {
    await dbPut("shoppingTypes", { id: 1, name: "Supermercado", icon: "🛒", color: "#10b981", isGrocery: true });
    await dbPut("shoppingTypes", { id: 2, name: "Navidad", icon: "🎄", color: "#ef4444", isGrocery: false });
    await dbPut("shoppingTypes", { id: 3, name: "San Valentín", icon: "💝", color: "#f43f5e", isGrocery: false });
  }
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function formatCurrency(amount, symbol = "$") {
  return `${symbol}${Number(amount || 0).toLocaleString("es-CR", { minimumFractionDigits: 2 })}`;
}
function toBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}
function groupBy(arr, key) {
  return arr.reduce((acc, item) => {
    const k = item[key] || "Sin categoría";
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {});
}
function getMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Icons ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 20, className = "" }) => {
  const icons = {
    home: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
    cart: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z",
    list: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    settings: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    plus: "M12 4v16m8-8H4",
    trash: "M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16",
    edit: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
    check: "M5 13l4 4L19 7",
    x: "M6 18L18 6M6 6l12 12",
    camera: "M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z M15 13a3 3 0 11-6 0 3 3 0 016 0z",
    barcode: "M4 6h1v12H4V6zm2 0h2v12H6V6zm3 0h1v12H9V6zm2 0h1v12h-1V6zm2 0h2v12h-2V6zm3 0h1v12h-1V6zm2 0h1v12h-1V6z",
    store: "M3 3h18M3 3v4a1 1 0 001 1h16a1 1 0 001-1V3M3 3l2 4M21 3l-2 4M9 8v12M15 8v12M3 20h18",
    package: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4",
    download: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
    upload: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
    alert: "M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z",
    back: "M15 19l-7-7 7-7",
    money: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    tag: "M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z",
    search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
    donut: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className}>
      {(icons[name] || "").split(" M").map((d, i) => (
        <path key={i} d={i === 0 ? d : "M" + d} />
      ))}
    </svg>
  );
};

// ─── Modal ────────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children, wide = false }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#1a1a2e", borderRadius: "24px 24px 0 0", width: "100%", maxWidth: wide ? 600 : 480, margin: "0 auto", padding: "24px 20px 40px", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#fff" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "6px 8px", cursor: "pointer", color: "#9ca3af" }}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel, danger = true }) {
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)", padding: "0 24px" }}>
      <div style={{ background: "#1a1a2e", borderRadius: 20, padding: "24px 20px", width: "100%", maxWidth: 360, border: "1px solid #3a3a5a" }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 12 }}>{danger ? "⚠️" : "❓"}</div>
        <p style={{ color: "#e5e7eb", fontSize: 15, textAlign: "center", margin: "0 0 20px", lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, background: "#2a2a4a", border: "none", borderRadius: 14, padding: 14, color: "#c4b5fd", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Cancelar</button>
          <button onClick={onConfirm} style={{ flex: 1, background: danger ? "#7f1d1d" : "linear-gradient(135deg,#6366f1,#8b5cf6)", border: "none", borderRadius: 14, padding: 14, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ─── Input Components ─────────────────────────────────────────────────────────
const inputStyle = { background: "#0f0f1e", border: "1.5px solid #2a2a4a", borderRadius: 12, padding: "12px 14px", color: "#fff", fontSize: 15, width: "100%", outline: "none", boxSizing: "border-box" };
const labelStyle = { color: "#9ca3af", fontSize: 13, marginBottom: 4, display: "block" };
const btnPrimary = { background: "linear-gradient(135deg, #6366f1, #8b5cf6)", border: "none", borderRadius: 14, padding: "14px 20px", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" };
const btnSecondary = { background: "#2a2a4a", border: "none", borderRadius: 14, padding: "12px 20px", color: "#c4b5fd", fontSize: 14, fontWeight: 600, cursor: "pointer" };

// Number input that shows empty when value is 0, avoids leading zero
function NumInput({ value, onChange, step = "0.01", min, style = {}, autoFocus, placeholder = "0.00" }) {
  const [raw, setRaw] = useState(value === 0 || value === "" ? "" : String(value));

  useEffect(() => {
    // Sync when parent value changes programmatically
    setRaw(value === 0 || value === "" ? "" : String(value));
  }, [value]);

  function handleChange(e) {
    const v = e.target.value;
    setRaw(v);
    const num = parseFloat(v);
    onChange(isNaN(num) ? 0 : num);
  }

  function handleBlur() {
    const num = parseFloat(raw);
    if (isNaN(num) || num === 0) { setRaw(""); onChange(0); }
    else { setRaw(String(num)); }
  }

  return (
    <input
      type="number"
      style={{ ...inputStyle, ...style }}
      value={raw}
      onChange={handleChange}
      onBlur={handleBlur}
      step={step}
      min={min}
      autoFocus={autoFocus}
      placeholder={placeholder}
    />
  );
}

function PhotoPicker({ photos = [], onChange, max = 4 }) {
  const fileRef = useRef();
  async function handleFile(e) {
    const files = Array.from(e.target.files);
    const newPhotos = [];
    for (const file of files) {
      if (photos.length + newPhotos.length >= max) break;
      newPhotos.push(await toBase64(file));
    }
    onChange([...photos, ...newPhotos]);
    e.target.value = "";
  }
  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        {photos.map((p, i) => (
          <div key={i} style={{ position: "relative" }}>
            <img src={p} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 10 }} />
            <button onClick={() => onChange(photos.filter((_, j) => j !== i))}
              style={{ position: "absolute", top: -6, right: -6, background: "#ef4444", border: "none", borderRadius: "50%", width: 20, height: 20, cursor: "pointer", color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>
              ×
            </button>
          </div>
        ))}
        {photos.length < max && (
          <button onClick={() => fileRef.current.click()}
            style={{ width: 72, height: 72, background: "#2a2a4a", border: "2px dashed #4a4a6a", borderRadius: 10, cursor: "pointer", color: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 4 }}>
            <Icon name="camera" size={20} />
            <span style={{ fontSize: 10, color: "#9ca3af" }}>Foto</span>
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleFile} />
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ sessions, budget, currency }) {
  const sym = currency?.symbol || "$";
  const now = new Date();
  const monthKey = getMonthKey(now);

  const completedSessions = sessions.filter(s => s.completed);
  const monthSessions = completedSessions.filter(s => s.monthKey === monthKey);
  const totalSpent = monthSessions.reduce((sum, s) => sum + (s.total || 0), 0);
  const remaining = (budget || 0) - totalSpent;
  const pct = budget > 0 ? Math.min((totalSpent / budget) * 100, 100) : 0;

  // Last 12 months bar chart
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const key = getMonthKey(d);
    const total = completedSessions.filter(s => s.monthKey === key).reduce((s, x) => s + (x.total || 0), 0);
    const count = completedSessions.filter(s => s.monthKey === key).length;
    return { label: d.toLocaleString("es", { month: "short" }), total, count, key };
  });
  const maxBar = Math.max(...months.map(m => m.total), 1);

  // Per-store totals this month
  const storeMap = {};
  monthSessions.forEach(s => {
    if (s.storeName) storeMap[s.storeName] = (storeMap[s.storeName] || 0) + (s.total || 0);
  });
  const storeEntries = Object.entries(storeMap).sort((a, b) => b[1] - a[1]);
  const donutColors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];

  // Cheapest store per item (from purchase history across all sessions)
  const itemStorePrice = {};
  completedSessions.forEach(s => {
    (s.items || []).forEach(item => {
      if (!item.name || !s.storeName || !(item.price > 0)) return;
      const key = item.name.toLowerCase();
      if (!itemStorePrice[key]) itemStorePrice[key] = { name: item.name, stores: {} };
      const prev = itemStorePrice[key].stores[s.storeName];
      if (!prev || item.price < prev) itemStorePrice[key].stores[s.storeName] = item.price;
    });
  });
  const cheapestItems = Object.values(itemStorePrice)
    .map(item => {
      const sorted = Object.entries(item.stores).sort((a, b) => a[1] - b[1]);
      return { name: item.name, cheapest: sorted[0], others: sorted.slice(1) };
    })
    .filter(x => x.cheapest)
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 10);

  // Trend projection
  const last6 = months.slice(6).map(m => m.total);
  const avg6 = last6.reduce((a, b) => a + b, 0) / 6 || 0;
  const trend = Array.from({ length: 12 }, (_, i) => ({
    label: new Date(now.getFullYear(), now.getMonth() + 1 + i, 1).toLocaleString("es", { month: "short" }),
    total: Math.max(0, avg6 * (1 + i * 0.02)),
  }));
  const maxTrend = Math.max(...trend.map(t => t.total), 1);

  return (
    <div style={{ padding: "0 0 100px" }}>
      {/* Budget card */}
      <div style={{ margin: "16px 16px 0", background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)", borderRadius: 20, padding: 20 }}>
        <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 13, marginBottom: 4 }}>Presupuesto del Mes</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#fff" }}>{formatCurrency(budget, sym)}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
              Gastado: <span style={{ color: remaining < 0 ? "#fca5a5" : "#a7f3d0", fontWeight: 700 }}>{formatCurrency(totalSpent, sym)}</span>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: remaining < 0 ? "#fca5a5" : "#a7f3d0" }}>{formatCurrency(Math.abs(remaining), sym)}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{remaining < 0 ? "⚠️ Excedido" : "Disponible"}</div>
          </div>
        </div>
        <div style={{ marginTop: 12, background: "rgba(255,255,255,0.2)", borderRadius: 99, height: 8 }}>
          <div style={{ width: `${pct}%`, background: pct >= 100 ? "#fca5a5" : "#fff", borderRadius: 99, height: 8, transition: "width 0.5s" }} />
        </div>
        <div style={{ textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>{pct.toFixed(0)}% utilizado</div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, margin: "12px 16px" }}>
        {[
          { label: "Compras este mes", value: monthSessions.length, icon: "cart" },
          { label: "Tiendas visitadas", value: storeEntries.length, icon: "store" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#1a1a2e", borderRadius: 16, padding: "16px 14px", border: "1px solid #2a2a4a" }}>
            <div style={{ color: "#6366f1", marginBottom: 8 }}><Icon name={s.icon} size={20} /></div>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Monthly totals table */}
      <div style={{ margin: "0 16px 12px", background: "#1a1a2e", borderRadius: 20, padding: 18, border: "1px solid #2a2a4a" }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12, fontSize: 15 }}>📅 Total por mes</div>
        {months.filter(m => m.total > 0).reverse().slice(0, 6).map((m, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <div style={{ width: 36, fontSize: 12, color: "#9ca3af", fontWeight: 600 }}>{m.label}</div>
            <div style={{ flex: 1, background: "#0f0f1e", borderRadius: 99, height: 8, overflow: "hidden" }}>
              <div style={{ width: `${(m.total / maxBar) * 100}%`, background: i === 0 ? "#6366f1" : "#3730a3", borderRadius: 99, height: 8 }} />
            </div>
            <div style={{ width: 70, textAlign: "right", fontSize: 12, fontWeight: 700, color: "#fff" }}>{formatCurrency(m.total, sym)}</div>
            <div style={{ width: 28, textAlign: "right", fontSize: 11, color: "#6b7280" }}>{m.count}×</div>
          </div>
        ))}
        {months.every(m => m.total === 0) && <div style={{ color: "#6b7280", fontSize: 13 }}>Sin compras aún</div>}
      </div>

      {/* Bar chart (visual) */}
      <div style={{ margin: "0 16px 12px", background: "#1a1a2e", borderRadius: 20, padding: 20, border: "1px solid #2a2a4a" }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 15 }}>📊 Compras últimos 12 meses</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
          {months.map((m, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ width: "100%", background: i === 11 ? "#6366f1" : "#3730a3", borderRadius: "4px 4px 0 0", height: `${(m.total / maxBar) * 80}px`, minHeight: m.total > 0 ? 4 : 0, transition: "height 0.5s" }} title={formatCurrency(m.total, sym)} />
              <div style={{ fontSize: 9, color: "#6b7280" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Per-store donut + table */}
      {storeEntries.length > 0 && (
        <div style={{ margin: "0 16px 12px", background: "#1a1a2e", borderRadius: 20, padding: 20, border: "1px solid #2a2a4a" }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12, fontSize: 15 }}>🏪 Por tienda este mes</div>
          <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 14 }}>
            <svg width={90} height={90} viewBox="-1 -1 2 2" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
              {(() => {
                let offset = 0;
                return storeEntries.map(([, val], i) => {
                  const pct2 = val / totalSpent;
                  const circ = Math.PI * 1.6;
                  const dash = pct2 * circ;
                  const el = <circle key={i} cx="0" cy="0" r={0.8} fill="none" stroke={donutColors[i % donutColors.length]} strokeWidth={0.35} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />;
                  offset += dash;
                  return el;
                });
              })()}
            </svg>
            <div style={{ flex: 1 }}>
              {storeEntries.map(([name, val], i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 3, background: donutColors[i % donutColors.length], flexShrink: 0 }} />
                  <div style={{ flex: 1, fontSize: 12, color: "#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{formatCurrency(val, sym)}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Store totals detail */}
          {storeEntries.map(([name, val], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid #2a2a4a" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: donutColors[i % donutColors.length] }} />
                <span style={{ fontSize: 13, color: "#fff" }}>{name}</span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "#6b7280" }}>{monthSessions.filter(s => s.storeName === name).length} visitas</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#10b981" }}>{formatCurrency(val, sym)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cheapest store per item */}
      {cheapestItems.length > 0 && (
        <div style={{ margin: "0 16px 12px", background: "#1a1a2e", borderRadius: 20, padding: 18, border: "1px solid #2a2a4a" }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12, fontSize: 15 }}>🏷️ Donde comprar más barato</div>
          {cheapestItems.map((item, i) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: i < cheapestItems.length - 1 ? "1px solid #2a2a4a" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{item.name}</div>
                  <div style={{ fontSize: 12, color: "#10b981", marginTop: 2 }}>
                    ✅ {item.cheapest[0]} — {formatCurrency(item.cheapest[1], sym)}
                  </div>
                  {item.others.length > 0 && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>
                      vs {item.others.map(([s, p]) => `${s} ${formatCurrency(p, sym)}`).join(", ")}
                    </div>
                  )}
                </div>
                {item.others.length > 0 && (
                  <div style={{ fontSize: 11, color: "#fbbf24", fontWeight: 700, marginLeft: 8 }}>
                    -{formatCurrency(item.others[0][1] - item.cheapest[1], sym)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Trend */}
      <div style={{ margin: "0 16px 12px", background: "#1a1a2e", borderRadius: 20, padding: 20, border: "1px solid #2a2a4a" }}>
        <div style={{ fontWeight: 700, color: "#fff", marginBottom: 16, fontSize: 15 }}>📈 Tendencia próximos 12 meses</div>
        <svg width="100%" height={80} viewBox={`0 0 ${trend.length * 32} 80`} style={{ overflow: "visible" }}>
          <polyline fill="none" stroke="#6366f1" strokeWidth={2} points={trend.map((t, i) => `${i * 32 + 16},${80 - (t.total / maxTrend) * 70}`).join(" ")} />
          {trend.map((t, i) => (
            <g key={i}>
              <circle cx={i * 32 + 16} cy={80 - (t.total / maxTrend) * 70} r={3} fill="#8b5cf6" />
              <text x={i * 32 + 16} y={80} textAnchor="middle" fontSize={7} fill="#6b7280">{t.label}</text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

// ─── Products Catalog ─────────────────────────────────────────────────────────
function ProductsCatalog({ categories, sessions = [], products: propProducts = [], setProducts: setPropProducts }) {
  const [products, setProductsLocal] = useState(propProducts);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [expanded, setExpanded] = useState(null);

  // Sync with prop updates (e.g. after finishing a shopping session)
  useEffect(() => { setProductsLocal(propProducts); }, [propProducts]);

  const load = useCallback(async () => {
    const all = await dbGetAll("products");
    setProductsLocal(all);
    setPropProducts && setPropProducts(all);
  }, [setPropProducts]);

  useEffect(() => { load(); }, [load]);

  const filtered = products.filter(p => p.name?.toLowerCase().includes(search.toLowerCase()));
  const grouped = groupBy(filtered, "category");

  async function save(data) {
    await dbPut("products", { ...data, id: data.id || Date.now() });
    await load();
    setShowForm(false);
    setEditing(null);
  }
  async function del(id) {
    await dbDelete("products", id);
    await load();
    setConfirmDelete(null);
    setExpanded(null);
  }

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "16px 16px 8px", display: "flex", gap: 10 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar producto..." style={{ ...inputStyle, paddingLeft: 36 }} />
          <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}><Icon name="search" size={16} /></div>
        </div>
        <button onClick={() => setShowForm(true)} style={{ ...btnSecondary, padding: "12px 14px", borderRadius: 12 }}>
          <Icon name="plus" size={18} />
        </button>
      </div>

      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div style={{ padding: "8px 16px 4px", color: "#6b7280", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>
            {categories.find(c => c.name === cat)?.icon || ""} {cat || "Sin categoría"}
          </div>
          {items.map(p => (
            <div key={p.id} style={{ margin: "0 16px 8px" }}>
              {/* Card row */}
              <div
                style={{ background: "#1a1a2e", borderRadius: expanded === p.id ? "14px 14px 0 0" : 14, padding: "12px 14px", border: "1px solid #2a2a4a", display: "flex", gap: 12, alignItems: "center", cursor: "pointer" }}
                onClick={() => setExpanded(expanded === p.id ? null : p.id)}
              >
                {p.photos?.[0]
                  ? <img src={p.photos[0]} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 48, height: 48, borderRadius: 10, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📦</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{p.name}</div>
                  {p.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{p.brand}</div>}
                  <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
                    {p.lastStore && <div style={{ fontSize: 11, color: "#6b7280" }}>📍 {p.lastStore}</div>}
                    {p.lastPrice > 0 && <div style={{ fontSize: 11, color: "#10b981", fontWeight: 600 }}>{p.lastPrice}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "#6b7280" }}>{(p.purchaseHistory || []).length} compras</span>
                  <span style={{ color: "#6366f1", fontSize: 14 }}>{expanded === p.id ? "▲" : "▼"}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {expanded === p.id && (
                <ProductDetail
                  product={p}
                  onEdit={() => { setEditing(p); setShowForm(true); }}
                  onDelete={() => setConfirmDelete(p.id)}
                />
              )}
            </div>
          ))}
        </div>
      ))}
      {filtered.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", marginTop: 60 }}>No hay productos aún</div>}

      {showForm && <ProductForm onClose={() => { setShowForm(false); setEditing(null); }} onSave={save} categories={categories} initial={editing} />}
      {confirmDelete && <ConfirmDialog message="¿Eliminar este producto?" onConfirm={() => del(confirmDelete)} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

// ─── Product Detail ────────────────────────────────────────────────────────────
function ProductDetail({ product: p, onEdit, onDelete }) {
  const history = p.purchaseHistory || [];

  // Bar chart: monto por mes (últimos 12 meses)
  const now = new Date();
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
    const key = getMonthKey(d);
    const recs = history.filter(h => h.monthKey === key);
    const total = recs.reduce((s, r) => s + (r.price || 0) * (r.qty || 1), 0);
    return { label: d.toLocaleString("es", { month: "short" }), total, key };
  });
  const maxBar = Math.max(...months.map(m => m.total), 1);

  // Donut: monto por tienda
  const storeMap = {};
  history.forEach(h => {
    if (h.store) storeMap[h.store] = (storeMap[h.store] || 0) + (h.price || 0) * (h.qty || 1);
  });
  const storeEntries = Object.entries(storeMap).sort((a, b) => b[1] - a[1]);
  const storeTotal = storeEntries.reduce((s, [, v]) => s + v, 0);
  const donutColors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6"];

  // Cheapest store
  const storePrices = {};
  history.forEach(h => {
    if (h.store && h.price > 0) {
      if (!storePrices[h.store] || h.price < storePrices[h.store]) storePrices[h.store] = h.price;
    }
  });
  const cheapest = Object.entries(storePrices).sort((a, b) => a[1] - b[1])[0];

  return (
    <div style={{ background: "#131327", borderRadius: "0 0 14px 14px", border: "1px solid #2a2a4a", borderTop: "none", padding: "14px" }}>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button onClick={onEdit} style={{ flex: 1, background: "#2a2a4a", border: "none", borderRadius: 10, padding: "9px", cursor: "pointer", color: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <Icon name="edit" size={14} /> Editar
        </button>
        <button onClick={onDelete} style={{ flex: 1, background: "#2a0a0a", border: "none", borderRadius: 10, padding: "9px", cursor: "pointer", color: "#f87171", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
          <Icon name="trash" size={14} /> Eliminar
        </button>
      </div>

      {/* Key stats */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
        {[
          { label: "Último precio", value: p.lastPrice > 0 ? `$${p.lastPrice}` : "—" },
          { label: "Última cantidad", value: p.lastQty || "—" },
          { label: "Última tienda", value: p.lastStore || "—" },
          { label: "Total compras", value: history.length },
          { label: "Última compra", value: p.lastPurchaseDate ? new Date(p.lastPurchaseDate).toLocaleDateString("es") : "—" },
          cheapest ? { label: "🏷️ Más barato en", value: `${cheapest[0]} ($${cheapest[1]})` } : null,
        ].filter(Boolean).map((s, i) => (
          <div key={i} style={{ background: "#1a1a2e", borderRadius: 10, padding: "8px 10px" }}>
            <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{s.label}</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Extra photos */}
      {(p.photos || []).length > 1 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Fotos</div>
          <div style={{ display: "flex", gap: 8 }}>
            {p.photos.map((ph, i) => <img key={i} src={ph} alt="" style={{ width: 60, height: 60, borderRadius: 10, objectFit: "cover" }} />)}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <>
          {/* Bar chart: monto por mes */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700, marginBottom: 8 }}>📊 Monto por mes</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 64 }}>
              {months.map((m, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <div style={{ width: "100%", background: i === 11 ? "#6366f1" : "#3730a3", borderRadius: "3px 3px 0 0", height: `${(m.total / maxBar) * 52}px`, minHeight: m.total > 0 ? 3 : 0 }} title={`$${m.total}`} />
                  <div style={{ fontSize: 8, color: "#4b5563" }}>{m.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Donut: por tienda */}
          {storeEntries.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700, marginBottom: 8 }}>🍩 Monto por tienda</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <svg width={72} height={72} viewBox="-1 -1 2 2" style={{ transform: "rotate(-90deg)", flexShrink: 0 }}>
                  {(() => {
                    let offset = 0;
                    return storeEntries.map(([, val], i) => {
                      const pct = val / storeTotal;
                      const circ = Math.PI * 1.6;
                      const dash = pct * circ;
                      const el = <circle key={i} cx="0" cy="0" r={0.8} fill="none" stroke={donutColors[i % donutColors.length]} strokeWidth={0.38} strokeDasharray={`${dash} ${circ - dash}`} strokeDashoffset={-offset} />;
                      offset += dash;
                      return el;
                    });
                  })()}
                </svg>
                <div style={{ flex: 1 }}>
                  {storeEntries.slice(0, 5).map(([name, val], i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 2, background: donutColors[i % donutColors.length], flexShrink: 0 }} />
                      <div style={{ flex: 1, fontSize: 11, color: "#d1d5db", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>${val.toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent history */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700, marginBottom: 8 }}>🕐 Últimas compras</div>
            {history.slice(-5).reverse().map((h, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid #2a2a4a" }}>
                <div>
                  <div style={{ fontSize: 12, color: "#fff" }}>{h.store || "—"}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>{h.date ? new Date(h.date).toLocaleDateString("es") : "—"}{h.brand ? ` · ${h.brand}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#10b981" }}>${h.price}</div>
                  <div style={{ fontSize: 10, color: "#6b7280" }}>×{h.qty}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ProductForm({ onClose, onSave, categories, initial }) {
  const [form, setForm] = useState(initial || { name: "", category: "", brand: "", lastStore: "", photos: [], barcode: "" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  function setDefaultPhoto(idx) {
    if (idx === 0) return;
    const photos = [...form.photos];
    const [picked] = photos.splice(idx, 1);
    set("photos", [picked, ...photos]);
  }

  return (
    <>
      <Modal title={initial ? "Editar Producto" : "Nuevo Producto"} onClose={onClose}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} placeholder="Ej: Leche entera" /></div>
          <div><label style={labelStyle}>Grupo de alimentos</label>
            <select style={inputStyle} value={form.category} onChange={e => set("category", e.target.value)}>
              <option value="">-- Seleccionar --</option>
              {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div><label style={labelStyle}>Marca</label><input style={inputStyle} value={form.brand} onChange={e => set("brand", e.target.value)} placeholder="Ej: Dos Pinos" /></div>
          <div><label style={labelStyle}>Último lugar de compra</label><input style={inputStyle} value={form.lastStore} onChange={e => set("lastStore", e.target.value)} placeholder="Ej: Walmart" /></div>

          {/* Barcode field with camera button */}
          <div>
            <label style={labelStyle}>Código de barras</label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                value={form.barcode}
                onChange={e => set("barcode", e.target.value)}
                placeholder="Ej: 7441234567890"
                inputMode="numeric"
              />
              <button
                onClick={() => setShowBarcodeScanner(true)}
                style={{ background: "#2a2a4a", border: "1px solid #6366f1", borderRadius: 12, padding: "0 14px", cursor: "pointer", color: "#818cf8", display: "flex", alignItems: "center", gap: 6, flexShrink: 0, fontSize: 13, fontWeight: 600 }}
              >
                <Icon name="barcode" size={18} />
              </button>
            </div>
            {form.barcode ? (
              <div style={{ marginTop: 4, fontSize: 11, color: "#10b981" }}>✓ {form.barcode}</div>
            ) : null}
          </div>

          {/* Photos with default selector */}
          <div>
            <label style={labelStyle}>Fotos (máx. 4)</label>
            <PhotoPicker photos={form.photos || []} onChange={v => set("photos", v)} max={4} />
            {(form.photos || []).length > 1 && (
              <div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 6, marginTop: 4 }}>
                  Toca una foto para marcarla como principal (se muestra en el listado)
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {form.photos.map((photo, idx) => (
                    <div key={idx} onClick={() => setDefaultPhoto(idx)} style={{ position: "relative", cursor: "pointer", flexShrink: 0 }}>
                      <img src={photo} alt="" style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", border: idx === 0 ? "2.5px solid #6366f1" : "2.5px solid transparent", opacity: idx === 0 ? 1 : 0.55, transition: "all 0.2s" }} />
                      {idx === 0 && (
                        <div style={{ position: "absolute", bottom: 4, left: "50%", transform: "translateX(-50%)", background: "#6366f1", borderRadius: 6, padding: "1px 6px", fontSize: 9, color: "#fff", fontWeight: 700, whiteSpace: "nowrap" }}>
                          Principal
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button style={btnPrimary} onClick={() => form.name && onSave(form)}>Guardar</button>
        </div>
      </Modal>

      {/* Barcode scanner — renders outside Modal to avoid z-index issues */}
      {showBarcodeScanner && (
        <BarcodeScanner
          onDetected={(code) => {
            set("barcode", code);
            setShowBarcodeScanner(false);
          }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </>
  );
}

// ─── Base Lists ───────────────────────────────────────────────────────────────
function BaseLists({ shoppingTypes, currency, products = [] }) {
  const [lists, setLists] = useState([]);
  const [items, setItems] = useState([]);
  const [selectedList, setSelectedList] = useState(null);
  const [showListForm, setShowListForm] = useState(false);
  const [editList, setEditList] = useState(null);
  const [showItemForm, setShowItemForm] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [confirmDeleteList, setConfirmDeleteList] = useState(null);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const sym = currency?.symbol || "$";

  const load = useCallback(async () => {
    setLists(await dbGetAll("baseLists"));
    setItems(await dbGetAll("baseItems"));
  }, []);
  useEffect(() => { load(); }, [load]);

  const listItems = items.filter(i => i.listId === selectedList?.id);
  const total = listItems.reduce((sum, i) => sum + (i.qty || 1) * (i.price || 0), 0);

  async function saveList(data) {
    const saved = { ...data, id: data.id || Date.now() };
    await dbPut("baseLists", saved);
    await load();
    setShowListForm(false);
    setEditList(null);
    // If we just edited the currently selected list, refresh it
    if (selectedList && selectedList.id === saved.id) setSelectedList(saved);
  }
  async function deleteList(id) {
    await dbDelete("baseLists", id);
    for (const item of items.filter(i => i.listId === id)) await dbDelete("baseItems", item.id);
    setSelectedList(null);
    setConfirmDeleteList(null);
    await load();
  }
  async function saveItem(data) {
    await dbPut("baseItems", { ...data, id: data.id || Date.now(), listId: selectedList.id });
    await load();
    setShowItemForm(false);
    setEditItem(null);
  }
  async function deleteItem(id) {
    await dbDelete("baseItems", id);
    setConfirmDeleteItem(null);
    await load();
  }

  return (
    <div style={{ padding: "0 0 100px" }}>
      {!selectedList ? (
        <>
          <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, color: "#fff", fontSize: 17 }}>Listas Base</h3>
            <button onClick={() => setShowListForm(true)} style={{ ...btnSecondary, padding: "8px 14px" }}>+ Nueva</button>
          </div>
          {lists.map(l => {
            const type = shoppingTypes.find(t => t.id === l.typeId);
            const lItems = items.filter(i => i.listId === l.id);
            return (
              <div key={l.id} style={{ margin: "0 16px 10px", background: "#1a1a2e", borderRadius: 14, padding: "14px 16px", border: "1px solid #2a2a4a", cursor: "pointer" }}
                onClick={() => setSelectedList(l)}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{type?.icon || "📋"} {l.name}</div>
                    <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{lItems.length} productos · {type?.name}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setEditList(l); setShowListForm(true); }} style={{ background: "#2a2a4a", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#8b5cf6" }}><Icon name="edit" size={14} /></button>
                    <button onClick={() => setConfirmDeleteList(l.id)} style={{ background: "#2a0a0a", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#ef4444" }}><Icon name="trash" size={14} /></button>
                  </div>
                </div>
              </div>
            );
          })}
          {lists.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", marginTop: 60 }}>No hay listas base</div>}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 16px 8px" }}>
            <button onClick={() => setSelectedList(null)} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#c4b5fd" }}><Icon name="back" size={18} /></button>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: 16 }}>{selectedList.name}</h3>
              <div style={{ fontSize: 12, color: "#8b5cf6" }}>Total base: {formatCurrency(total, sym)}</div>
            </div>
            <button onClick={() => { setEditList(selectedList); setShowListForm(true); }} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#8b5cf6" }}><Icon name="edit" size={16} /></button>
            <button onClick={() => setShowItemForm(true)} style={{ ...btnSecondary, padding: "8px 14px" }}>+ Producto</button>
          </div>
          {listItems.map(item => (
            <div key={item.id} style={{ margin: "0 16px 8px", background: "#1a1a2e", borderRadius: 14, padding: "12px 14px", border: "1px solid #2a2a4a", display: "flex", gap: 10, alignItems: "center" }}>
              {item.photo ? <img src={item.photo} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} /> :
                <div style={{ width: 44, height: 44, borderRadius: 8, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📦</div>}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>{item.name}</div>
                {item.brand && <div style={{ fontSize: 11, color: "#8b5cf6" }}>{item.brand}</div>}
                <div style={{ fontSize: 12, color: "#6b7280" }}>{item.qty} × {formatCurrency(item.price, sym)} = {formatCurrency((item.qty || 1) * (item.price || 0), sym)}</div>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => { setEditItem(item); setShowItemForm(true); }} style={{ background: "#2a2a4a", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#8b5cf6" }}><Icon name="edit" size={14} /></button>
                <button onClick={() => setConfirmDeleteItem(item.id)} style={{ background: "#2a2a4a", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#ef4444" }}><Icon name="trash" size={14} /></button>
              </div>
            </div>
          ))}
          {listItems.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", marginTop: 40 }}>Lista vacía</div>}
        </>
      )}

      {showListForm && (
        <Modal title={editList ? "Editar Lista Base" : "Nueva Lista Base"} onClose={() => { setShowListForm(false); setEditList(null); }}>
          <ListBaseForm onSave={saveList} onClose={() => { setShowListForm(false); setEditList(null); }} shoppingTypes={shoppingTypes} initial={editList} />
        </Modal>
      )}
      {showItemForm && (
        <Modal title={editItem ? "Editar Producto" : "Nuevo Producto"} onClose={() => { setShowItemForm(false); setEditItem(null); }}>
          <BaseItemForm onSave={saveItem} onClose={() => { setShowItemForm(false); setEditItem(null); }} initial={editItem} products={products} listItems={listItems} />
        </Modal>
      )}
      {confirmDeleteList && (
        <ConfirmDialog message="¿Eliminar esta lista y todos sus productos?" onConfirm={() => deleteList(confirmDeleteList)} onCancel={() => setConfirmDeleteList(null)} />
      )}
      {confirmDeleteItem && (
        <ConfirmDialog message="¿Eliminar este producto de la lista?" onConfirm={() => deleteItem(confirmDeleteItem)} onCancel={() => setConfirmDeleteItem(null)} />
      )}
    </div>
  );
}

function ListBaseForm({ onSave, onClose, shoppingTypes, initial }) {
  const [name, setName] = useState(initial?.name || "");
  const [typeId, setTypeId] = useState(initial?.typeId || shoppingTypes[0]?.id || "");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Lista Supermercado Enero" /></div>
      <div><label style={labelStyle}>Tipo de compra</label>
        <select style={inputStyle} value={typeId} onChange={e => setTypeId(Number(e.target.value))}>
          {shoppingTypes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>
      </div>
      <button style={btnPrimary} onClick={() => name && onSave({ ...(initial || {}), name, typeId: Number(typeId) })}>Guardar</button>
    </div>
  );
}

function BaseItemForm({ onSave, onClose, initial, products = [], listItems = [] }) {
  const alreadyInList = new Set(listItems.map(i => i.productId));
  // Available products = from catalog, excluding those already in this list (unless editing that item)
  const available = products.filter(p => !alreadyInList.has(p.id) || (initial?.productId === p.id));

  const [selectedProductId, setSelectedProductId] = useState(initial?.productId || "");
  const [qty, setQty] = useState(initial?.qty || 1);
  const [price, setPrice] = useState(initial?.price || 0);
  const [search, setSearch] = useState("");

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // When a product is selected, pre-fill qty/price from its last purchase data
  function handleSelectProduct(p) {
    setSelectedProductId(p.id);
    setQty(p.lastQty || 1);
    setPrice(p.lastPrice || 0);
    setSearch("");
  }

  const filteredAvailable = available.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase())
  );

  function handleSave() {
    if (!selectedProduct) return;
    onSave({
      ...(initial || {}),
      productId: selectedProduct.id,
      name: selectedProduct.name,
      brand: selectedProduct.brand || "",
      photo: selectedProduct.photos?.[0] || null,
      barcode: selectedProduct.barcode || "",
      qty,
      price,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Product selector */}
      {!selectedProduct ? (
        <div>
          <label style={labelStyle}>Seleccionar producto del catálogo</label>
          <div style={{ position: "relative", marginBottom: 8 }}>
            <input
              style={{ ...inputStyle, paddingLeft: 34 }}
              placeholder="Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            <div style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "#6b7280" }}>
              <Icon name="search" size={15} />
            </div>
          </div>
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {filteredAvailable.length === 0 && (
              <div style={{ color: "#6b7280", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
                {products.length === 0
                  ? "No hay productos en el catálogo. Agrégalos en la sección Productos."
                  : "No se encontraron productos disponibles."}
              </div>
            )}
            {filteredAvailable.map(p => (
              <div key={p.id}
                onClick={() => handleSelectProduct(p)}
                style={{ display: "flex", gap: 10, alignItems: "center", background: "#0f0f1e", borderRadius: 12, padding: "10px 12px", cursor: "pointer", border: "1px solid #2a2a4a" }}>
                {p.photos?.[0]
                  ? <img src={p.photos[0]} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📦</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>{p.name}</div>
                  {p.brand && <div style={{ fontSize: 11, color: "#8b5cf6" }}>{p.brand}</div>}
                  {p.lastPrice > 0 && <div style={{ fontSize: 11, color: "#10b981" }}>{p.lastPrice} · {p.lastStore || ""}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Selected product summary */}
          <div>
            <label style={labelStyle}>Producto seleccionado</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center", background: "#0f1f2e", borderRadius: 12, padding: "10px 12px", border: "1px solid #3b82f6" }}>
              {selectedProduct.photos?.[0]
                ? <img src={selectedProduct.photos[0]} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                : <div style={{ width: 44, height: 44, borderRadius: 8, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📦</div>}
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{selectedProduct.name}</div>
                {selectedProduct.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{selectedProduct.brand}</div>}
              </div>
              {!initial && (
                <button onClick={() => setSelectedProductId("")} style={{ background: "#2a2a4a", border: "none", borderRadius: 8, padding: 6, cursor: "pointer", color: "#9ca3af" }}>
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          </div>

          {/* Qty & Price */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={labelStyle}>Cantidad</label>
              <NumInput value={qty} onChange={setQty} step="1" min={1} placeholder="1" />
            </div>
            <div><label style={labelStyle}>Precio unit.</label>
              <NumInput value={price} onChange={setPrice} />
            </div>
          </div>

          <button style={btnPrimary} onClick={handleSave}>Guardar</button>
        </>
      )}
    </div>
  );
}

// ─── Shopping Sessions ────────────────────────────────────────────────────────
function ShoppingSessions({ shoppingTypes, baseLists, baseItems, currency }) {
  const [sessions, setSessions] = useState([]);
  const [active, setActive] = useState(null);
  const [viewSession, setViewSession] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [reviewData, setReviewData] = useState(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(null);
  const sym = currency?.symbol || "$";

  const load = useCallback(async () => {
    const s = await dbGetAll("sessions");
    setSessions(s.sort((a, b) => b.createdAt - a.createdAt));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function startSession(data) {
    const monthKey = getMonthKey();
    const allSessions = await dbGetAll("sessions");

    // Productos ya comprados este mes en otras sesiones completadas
    const monthCompleted = allSessions.filter(s => s.completed && s.monthKey === monthKey);
    const boughtBaseIds = new Set();
    monthCompleted.forEach(s => (s.items || []).forEach(i => { if (i.baseItemId) boughtBaseIds.add(i.baseItemId); }));

    // Si hay lista base, verificar cuáles productos ya fueron comprados
    if (data.listId) {
      const listBaseItems = baseItems.filter(bi => bi.listId === data.listId);
      const alreadyBought = listBaseItems.filter(bi => boughtBaseIds.has(bi.id));

      if (alreadyBought.length > 0) {
        // Pausar e ir a revisión antes de iniciar
        setReviewData({ pendingSession: data, alreadyBought });
        setShowNew(false);
        return;
      }
    }

    await doStartSession(data);
  }

  async function doStartSession(data, excludedIds = new Set(), deletedIds = new Set()) {
    // Eliminar de lista base los productos marcados para eliminar
    for (const id of deletedIds) await dbDelete("baseItems", id);

    const session = {
      ...data,
      id: Date.now(),
      createdAt: Date.now(),
      completed: false,
      monthKey: getMonthKey(),
      items: [],
      total: 0,
      excludedBaseIds: [...excludedIds], // productos excluidos solo de esta sesión
    };
    await dbPut("sessions", session);
    await load();
    setActive(session);
    setReviewData(null);
    setShowNew(false);
  }

  async function deleteSession(id) {
    await dbDelete("sessions", id);
    await load();
    setConfirmDeleteSession(null);
  }

  if (active) {
    return <ActiveSession session={active} baseItems={baseItems} baseLists={baseLists} currency={currency}
      onComplete={async (updated) => { await dbPut("sessions", updated); await load(); setActive(null); }}
      onBack={() => setActive(null)} />;
  }

  if (viewSession) {
    return <SessionDetail session={viewSession} shoppingTypes={shoppingTypes} currency={currency} onBack={() => setViewSession(null)} />;
  }

  if (reviewData) {
    return (
      <AlreadyBoughtReview
        alreadyBought={reviewData.alreadyBought}
        currency={currency}
        onConfirm={(excludedIds, deletedIds) => doStartSession(reviewData.pendingSession, excludedIds, deletedIds)}
        onCancel={() => setReviewData(null)}
      />
    );
  }

  return (
    <div style={{ padding: "0 0 100px" }}>
      <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0, color: "#fff", fontSize: 17 }}>Sesiones de Compra</h3>
        <button onClick={() => setShowNew(true)} style={{ ...btnSecondary, padding: "8px 14px" }}>+ Nueva</button>
      </div>

      {sessions.map(s => {
        const type = shoppingTypes.find(t => t.id === s.typeId);
        const over = s.budget > 0 && s.total > s.budget;
        return (
          <div key={s.id} style={{ margin: "0 16px 10px", background: "#1a1a2e", borderRadius: 14, padding: "14px 16px", border: `1px solid ${over ? "#ef4444" : "#2a2a4a"}`, cursor: "pointer" }}
            onClick={() => s.completed ? setViewSession(s) : setActive(s)}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 18 }}>{type?.icon || "🛒"}</span>
                  <span style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{s.storeName || s.name}</span>
                  {s.completed && <span style={{ background: "#10b981", borderRadius: 99, padding: "2px 8px", fontSize: 10, color: "#fff", fontWeight: 700 }}>✓ Completado</span>}
                  {!s.completed && <span style={{ background: "#f59e0b", borderRadius: 99, padding: "2px 8px", fontSize: 10, color: "#fff", fontWeight: 700 }}>En curso</span>}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>{new Date(s.createdAt).toLocaleDateString("es")} · {type?.name}</div>
                {s.budget > 0 && <div style={{ fontSize: 12, color: "#6b7280" }}>Presupuesto: {formatCurrency(s.budget, sym)}</div>}
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0, marginLeft: 10 }}>
                <div style={{ fontWeight: 800, fontSize: 18, color: over ? "#ef4444" : "#10b981" }}>{formatCurrency(s.total, sym)}</div>
                <div style={{ fontSize: 11, color: "#6b7280" }}>{s.items?.length || 0} productos</div>
                {s.completed && <div style={{ fontSize: 11, color: "#6366f1" }}>Ver detalle →</div>}
                {!s.completed && (
                  <button
                    onClick={e => { e.stopPropagation(); setConfirmDeleteSession(s); }}
                    style={{ background: "#2a0a0a", border: "none", borderRadius: 8, padding: "5px 8px", cursor: "pointer", color: "#f87171", display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 600, marginTop: 2 }}>
                    <Icon name="trash" size={13} /> Eliminar
                  </button>
                )}
              </div>
            </div>
            {over && <div style={{ marginTop: 8, background: "#450a0a", borderRadius: 8, padding: "6px 10px", color: "#fca5a5", fontSize: 12 }}>⚠️ Excede el presupuesto</div>}
          </div>
        );
      })}
      {sessions.length === 0 && <div style={{ textAlign: "center", color: "#6b7280", marginTop: 60 }}>No hay sesiones aún</div>}

      {showNew && (
        <Modal title="Nueva Sesión de Compra" onClose={() => setShowNew(false)}>
          <NewSessionForm onStart={startSession} onClose={() => setShowNew(false)} shoppingTypes={shoppingTypes} baseLists={baseLists} />
        </Modal>
      )}
      {confirmDeleteSession && (
        <ConfirmDialog
          message={`¿Eliminar la compra en curso en "${confirmDeleteSession.storeName}"? Se perderán todos los productos registrados.`}
          onConfirm={() => deleteSession(confirmDeleteSession.id)}
          onCancel={() => setConfirmDeleteSession(null)}
        />
      )}
    </div>
  );
}

// ─── Session Detail (read-only) ───────────────────────────────────────────────
function SessionDetail({ session, shoppingTypes, currency, onBack }) {
  const sym = currency?.symbol || "$";
  const type = shoppingTypes.find(t => t.id === session.typeId);
  const items = session.items || [];
  const total = items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
  const over = session.budget > 0 && total > session.budget;
  const [expandedItem, setExpandedItem] = useState(null);
  const [photoViewer, setPhotoViewer] = useState(null);

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0f0f1e" }}>
      {photoViewer && (
        <PhotoViewer photos={photoViewer.photos} startIndex={photoViewer.index} onClose={() => setPhotoViewer(null)} />
      )}
      {/* Header */}
      <div style={{ background: "#1a1a2e", padding: "14px 16px 12px", borderBottom: "1px solid #2a2a4a", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#c4b5fd" }}>
            <Icon name="back" size={18} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 16 }}>{type?.icon || "🛒"} {session.storeName}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {new Date(session.createdAt).toLocaleDateString("es", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </div>
          </div>
          <span style={{ background: "#10b981", borderRadius: 99, padding: "3px 10px", fontSize: 11, color: "#fff", fontWeight: 700 }}>✓ Completado</span>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 0 100px" }}>

        {/* Summary cards */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, margin: "0 16px 16px" }}>
          <div style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 16, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginBottom: 4 }}>Total gastado</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{formatCurrency(total, sym)}</div>
          </div>
          <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "14px 16px", border: "1px solid #2a2a4a" }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Productos</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#fff" }}>{items.length}</div>
          </div>
          {session.budget > 0 && (
            <>
              <div style={{ background: "#1a1a2e", borderRadius: 16, padding: "14px 16px", border: "1px solid #2a2a4a" }}>
                <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>Presupuesto</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#fff" }}>{formatCurrency(session.budget, sym)}</div>
              </div>
              <div style={{ background: over ? "#1a0a0a" : "#0a1a0f", borderRadius: 16, padding: "14px 16px", border: `1px solid ${over ? "#ef4444" : "#10b981"}` }}>
                <div style={{ fontSize: 11, color: over ? "#f87171" : "#6ee7b7", marginBottom: 4 }}>{over ? "⚠️ Excedido" : "Ahorro"}</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: over ? "#ef4444" : "#10b981" }}>{formatCurrency(Math.abs(session.budget - total), sym)}</div>
              </div>
            </>
          )}
        </div>

        {/* Completion date */}
        {session.completedAt && (
          <div style={{ margin: "0 16px 12px", background: "#1a1a2e", borderRadius: 12, padding: "10px 14px", border: "1px solid #2a2a4a", fontSize: 12, color: "#6b7280" }}>
            🕐 Finalizado: {new Date(session.completedAt).toLocaleString("es", { dateStyle: "medium", timeStyle: "short" })}
          </div>
        )}

        {/* Items list */}
        <div style={{ padding: "0 16px 4px" }}>
          <div style={{ color: "#9ca3af", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
            Productos comprados
          </div>
        </div>

        {items.map((item, idx) => {
          const isExpanded = expandedItem === idx;
          const itemTotal = (item.qty || 1) * (item.price || 0);
          // Merge all available photos (item + any single photo field)
          const allPhotos = [
            ...(item.photos || []),
            ...(item.photo && !item.photos?.includes(item.photo) ? [item.photo] : []),
          ].filter((p, i, arr) => p && arr.indexOf(p) === i);
          return (
            <div key={idx} style={{ margin: "0 16px 8px" }}>
              <div
                style={{ background: "#1a1a2e", borderRadius: isExpanded ? "14px 14px 0 0" : 14, padding: "12px 14px", border: "1px solid #2a2a4a", cursor: "pointer", display: "flex", gap: 12, alignItems: "center" }}
                onClick={() => setExpandedItem(isExpanded ? null : idx)}
              >
                {/* Foto */}
                {allPhotos.length > 0 ? (
                  <div style={{ position: "relative", flexShrink: 0, cursor: "pointer" }}
                    onClick={e => { e.stopPropagation(); setPhotoViewer({ photos: allPhotos, index: 0 }); }}>
                    <img src={allPhotos[0]} alt="" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover", display: "block" }} />
                    {allPhotos.length > 1 && (
                      <div style={{ position: "absolute", bottom: -2, right: -2, background: "#6366f1", borderRadius: 6, padding: "1px 5px", fontSize: 9, color: "#fff", fontWeight: 700 }}>
                        +{allPhotos.length - 1}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>📦</div>
                )}
                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{item.name}</div>
                  {item.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{item.brand}</div>}
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{item.qty} × {formatCurrency(item.price, sym)}</div>
                </div>
                {/* Total + expand */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontWeight: 800, color: "#10b981", fontSize: 15 }}>{formatCurrency(itemTotal, sym)}</div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{isExpanded ? "▲" : "▼"} detalle</div>
                </div>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div style={{ background: "#131327", borderRadius: "0 0 14px 14px", border: "1px solid #2a2a4a", borderTop: "none", padding: "12px 14px" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: item.photos?.length > 1 ? 10 : 0 }}>
                    {[
                      { label: "Cantidad", value: item.qty },
                      { label: "Precio unitario", value: formatCurrency(item.price, sym) },
                      { label: "Total", value: formatCurrency(itemTotal, sym) },
                      item.brand && { label: "Marca", value: item.brand },
                      item.barcode && { label: "Código de barras", value: item.barcode },
                      item.pendingBaseAdd && { label: "Lista base", value: "✅ Agregado al finalizar" },
                    ].filter(Boolean).map((row, i) => (
                      <div key={i} style={{ background: "#1a1a2e", borderRadius: 10, padding: "8px 10px" }}>
                        <div style={{ fontSize: 10, color: "#6b7280", marginBottom: 2 }}>{row.label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{row.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* Extra photos */}
                  {allPhotos.length > 1 && (
                    <div>
                      <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 6 }}>Fotos ({allPhotos.length})</div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {allPhotos.map((p, pi) => (
                          <img key={pi} src={p} alt=""
                            onClick={() => setPhotoViewer({ photos: allPhotos, index: pi })}
                            style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", cursor: "pointer", border: pi === 0 ? "2px solid #6366f1" : "2px solid transparent" }} />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {items.length === 0 && (
          <div style={{ textAlign: "center", color: "#6b7280", marginTop: 40 }}>Sin productos registrados</div>
        )}

        {/* Total footer */}
        <div style={{ margin: "16px 16px 0", background: over ? "#1a0a0a" : "linear-gradient(135deg,#064e3b,#065f46)", borderRadius: 16, padding: "16px 20px", border: `1px solid ${over ? "#ef4444" : "#10b981"}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ color: over ? "#fca5a5" : "#a7f3d0", fontWeight: 700, fontSize: 15 }}>
              {over ? "⚠️ Total (excedido)" : "✅ Total de la compra"}
            </div>
            <div style={{ fontWeight: 900, fontSize: 24, color: over ? "#ef4444" : "#10b981" }}>{formatCurrency(total, sym)}</div>
          </div>
          {session.budget > 0 && (
            <div style={{ marginTop: 6, fontSize: 12, color: over ? "#f87171" : "#6ee7b7" }}>
              {over ? `Excedió el presupuesto por ${formatCurrency(total - session.budget, sym)}` : `Ahorro de ${formatCurrency(session.budget - total, sym)} del presupuesto`}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Already Bought Review ────────────────────────────────────────────────────
function AlreadyBoughtReview({ alreadyBought, currency, onConfirm, onCancel }) {
  const sym = currency?.symbol || "$";
  // State per item: "include" | "exclude" | "delete"
  const [decisions, setDecisions] = useState(() =>
    Object.fromEntries(alreadyBought.map(bi => [bi.id, "exclude"]))
  );

  function setDecision(id, val) {
    setDecisions(d => ({ ...d, [id]: val }));
  }

  function handleConfirm() {
    const excludedIds = new Set(Object.entries(decisions).filter(([, v]) => v === "exclude").map(([k]) => Number(k)));
    const deletedIds = new Set(Object.entries(decisions).filter(([, v]) => v === "delete").map(([k]) => Number(k)));
    onConfirm(excludedIds, deletedIds);
  }

  const colors = {
    include: { bg: "#0a1f2e", border: "#3b82f6", label: "#93c5fd", dot: "#3b82f6" },
    exclude: { bg: "#1a1a2e", border: "#4b5563", label: "#9ca3af", dot: "#6b7280" },
    delete:  { bg: "#1a0a0a", border: "#ef4444", label: "#fca5a5", dot: "#ef4444" },
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#0f0f1e" }}>
      {/* Header */}
      <div style={{ background: "#1a1a2e", padding: "14px 16px 12px", borderBottom: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onCancel} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#c4b5fd" }}>
            <Icon name="back" size={18} />
          </button>
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 16 }}>🔍 Revisión de productos</div>
            <div style={{ fontSize: 12, color: "#f59e0b" }}>Productos ya comprados este mes</div>
          </div>
        </div>
      </div>

      {/* Explanation */}
      <div style={{ margin: "14px 16px 4px", background: "#1c1800", border: "1px solid #78350f", borderRadius: 14, padding: "12px 14px" }}>
        <div style={{ fontSize: 13, color: "#fcd34d", lineHeight: 1.5 }}>
          Los siguientes productos ya fueron adquiridos en una compra anterior de este mes. Indica qué deseas hacer con cada uno.
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 8, margin: "10px 16px 4px", flexWrap: "wrap" }}>
        {[
          { val: "include", label: "Comprar de nuevo", icon: "🔄" },
          { val: "exclude", label: "Omitir esta vez", icon: "⏭️" },
          { val: "delete",  label: "Eliminar de lista", icon: "🗑️" },
        ].map(opt => (
          <div key={opt.val} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: colors[opt.val].label }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: colors[opt.val].dot }} />
            {opt.icon} {opt.label}
          </div>
        ))}
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0 120px" }}>
        {alreadyBought.map(bi => {
          const dec = decisions[bi.id];
          const c = colors[dec];
          return (
            <div key={bi.id} style={{ margin: "0 16px 10px", background: c.bg, borderRadius: 16, border: `1.5px solid ${c.border}`, overflow: "hidden", transition: "all 0.2s" }}>
              {/* Item info */}
              <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px 10px" }}>
                {bi.photo ? (
                  <img src={bi.photo} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 10, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>📦</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{bi.name}</div>
                  {bi.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{bi.brand}</div>}
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    {bi.qty} × {formatCurrency(bi.price, sym)} = {formatCurrency((bi.qty || 1) * (bi.price || 0), sym)}
                  </div>
                  {bi.lastPurchase?.store && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>📍 Comprado en: {bi.lastPurchase.store}</div>
                  )}
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", borderTop: `1px solid ${c.border}` }}>
                {[
                  { val: "include", label: "Comprar\nde nuevo", icon: "🔄" },
                  { val: "exclude", label: "Omitir\nesta vez",  icon: "⏭️" },
                  { val: "delete",  label: "Eliminar\nde lista", icon: "🗑️" },
                ].map((opt, i) => (
                  <button key={opt.val} onClick={() => setDecision(bi.id, opt.val)}
                    style={{
                      background: dec === opt.val ? colors[opt.val].bg : "transparent",
                      border: "none",
                      borderLeft: i > 0 ? `1px solid ${c.border}` : "none",
                      padding: "10px 4px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 3,
                    }}>
                    <div style={{ fontSize: 16 }}>{opt.icon}</div>
                    <div style={{ fontSize: 10, color: dec === opt.val ? colors[opt.val].label : "#6b7280", fontWeight: dec === opt.val ? 700 : 400, textAlign: "center", lineHeight: 1.3, whiteSpace: "pre-line" }}>{opt.label}</div>
                    {dec === opt.val && <div style={{ width: 4, height: 4, borderRadius: "50%", background: colors[opt.val].dot }} />}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary + confirm */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#1a1a2e", borderTop: "1px solid #2a2a4a", padding: "12px 16px 30px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10, fontSize: 12 }}>
          {[
            { val: "include", label: "Comprar de nuevo", color: "#3b82f6" },
            { val: "exclude", label: "Omitidos", color: "#6b7280" },
            { val: "delete",  label: "A eliminar", color: "#ef4444" },
          ].map(opt => {
            const count = Object.values(decisions).filter(v => v === opt.val).length;
            return count > 0 ? (
              <div key={opt.val} style={{ background: "#0f0f1e", borderRadius: 8, padding: "4px 10px", color: opt.color, fontWeight: 600 }}>
                {count} {opt.label}
              </div>
            ) : null;
          })}
        </div>
        <button style={btnPrimary} onClick={handleConfirm}>
          Continuar con la compra →
        </button>
      </div>
    </div>
  );
}

function NewSessionForm({ onStart, onClose, shoppingTypes, baseLists }) {
  const [stores, setStores] = useState([]);
  const [typeId, setTypeId] = useState(shoppingTypes[0]?.id || "");
  const [storeName, setStoreName] = useState("");
  const [newStore, setNewStore] = useState(false);
  const [listId, setListId] = useState("");
  const [budget, setBudget] = useState(0);

  useEffect(() => { dbGetAll("stores").then(setStores); }, []);

  const typeLists = baseLists.filter(l => l.typeId === Number(typeId));

  async function handleStart() {
    let sName = storeName;
    if (newStore && storeName) {
      await dbPut("stores", { id: Date.now(), name: storeName, typeId: Number(typeId) });
      sName = storeName;
    }
    onStart({ typeId: Number(typeId), storeName: sName, listId: listId ? Number(listId) : null, budget: Number(budget) });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><label style={labelStyle}>Tipo de compra</label>
        <select style={inputStyle} value={typeId} onChange={e => setTypeId(e.target.value)}>
          {shoppingTypes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
        </select>
      </div>
      <div>
        <label style={labelStyle}>Tienda / Lugar</label>
        {!newStore ? (
          <div style={{ display: "flex", gap: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={storeName} onChange={e => setStoreName(e.target.value)}>
              <option value="">-- Seleccionar --</option>
              {stores.filter(s => !s.typeId || s.typeId === Number(typeId)).map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
            <button onClick={() => setNewStore(true)} style={{ ...btnSecondary, padding: "10px 14px", borderRadius: 12, whiteSpace: "nowrap" }}>+ Nueva</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...inputStyle, flex: 1 }} value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nombre de la tienda" />
            <button onClick={() => setNewStore(false)} style={{ ...btnSecondary, padding: "10px 14px", borderRadius: 12 }}>↩</button>
          </div>
        )}
      </div>
      {typeLists.length > 0 && (
        <div><label style={labelStyle}>Lista base</label>
          <select style={inputStyle} value={listId} onChange={e => setListId(e.target.value)}>
            <option value="">Sin lista base</option>
            {typeLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
      )}
      <div><label style={labelStyle}>Presupuesto (0 = sin límite)</label><NumInput value={budget} onChange={setBudget} placeholder="Sin límite" /></div>
      <button style={btnPrimary} onClick={handleStart} disabled={!storeName}>Iniciar Compra</button>
    </div>
  );
}

// ─── Photo Viewer Lightbox ────────────────────────────────────────────────────
function PhotoViewer({ photos, startIndex = 0, onClose }) {
  const [current, setCurrent] = useState(startIndex);
  const total = photos.length;

  function prev() { setCurrent(i => (i - 1 + total) % total); }
  function next() { setCurrent(i => (i + 1) % total); }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 5000, background: "rgba(0,0,0,0.95)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#fff", zIndex: 10 }}
      >
        <Icon name="x" size={20} />
      </button>

      {/* Counter */}
      {total > 1 && (
        <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.6)", borderRadius: 20, padding: "4px 12px", color: "#fff", fontSize: 13 }}>
          {current + 1} / {total}
        </div>
      )}

      {/* Image */}
      <img
        src={photos[current]}
        alt=""
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "78vh", objectFit: "contain", borderRadius: 12, boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
      />

      {/* Prev / Next */}
      {total > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); prev(); }}
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, padding: "12px 10px", cursor: "pointer", color: "#fff" }}
          >
            <Icon name="back" size={22} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); next(); }}
            style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%) scaleX(-1)", background: "rgba(255,255,255,0.15)", border: "none", borderRadius: 10, padding: "12px 10px", cursor: "pointer", color: "#fff" }}
          >
            <Icon name="back" size={22} />
          </button>
        </>
      )}

      {/* Thumbnail strip for multi-photo */}
      {total > 1 && (
        <div style={{ position: "absolute", bottom: 24, display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
          {photos.map((p, i) => (
            <img
              key={i}
              src={p}
              alt=""
              onClick={() => setCurrent(i)}
              style={{ width: 50, height: 50, borderRadius: 8, objectFit: "cover", opacity: i === current ? 1 : 0.45, border: i === current ? "2px solid #6366f1" : "2px solid transparent", cursor: "pointer", transition: "all 0.2s" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Barcode Scanner (ZXing BrowserMultiFormatReader — Safari iOS compatible) ─
function BarcodeScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const loadAndStart = useCallback(async () => {
    if (!window.ZXing) {
      try {
        await new Promise((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://cdn.jsdelivr.net/npm/@zxing/library@0.19.1/umd/index.min.js";
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      } catch {
        setStatus("error");
        setErrorMsg("No se pudo cargar la librería. Ingresa el código manualmente.");
        return;
      }
    }

    if (!window.ZXing?.BrowserMultiFormatReader) {
      setStatus("error");
      setErrorMsg("Librería no disponible. Ingresa el código manualmente.");
      return;
    }

    try {
      const hints = new Map();
      if (window.ZXing.DecodeHintType && window.ZXing.BarcodeFormat) {
        hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
        hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [
          window.ZXing.BarcodeFormat.EAN_13, window.ZXing.BarcodeFormat.EAN_8,
          window.ZXing.BarcodeFormat.UPC_A,  window.ZXing.BarcodeFormat.UPC_E,
          window.ZXing.BarcodeFormat.CODE_128, window.ZXing.BarcodeFormat.CODE_39,
          window.ZXing.BarcodeFormat.QR_CODE,
        ]);
      }
      readerRef.current = new window.ZXing.BrowserMultiFormatReader(hints);

      // Pick rear camera — handle both static and instance method variants
      let deviceId;
      try {
        const listFn =
          window.ZXing.BrowserMultiFormatReader.listVideoInputDevices ||
          window.ZXing.BrowserCodeReader?.listVideoInputDevices;
        if (listFn) {
          const devices = await listFn.call(window.ZXing.BrowserMultiFormatReader);
          const rear = devices.find(d => /back|rear|environment/i.test(d.label))
            || devices[devices.length - 1];
          deviceId = rear?.deviceId;
        }
      } catch { /* listVideoInputDevices failed — let decodeFromVideoDevice pick default */ }

      setStatus("scanning");

      await readerRef.current.decodeFromVideoDevice(
        deviceId ?? undefined,
        videoRef.current,
        (result, err) => {
          if (result) {
            teardown();
            onDetected(result.getText());
          }
        }
      );
    } catch (e) {
      console.error("Scanner error:", e);
      const msg = e?.name === "NotAllowedError"
        ? "Permiso de cámara denegado. Ve a Ajustes → Safari → Cámara y permite el acceso, luego vuelve a intentarlo."
        : e?.name === "NotFoundError"
        ? "No se encontró ninguna cámara en este dispositivo."
        : e?.name === "NotReadableError"
        ? "La cámara está siendo usada por otra aplicación. Ciérrala e intenta de nuevo."
        : `Error al iniciar la cámara (${e?.name || "desconocido"}). Ingresa el código manualmente.`;
      setStatus("error");
      setErrorMsg(msg);
    }
  }, [onDetected]);

  useEffect(() => {
    loadAndStart();
    return () => teardown();
  }, [loadAndStart]);

  function teardown() {
    try { readerRef.current?.reset(); } catch {}
  }

  function handleManual() {
    const code = manualCode.trim();
    if (!code) return;
    teardown();
    onDetected(code);
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "#000", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", background: "rgba(0,0,0,0.85)", flexShrink: 0 }}>
        <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>📷 Escanear código de barras</div>
        <button onClick={() => { teardown(); onClose(); }} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#c4b5fd" }}>
          <Icon name="x" size={18} />
        </button>
      </div>

      <div style={{ flex: 1, position: "relative", overflow: "hidden", background: "#000" }}>
        <video ref={videoRef} style={{ width: "100%", height: "100%", objectFit: "cover" }} playsInline muted />

        {status === "scanning" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
            <div style={{ position: "relative", width: 260, height: 160 }}>
              <div style={{ position: "absolute", inset: 0, border: "2px solid #6366f1", borderRadius: 12, boxShadow: "0 0 0 2000px rgba(0,0,0,0.55)" }} />
              <div style={{ position: "absolute", left: 8, right: 8, height: 2, background: "linear-gradient(90deg,transparent,#6366f1,#a5b4fc,#6366f1,transparent)", borderRadius: 1, animation: "scanline 1.8s ease-in-out infinite" }} />
              {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h],i) => (
                <div key={i} style={{ position: "absolute", width: 18, height: 18, [v]: -1, [h]: -1,
                  borderTop: v==="top"?"3px solid #818cf8":"none", borderBottom: v==="bottom"?"3px solid #818cf8":"none",
                  borderLeft: h==="left"?"3px solid #818cf8":"none", borderRight: h==="right"?"3px solid #818cf8":"none" }} />
              ))}
            </div>
            <div style={{ position: "absolute", bottom: 90, left: 0, right: 0, textAlign: "center", color: "#e5e7eb", fontSize: 13, textShadow: "0 1px 4px #000" }}>
              Apunta el código de barras al recuadro
            </div>
          </div>
        )}

        {status === "loading" && (
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 36 }}>⏳</div>
            <div style={{ color: "#9ca3af", fontSize: 14 }}>Iniciando cámara…</div>
          </div>
        )}

        {status === "error" && (
          <div style={{ position: "absolute", inset: 0, background: "#0f0f1e", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 14, padding: 28, textAlign: "center", overflowY: "auto" }}>
            <div style={{ fontSize: 40 }}>📷</div>
            <div style={{ color: "#fca5a5", fontSize: 14, lineHeight: 1.6 }}>{errorMsg}</div>
            {errorMsg.includes("Permiso") && (
              <div style={{ background: "#1a1a2e", borderRadius: 12, padding: "12px 14px", border: "1px solid #78350f", textAlign: "left" }}>
                <div style={{ color: "#fbbf24", fontWeight: 700, fontSize: 13, marginBottom: 8 }}>📱 Cómo habilitar en Safari iOS:</div>
                <div style={{ color: "#d1d5db", fontSize: 12, lineHeight: 1.7 }}>
                  1. Cierra esta pantalla<br/>
                  2. Ve a <strong style={{color:"#fff"}}>Ajustes</strong> del iPhone<br/>
                  3. Baja hasta <strong style={{color:"#fff"}}>Safari</strong><br/>
                  4. Toca <strong style={{color:"#fff"}}>Cámara</strong><br/>
                  5. Selecciona <strong style={{color:"#fff"}}>Permitir</strong><br/>
                  6. Vuelve a la app e intenta de nuevo
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ background: "#1a1a2e", padding: "14px 16px 36px", borderTop: "1px solid #2a2a4a", flexShrink: 0 }}>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8 }}>
          {status === "scanning" ? "O ingresa el código manualmente:" : "Ingresa el código manualmente:"}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <input style={{ ...inputStyle, flex: 1 }} value={manualCode}
            onChange={e => setManualCode(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleManual()}
            placeholder="Ej: 7441234567890" inputMode="numeric" />
          <button onClick={handleManual} disabled={!manualCode.trim()}
            style={{ ...btnSecondary, padding: "12px 16px", opacity: manualCode.trim() ? 1 : 0.4 }}>
            Buscar
          </button>
        </div>
      </div>

      <style>{`@keyframes scanline { 0%{top:10%} 50%{top:85%} 100%{top:10%} }`}</style>
    </div>
  );
}

// ─── Barcode Result Handler ───────────────────────────────────────────────────
function BarcodeResult({ barcode, cartItems, pendingItems, allProducts, currency, onAddToCart, onIncrementCart, onClose, sym }) {
  // 1. Already in cart?
  const inCart = cartItems.filter(i => i.barcode === barcode);
  // 2. In pending list?
  const inPending = pendingItems.filter(bi => bi.barcode === barcode);
  // 3. In products catalog?
  const inCatalog = allProducts.filter(p => p.barcode === barcode);

  const [price, setPrice] = useState(() => {
    if (inCart[0]) return inCart[0].price || 0;
    if (inPending[0]) return inPending[0].price || 0;
    if (inCatalog[0]) return inCatalog[0].lastPrice || 0;
    return 0;
  });
  const [newName, setNewName] = useState(inCatalog[0]?.name || "");
  const [newBrand, setNewBrand] = useState(inCatalog[0]?.brand || "");
  const [photo, setPhoto] = useState(null);
  const fileRef = useRef();

  // Case 1: already in cart — just increment qty + ask price
  if (inCart.length > 0) {
    const item = inCart[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Item preview */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#0f1f2e", borderRadius: 14, padding: "12px 14px", border: "1px solid #3b82f6" }}>
          {(item.photos?.[0] || item.photo)
            ? <img src={item.photos?.[0] || item.photo} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
            : <div style={{ width: 52, height: 52, borderRadius: 10, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📦</div>}
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{item.name}</div>
            {item.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{item.brand}</div>}
            <div style={{ fontSize: 12, color: "#10b981" }}>✓ Ya en el carrito ({item.qty} unidades)</div>
          </div>
        </div>
        <div style={{ background: "#1a2e1a", borderRadius: 12, padding: "10px 14px", color: "#a7f3d0", fontSize: 13 }}>
          ➕ Se sumará 1 unidad más. Total: {item.qty + 1} unidades
        </div>
        <div><label style={labelStyle}>Precio unitario</label>
          <NumInput value={price} onChange={setPrice} autoFocus />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>Total: {formatCurrency((item.qty + 1) * price, sym)}</div>
        <button style={btnPrimary} onClick={() => onIncrementCart(item.id, price)}>
          Agregar unidad · {formatCurrency(price, sym)}
        </button>
      </div>
    );
  }

  // Case 2: in pending list — confirm and add to cart
  if (inPending.length > 0) {
    const bi = inPending[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#1c1800", borderRadius: 14, padding: "12px 14px", border: "1px solid #78350f" }}>
          {bi.photo
            ? <img src={bi.photo} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
            : <div style={{ width: 52, height: 52, borderRadius: 10, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📦</div>}
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{bi.name}</div>
            {bi.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{bi.brand}</div>}
            <div style={{ fontSize: 12, color: "#f59e0b" }}>📋 Está en tu lista pendiente</div>
          </div>
        </div>
        <div><label style={labelStyle}>Precio unitario</label>
          <NumInput value={price} onChange={setPrice} autoFocus />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>Total: {formatCurrency((bi.qty || 1) * price, sym)}</div>
        <button style={btnPrimary} onClick={() => onAddToCart({ name: bi.name, photo: bi.photo, qty: bi.qty || 1, price, brand: bi.brand || "", barcode, baseItemId: bi.id })}>
          Agregar al carrito · {formatCurrency(price, sym)}
        </button>
      </div>
    );
  }

  // Case 3: in catalog but not in list
  if (inCatalog.length > 0) {
    const prod = inCatalog[0];
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", background: "#0a1f2e", borderRadius: 14, padding: "12px 14px", border: "1px solid #3b82f6" }}>
          {prod.photos?.[0]
            ? <img src={prod.photos[0]} alt="" style={{ width: 52, height: 52, borderRadius: 10, objectFit: "cover" }} />
            : <div style={{ width: 52, height: 52, borderRadius: 10, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>📦</div>}
          <div>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>{prod.name}</div>
            {prod.brand && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{prod.brand}</div>}
            <div style={{ fontSize: 12, color: "#3b82f6" }}>📦 Encontrado en catálogo</div>
          </div>
        </div>
        <div><label style={labelStyle}>Precio unitario</label>
          <NumInput value={price} onChange={setPrice} autoFocus />
        </div>
        <div style={{ fontSize: 12, color: "#6b7280", textAlign: "center" }}>Total: {formatCurrency(price, sym)}</div>
        <button style={btnPrimary} onClick={() => onAddToCart({ name: prod.name, photo: prod.photos?.[0] || null, photos: prod.photos || [], qty: 1, price, brand: prod.brand || "", barcode })}>
          Agregar al carrito
        </button>
      </div>
    );
  }

  // Case 4: completely unknown
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ background: "#1a1a2e", borderRadius: 12, padding: "10px 14px", border: "1px solid #4b5563" }}>
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 2 }}>Código escaneado</div>
        <div style={{ fontWeight: 700, color: "#fff", fontSize: 16, letterSpacing: 2 }}>{barcode}</div>
        <div style={{ fontSize: 12, color: "#f59e0b", marginTop: 4 }}>⚠️ Producto no encontrado. Completa los datos:</div>
      </div>
      <div><label style={labelStyle}>Nombre del producto</label>
        <input style={inputStyle} value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Leche entera 1L" autoFocus />
      </div>
      <div><label style={labelStyle}>Marca</label>
        <input style={inputStyle} value={newBrand} onChange={e => setNewBrand(e.target.value)} placeholder="Ej: Dos Pinos" />
      </div>
      <div><label style={labelStyle}>Precio unitario</label>
        <NumInput value={price} onChange={setPrice} />
      </div>
      <div>
        <label style={labelStyle}>Foto (opcional)</label>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {photo && <img src={photo} alt="" style={{ width: 56, height: 56, borderRadius: 10, objectFit: "cover" }} />}
          <button onClick={() => fileRef.current.click()} style={{ ...btnSecondary, padding: "10px 14px" }}>📷 {photo ? "Cambiar" : "Tomar foto"}</button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }}
          onChange={async e => { if (e.target.files[0]) setPhoto(await toBase64(e.target.files[0])); }} />
      </div>
      {newName && (
        <button style={btnPrimary} onClick={() => onAddToCart({ name: newName, brand: newBrand, qty: 1, price, barcode, photo, photos: photo ? [photo] : [], pendingBaseAdd: true })}>
          Agregar al carrito ⭐
        </button>
      )}
    </div>
  );
}

// ─── Active Session ───────────────────────────────────────────────────────────
function ActiveSession({ session, baseItems, baseLists, currency, onComplete, onBack }) {
  const [items, setItems] = useState(session.items || []);
  const [excludedBaseIds, setExcludedBaseIds] = useState(new Set(session.excludedBaseIds || []));
  const [showAdd, setShowAdd] = useState(false);
  const [confirmItem, setConfirmItem] = useState(null);
  const [editCartItem, setEditCartItem] = useState(null);
  const [toastMsg, setToastMsg] = useState(null);
  const [showScanner, setShowScanner] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState(null);
  const [allProducts, setAllProducts] = useState([]);
  const [photoViewer, setPhotoViewer] = useState(null); // { photos, index }
  const sym = currency?.symbol || "$";

  useEffect(() => { dbGetAll("products").then(setAllProducts); }, []);

  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(null), 3000);
    return () => clearTimeout(t);
  }, [toastMsg]);

  const total = items.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
  const overBudget = session.budget > 0 && total > session.budget;

  // Base list items not yet bought (respecting excluded + already in cart)
  const listItems = session.listId ? baseItems.filter(bi => bi.listId === session.listId) : [];
  const boughtIds = new Set(items.filter(i => i.baseItemId).map(i => i.baseItemId));
  const pending = listItems.filter(bi => !boughtIds.has(bi.id) && !excludedBaseIds.has(bi.id));

  async function addItem(item) {
    const finalItem = {
      ...item,
      id: Date.now(),
      pendingBaseAdd: !item.baseItemId && !!session.listId,
    };
    const updated = [...items, finalItem];
    setItems(updated);
    const t = updated.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    await dbPut("sessions", { ...session, items: updated, total: t, excludedBaseIds: [...excludedBaseIds] });
  }

  async function updateCartItem(id, changes) {
    const updated = items.map(i => i.id === id ? { ...i, ...changes } : i);
    setItems(updated);
    const t = updated.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    await dbPut("sessions", { ...session, items: updated, total: t, excludedBaseIds: [...excludedBaseIds] });
  }

  async function removeItem(id) {
    const updated = items.filter(i => i.id !== id);
    setItems(updated);
    const t = updated.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    await dbPut("sessions", { ...session, items: updated, total: t, excludedBaseIds: [...excludedBaseIds] });
  }

  async function removeFromPending(baseItemId) {
    const newExcluded = new Set([...excludedBaseIds, baseItemId]);
    setExcludedBaseIds(newExcluded);
    await dbPut("sessions", { ...session, items, excludedBaseIds: [...newExcluded] });
  }

  async function incrementCartItem(id, newPrice) {
    const updated = items.map(i => i.id === id ? { ...i, qty: (i.qty || 1) + 1, price: newPrice || i.price } : i);
    setItems(updated);
    const t = updated.reduce((s, i) => s + (i.qty || 1) * (i.price || 0), 0);
    await dbPut("sessions", { ...session, items: updated, total: t, excludedBaseIds: [...excludedBaseIds] });
    setToastMsg(`✅ +1 unidad agregada al carrito`);
  }

  function handleBarcodeScan(barcode) {
    setShowScanner(false);
    setScannedBarcode(barcode);
  }

  async function finishShopping() {
    const now = Date.now();
    const finalSession = { ...session, items, total, completed: true, completedAt: now };
    const newlyAdded = [];

    // Load current products to upsert
    const allProducts = await dbGetAll("products");

    for (const cartItem of items) {
      if (cartItem.pendingBaseAdd && session.listId) {
        // New manual item → save to base list
        const newBaseItem = {
          id: now + Math.random(),
          listId: session.listId,
          name: cartItem.name,
          brand: cartItem.brand || "",
          qty: cartItem.qty || 1,
          price: cartItem.price || 0,
          photo: cartItem.photos?.[0] || cartItem.photo || null,
          barcode: cartItem.barcode || "",
          lastPurchase: { date: now, store: session.storeName },
          autoAdded: true,
        };
        await dbPut("baseItems", newBaseItem);
        newlyAdded.push(cartItem.name);
      } else if (cartItem.baseItemId) {
        // Existing base item → update
        const bi = baseItems.find(b => b.id === cartItem.baseItemId);
        if (bi) {
          await dbPut("baseItems", {
            ...bi,
            qty: cartItem.qty,
            price: cartItem.price,
            brand: cartItem.brand || bi.brand,
            photo: cartItem.photos?.[0] || cartItem.photo || bi.photo,
            barcode: cartItem.barcode || bi.barcode,
            lastPurchase: { date: now, store: session.storeName },
          });
        }
      }

      // ── Sync general products catalog ──────────────────────────────────────
      // Find by name (case-insensitive)
      const existing = allProducts.find(p => p.name?.toLowerCase() === cartItem.name?.toLowerCase());
      const purchaseRecord = {
        date: now,
        store: session.storeName,
        price: cartItem.price || 0,
        qty: cartItem.qty || 1,
        brand: cartItem.brand || "",
        barcode: cartItem.barcode || "",
        monthKey: getMonthKey(),
      };

      if (existing) {
        // Merge photos: append new ones, keep existing, cap at 4 (drop oldest first)
        const existingPhotos = existing.photos || [];
        const newPhotos = (cartItem.photos || []).filter(p => p && !existingPhotos.includes(p));
        const mergedPhotos = [...existingPhotos, ...newPhotos].slice(-4); // keep newest 4

        const history = [...(existing.purchaseHistory || []), purchaseRecord];
        await dbPut("products", {
          ...existing,
          brand: cartItem.brand || existing.brand,
          lastStore: session.storeName,
          lastPrice: cartItem.price || 0,
          lastQty: cartItem.qty || 1,
          lastPurchaseDate: now,
          barcode: cartItem.barcode || existing.barcode,
          photos: mergedPhotos,
          purchaseHistory: history,
        });
      } else {
        // Create new product in catalog
        await dbPut("products", {
          id: now + Math.random(),
          name: cartItem.name,
          category: "",
          brand: cartItem.brand || "",
          lastStore: session.storeName,
          lastPrice: cartItem.price || 0,
          lastQty: cartItem.qty || 1,
          lastPurchaseDate: now,
          barcode: cartItem.barcode || "",
          photos: cartItem.photos || [],
          purchaseHistory: [purchaseRecord],
        });
        newlyAdded.push(cartItem.name);
      }
    }

    if (newlyAdded.length > 0) {
      setToastMsg(`⭐ ${newlyAdded.length} producto(s) nuevo(s) registrado(s)`);
    }

    await onComplete(finalSession);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "#0f0f1e" }}>
      {/* Toast */}
      {toastMsg && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 3000, background: "#064e3b", border: "1px solid #10b981", borderRadius: 14, padding: "11px 18px", color: "#a7f3d0", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}>
          {toastMsg}
        </div>
      )}
      {/* Header */}
      <div style={{ background: "#1a1a2e", padding: "14px 16px", borderBottom: "1px solid #2a2a4a" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={onBack} style={{ background: "#2a2a4a", border: "none", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#c4b5fd" }}><Icon name="back" size={18} /></button>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#fff", fontSize: 15 }}>🛒 {session.storeName}</div>
            <div style={{ fontSize: 12, color: "#8b5cf6" }}>{new Date(session.createdAt).toLocaleDateString("es")}</div>
          </div>
          {/* Barcode scanner button */}
          <button onClick={() => setShowScanner(true)}
            style={{ background: "#2a2a4a", border: "1px solid #6366f1", borderRadius: 10, padding: "8px 10px", cursor: "pointer", color: "#818cf8", display: "flex", alignItems: "center", gap: 5 }}>
            <Icon name="barcode" size={18} />
          </button>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 800, fontSize: 20, color: overBudget ? "#ef4444" : "#10b981" }}>{formatCurrency(total, sym)}</div>
            {session.budget > 0 && <div style={{ fontSize: 10, color: overBudget ? "#ef4444" : "#6b7280" }}>Presup: {formatCurrency(session.budget, sym)}</div>}
          </div>
        </div>
        {overBudget && <div style={{ marginTop: 8, background: "#450a0a", borderRadius: 8, padding: "6px 10px", color: "#fca5a5", fontSize: 12 }}>⚠️ Excede el presupuesto en {formatCurrency(total - session.budget, sym)}</div>}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
        {/* In cart */}
        {items.length > 0 && (
          <div>
            <div style={{ padding: "8px 16px 4px", color: "#10b981", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>✓ En el carrito ({items.length})</div>
            {items.map(item => {
              // Merge item photos with catalog photos for complete gallery
              const catalogProduct = allProducts.find(p =>
                (item.barcode && p.barcode === item.barcode) ||
                p.name?.toLowerCase() === item.name?.toLowerCase()
              );
              const itemPhotos = [
                ...(item.photos || []),
                ...(item.photo && !item.photos?.includes(item.photo) ? [item.photo] : []),
                ...(catalogProduct?.photos || []),
              ].filter((p, i, arr) => p && arr.indexOf(p) === i); // unique, non-null

              return (
              <div key={item.id} style={{ margin: "0 16px 6px", background: "#0f1f1a", borderRadius: 12, padding: "10px 12px", border: "1px solid #064e3b", display: "flex", gap: 10, alignItems: "center" }}>
                {itemPhotos.length > 0
                  ? (
                    <div style={{ position: "relative", flexShrink: 0, cursor: "pointer" }} onClick={() => setPhotoViewer({ photos: itemPhotos, index: 0 })}>
                      <img src={itemPhotos[0]} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", display: "block" }} />
                      {itemPhotos.length > 1 && (
                        <div style={{ position: "absolute", bottom: -2, right: -2, background: "#6366f1", borderRadius: 6, padding: "1px 4px", fontSize: 9, color: "#fff", fontWeight: 700 }}>
                          +{itemPhotos.length - 1}
                        </div>
                      )}
                    </div>
                  )
                  : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#064e3b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✓</div>}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: "#a7f3d0", fontSize: 14, textDecoration: "line-through" }}>{item.name}</div>
                  {item.pendingBaseAdd && (
                    <div style={{ fontSize: 10, color: "#fbbf24", fontWeight: 700, marginBottom: 2 }}>⭐ Se guardará en lista base al finalizar</div>
                  )}
                  <div style={{ fontSize: 12, color: "#6b7280" }}>{item.qty} × {formatCurrency(item.price, sym)} = {formatCurrency(item.qty * item.price, sym)}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => setEditCartItem(item)} style={{ background: "#064e3b", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#6ee7b7" }}><Icon name="edit" size={13} /></button>
                  <button onClick={() => removeItem(item.id)} style={{ background: "#2a0a0a", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#f87171" }}><Icon name="x" size={13} /></button>
                </div>
              </div>
            ); })}
          </div>
        )}

        {/* Pending base items */}
        {pending.length > 0 && (
          <div>
            <div style={{ padding: "8px 16px 4px", color: "#f59e0b", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>📋 Pendientes ({pending.length})</div>
            {pending.map(bi => (
              <div key={bi.id} style={{ margin: "0 16px 6px", background: "#1a1a2e", borderRadius: 12, border: "1px solid #2a2a4a", display: "flex", overflow: "hidden" }}>
                <div style={{ flex: 1, display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", cursor: "pointer" }}
                  onClick={() => setConfirmItem({ name: bi.name, photo: bi.photo, qty: bi.qty || 1, price: bi.price || 0, brand: bi.brand || "", barcode: bi.barcode || "", baseItemId: bi.id })}>
                  {bi.photo
                    ? <img src={bi.photo} alt="" onClick={e => { e.stopPropagation(); setPhotoViewer({ photos: [bi.photo], index: 0 }); }} style={{ width: 40, height: 40, borderRadius: 8, objectFit: "cover", flexShrink: 0, cursor: "pointer" }} />
                    : <div style={{ width: 40, height: 40, borderRadius: 8, background: "#2a2a4a", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>📦</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: "#fff", fontSize: 14 }}>{bi.name}</div>
                    {bi.brand && <div style={{ fontSize: 11, color: "#8b5cf6" }}>{bi.brand}</div>}
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Últ: {bi.qty} × {formatCurrency(bi.price, sym)}</div>
                  </div>
                  <div style={{ color: "#6366f1", flexShrink: 0 }}><Icon name="check" size={18} /></div>
                </div>
                {/* Remove button */}
                <button
                  onClick={() => removeFromPending(bi.id)}
                  style={{ background: "#2a0a0a", border: "none", borderLeft: "1px solid #2a2a4a", padding: "0 14px", cursor: "pointer", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  title="Quitar de esta compra">
                  <Icon name="x" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div style={{ padding: "8px 16px" }}>
          <button onClick={() => setShowAdd(true)} style={{ ...btnSecondary, width: "100%", padding: "12px", textAlign: "center" }}>+ Agregar producto manual</button>
        </div>
      </div>

      {/* Finish */}
      <div style={{ padding: "12px 16px 30px", background: "#1a1a2e", borderTop: "1px solid #2a2a4a" }}>
        <button style={btnPrimary} onClick={finishShopping}>
          Finalizar compra · {formatCurrency(total, sym)}
        </button>
      </div>

      {/* Confirm item modal */}
      {confirmItem && (
        <Modal title="Confirmar producto" onClose={() => setConfirmItem(null)}>
          <ConfirmItemForm initial={confirmItem} currency={currency}
            onConfirm={(data) => { addItem(data); setConfirmItem(null); }}
            onClose={() => setConfirmItem(null)} />
        </Modal>
      )}
      {showAdd && (
        <Modal title="Agregar producto" onClose={() => setShowAdd(false)}>
          <ConfirmItemForm initial={{ name: "", qty: 1, price: 0, brand: "", barcode: "", photos: [] }} currency={currency}
            onConfirm={(data) => { addItem(data); setShowAdd(false); }}
            onClose={() => setShowAdd(false)} />
        </Modal>
      )}
      {editCartItem && (
        <Modal title="Editar producto" onClose={() => setEditCartItem(null)}>
          <ConfirmItemForm initial={editCartItem} currency={currency}
            onConfirm={(data) => { updateCartItem(editCartItem.id, data); setEditCartItem(null); }}
            onClose={() => setEditCartItem(null)} />
        </Modal>
      )}

      {/* Photo Viewer */}
      {photoViewer && (
        <PhotoViewer photos={photoViewer.photos} startIndex={photoViewer.index} onClose={() => setPhotoViewer(null)} />
      )}

      {/* Barcode scanner full-screen */}
      {showScanner && (
        <BarcodeScanner
          onDetected={handleBarcodeScan}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Barcode result modal */}
      {scannedBarcode && (
        <Modal title={`Código: ${scannedBarcode}`} onClose={() => setScannedBarcode(null)}>
          <BarcodeResult
            barcode={scannedBarcode}
            cartItems={items}
            pendingItems={pending}
            allProducts={allProducts}
            currency={currency}
            sym={sym}
            onAddToCart={(data) => {
              addItem(data);
              setScannedBarcode(null);
              setToastMsg(`✅ "${data.name}" agregado al carrito`);
            }}
            onIncrementCart={(id, price) => {
              incrementCartItem(id, price);
              setScannedBarcode(null);
            }}
            onClose={() => setScannedBarcode(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function ConfirmItemForm({ initial, currency, onConfirm, onClose }) {
  const [form, setForm] = useState({ ...initial });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const sym = currency?.symbol || "$";
  const total = (form.qty || 1) * (form.price || 0);
  const [showBarcodeScanner, setShowBarcodeScanner] = useState(false);

  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {form.photo && <img src={form.photo} alt="" style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 14 }} />}
        <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={form.name} onChange={e => set("name", e.target.value)} /></div>
        <div><label style={labelStyle}>Marca</label><input style={inputStyle} value={form.brand || ""} onChange={e => set("brand", e.target.value)} /></div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div><label style={labelStyle}>Cantidad</label><NumInput value={form.qty} onChange={v => set("qty", v)} step="1" min={1} placeholder="1" /></div>
          <div><label style={labelStyle}>Precio unit.</label><NumInput value={form.price} onChange={v => set("price", v)} /></div>
        </div>

        {/* Barcode with scanner button */}
        <div>
          <label style={labelStyle}>Código de barras</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={form.barcode || ""}
              onChange={e => set("barcode", e.target.value)}
              placeholder="Escanear o escribir"
              inputMode="numeric"
            />
            <button
              onClick={() => setShowBarcodeScanner(true)}
              style={{ background: "#2a2a4a", border: "1px solid #6366f1", borderRadius: 12, padding: "0 14px", cursor: "pointer", color: "#818cf8", display: "flex", alignItems: "center", flexShrink: 0 }}>
              <Icon name="barcode" size={18} />
            </button>
          </div>
          {form.barcode ? <div style={{ marginTop: 4, fontSize: 11, color: "#10b981" }}>✓ {form.barcode}</div> : null}
        </div>

        <div style={{ background: "#2a2a4a", borderRadius: 12, padding: "12px 14px", display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: "#9ca3af" }}>Total</span>
          <span style={{ fontWeight: 800, color: "#10b981", fontSize: 18 }}>{formatCurrency(total, sym)}</span>
        </div>
        <div><label style={labelStyle}>Fotos (máx. 4)</label><PhotoPicker photos={form.photos || []} onChange={v => set("photos", v)} max={4} /></div>
        <button style={btnPrimary} onClick={() => form.name && onConfirm(form)}>Confirmar</button>
      </div>

      {showBarcodeScanner && (
        <BarcodeScanner
          onDetected={(code) => {
            set("barcode", code);
            setShowBarcodeScanner(false);
          }}
          onClose={() => setShowBarcodeScanner(false)}
        />
      )}
    </>
  );
}

// ─── Stores Management ────────────────────────────────────────────────────────
function StoresManagement({ shoppingTypes }) {
  const [stores, setStores] = useState([]);
  const [form, setForm] = useState({ name: "", typeId: shoppingTypes[0]?.id || "" });
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => setStores(await dbGetAll("stores")), []);
  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!form.name) return;
    await dbPut("stores", { ...form, id: Date.now(), typeId: Number(form.typeId) });
    setForm({ name: "", typeId: shoppingTypes[0]?.id || "" });
    setShowForm(false);
    await load();
  }

  return (
    <div>
      <div style={{ padding: "16px 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0, color: "#fff" }}>Tiendas / Supermercados</h4>
        <button onClick={() => setShowForm(true)} style={{ ...btnSecondary, padding: "8px 12px" }}>+ Nueva</button>
      </div>
      {stores.map(s => {
        const type = shoppingTypes.find(t => t.id === s.typeId);
        return (
          <div key={s.id} style={{ margin: "0 16px 8px", background: "#1a1a2e", borderRadius: 12, padding: "12px 14px", border: "1px solid #2a2a4a", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ color: "#fff", fontWeight: 600 }}>{s.name}</div>
              {type && <div style={{ fontSize: 12, color: "#8b5cf6" }}>{type.icon} {type.name}</div>}
            </div>
            <button onClick={async () => { await dbDelete("stores", s.id); await load(); }} style={{ background: "#2a0a0a", border: "none", borderRadius: 8, padding: 7, cursor: "pointer", color: "#f87171" }}><Icon name="trash" size={14} /></button>
          </div>
        );
      })}
      {showForm && (
        <Modal title="Nueva Tienda" onClose={() => setShowForm(false)}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div><label style={labelStyle}>Nombre</label><input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div><label style={labelStyle}>Tipo</label>
              <select style={inputStyle} value={form.typeId} onChange={e => setForm(f => ({ ...f, typeId: e.target.value }))}>
                {shoppingTypes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
              </select>
            </div>
            <button style={btnPrimary} onClick={save}>Guardar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function Settings({ currency, setCurrency, budget, setBudget, shoppingTypes, setShoppingTypes, onImport }) {
  const [currencies] = useState([
    { value: "USD", symbol: "$", name: "Dólar (USD)" },
    { value: "CRC", symbol: "₡", name: "Colón CR (CRC)" },
    { value: "EUR", symbol: "€", name: "Euro (EUR)" },
    { value: "MXN", symbol: "$", name: "Peso MX (MXN)" },
    { value: "COP", symbol: "$", name: "Peso CO (COP)" },
    { value: "GTQ", symbol: "Q", name: "Quetzal (GTQ)" },
    { value: "HNL", symbol: "L", name: "Lempira (HNL)" },
    { value: "NIO", symbol: "C$", name: "Córdoba (NIO)" },
    { value: "PAB", symbol: "B/", name: "Balboa (PAB)" },
  ]);
  const [newType, setNewType] = useState({ name: "", icon: "🛍️", color: "#6366f1" });
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [exportHistory, setExportHistory] = useState([]);
  const [lastExport, setLastExport] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [toast, setToast] = useState(null);

  function showToast(msg, ok = true) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  useEffect(() => {
    dbGetAll("exportHistory").then(h => {
      const sorted = h.sort((a, b) => b.date - a.date);
      setExportHistory(sorted.slice(0, 10));
      setLastExport(sorted[0] || null);
    });
  }, []);

  async function saveCurrency(curr) {
    await dbPut("settings", { key: "currency", ...curr });
    setCurrency(curr);
  }
  async function saveBudget(val) {
    const v = Number(val);
    await dbPut("settings", { key: "monthlyBudget", value: v });
    setBudget(v);
  }
  async function addType() {
    if (!newType.name) return;
    const t = { ...newType, id: Date.now() };
    await dbPut("shoppingTypes", t);
    setShoppingTypes(prev => [...prev, t]);
    setNewType({ name: "", icon: "🛍️", color: "#6366f1" });
    setShowTypeForm(false);
  }
  async function delType(id) {
    await dbDelete("shoppingTypes", id);
    setShoppingTypes(prev => prev.filter(t => t.id !== id));
  }

  async function exportData() {
    const data = {
      exported: new Date().toISOString(),
      settings: { currency, budget },
      categories: await dbGetAll("categories"),
      products: await dbGetAll("products"),
      stores: await dbGetAll("stores"),
      shoppingTypes: await dbGetAll("shoppingTypes"),
      baseLists: await dbGetAll("baseLists"),
      baseItems: await dbGetAll("baseItems"),
      sessions: await dbGetAll("sessions"),
      purchases: await dbGetAll("purchases"),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopmaster-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    const record = { id: Date.now(), date: Date.now(), type: "export", filename: a.download };
    await dbPut("exportHistory", record);
    const h = await dbGetAll("exportHistory");
    const sorted = h.sort((a, b) => b.date - a.date);
    setExportHistory(sorted.slice(0, 10));
    setLastExport(sorted[0]);
  }

  async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const data = JSON.parse(text);

      // Import all data stores using dbPutRaw to handle autoIncrement IDs from backup
      const storeNames = ["categories", "products", "stores", "shoppingTypes", "baseLists", "baseItems", "sessions", "purchases"];
      let totalImported = 0;

      for (const storeName of storeNames) {
        const records = data[storeName];
        if (!Array.isArray(records)) continue;
        for (const item of records) {
          if (item && (item.id !== undefined || item.key !== undefined)) {
            await dbPutRaw(storeName, item);
            totalImported++;
          }
        }
      }

      // Restore settings
      if (data.settings?.currency) {
        await dbPutRaw("settings", { key: "currency", value: data.settings.currency.value, symbol: data.settings.currency.symbol });
      }
      if (data.settings?.budget !== undefined) {
        await dbPutRaw("settings", { key: "monthlyBudget", value: Number(data.settings.budget) });
      }

      // Log import record
      const record = { id: Date.now(), date: Date.now(), type: "import", filename: file.name };
      await dbPutRaw("exportHistory", record);

      // Refresh export history display
      const h = await dbGetAll("exportHistory");
      const sorted = h.sort((a, b) => b.date - a.date);
      setExportHistory(sorted.slice(0, 10));
      setLastExport(sorted[0] || null);

      // Reload ALL app state without page refresh
      await onImport();

      showToast(`✅ ${totalImported} registros importados correctamente`);
    } catch (err) {
      console.error("Import error:", err);
      showToast("❌ Error al importar. Verifique que el archivo sea un backup válido de ShopMaster.", false);
    }
    e.target.value = "";
  }

  async function clearAll() {
    const stores2 = ["products", "stores", "baseLists", "baseItems", "sessions", "purchases"];
    for (const s of stores2) await dbClear(s);
    showToast("🗑️ Datos limpiados. Recargue la página.");
    setShowClearConfirm(false);
  }

  const daysSinceExport = lastExport ? Math.floor((Date.now() - lastExport.date) / 86400000) : 999;

  return (
    <div style={{ padding: "0 0 100px" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 3000, background: toast.ok ? "#064e3b" : "#450a0a", border: `1px solid ${toast.ok ? "#10b981" : "#ef4444"}`, borderRadius: 14, padding: "12px 20px", color: "#fff", fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
          {toast.msg}
        </div>
      )}
      <div style={{ padding: "16px 16px 8px" }}>
        <h3 style={{ margin: "0 0 16px", color: "#fff", fontSize: 18 }}>⚙️ Configuración</h3>

        {/* Currency */}
        <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 16, border: "1px solid #2a2a4a", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Icon name="money" size={16} /> Moneda</div>
          <select style={inputStyle} value={currency?.value || "USD"} onChange={e => { const c = currencies.find(x => x.value === e.target.value); saveCurrency({ value: c.value, symbol: c.symbol }); }}>
            {currencies.map(c => <option key={c.value} value={c.value}>{c.name}</option>)}
          </select>
        </div>

        {/* Budget */}
        <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 16, border: "1px solid #2a2a4a", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}><Icon name="money" size={16} /> Presupuesto mensual</div>
          <NumInput value={budget} onChange={saveBudget} placeholder="0.00" />
        </div>

        {/* Shopping types */}
        <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 16, border: "1px solid #2a2a4a", marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontWeight: 700, color: "#fff" }}>🏷️ Tipos de compra</div>
            <button onClick={() => setShowTypeForm(true)} style={{ ...btnSecondary, padding: "6px 12px", fontSize: 12 }}>+ Nuevo</button>
          </div>
          {shoppingTypes.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, background: "#0f0f1e", borderRadius: 10, padding: "8px 10px" }}>
              <span style={{ fontSize: 18 }}>{t.icon}</span>
              <div style={{ width: 12, height: 12, borderRadius: "50%", background: t.color, flexShrink: 0 }} />
              <span style={{ flex: 1, color: "#fff", fontSize: 14 }}>{t.name}</span>
              {!t.isGrocery && <button onClick={() => delType(t.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 4 }}><Icon name="trash" size={14} /></button>}
            </div>
          ))}
          {showTypeForm && (
            <div style={{ marginTop: 10, padding: 10, background: "#0f0f1e", borderRadius: 12 }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input placeholder="Emoji" style={{ ...inputStyle, width: 56 }} value={newType.icon} onChange={e => setNewType(f => ({ ...f, icon: e.target.value }))} />
                <input placeholder="Nombre" style={{ ...inputStyle, flex: 1 }} value={newType.name} onChange={e => setNewType(f => ({ ...f, name: e.target.value }))} />
                <input type="color" style={{ width: 44, height: 44, background: "none", border: "none", cursor: "pointer" }} value={newType.color} onChange={e => setNewType(f => ({ ...f, color: e.target.value }))} />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ ...btnPrimary, flex: 1 }} onClick={addType}>Agregar</button>
                <button style={{ ...btnSecondary }} onClick={() => setShowTypeForm(false)}>Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* Export/Import */}
        <div style={{ background: "#1a1a2e", borderRadius: 16, padding: 16, border: "1px solid #2a2a4a", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#fff", marginBottom: 12 }}>💾 Respaldo de datos</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <button style={{ ...btnSecondary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={exportData}>
              <Icon name="download" size={16} /> Exportar
            </button>
            <label style={{ ...btnSecondary, flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
              <Icon name="upload" size={16} /> Importar
              <input type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
            </label>
          </div>
          {lastExport && <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>Último respaldo: hace {daysSinceExport} días</div>}
          {exportHistory.length > 0 && (
            <div>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>Historial (últimos 10)</div>
              {exportHistory.map(h => (
                <div key={h.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #2a2a4a" }}>
                  <span style={{ fontSize: 14 }}>{h.type === "export" ? "📤" : "📥"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: "#fff" }}>{h.filename}</div>
                    <div style={{ fontSize: 10, color: "#6b7280" }}>{new Date(h.date).toLocaleString("es")}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Clear data */}
        <div style={{ background: "#1a0a0a", borderRadius: 16, padding: 16, border: "1px solid #3b0f0f", marginBottom: 12 }}>
          <div style={{ fontWeight: 700, color: "#fca5a5", marginBottom: 8 }}>🗑️ Limpiar datos</div>
          {daysSinceExport > 30 && <div style={{ background: "#450a0a", borderRadius: 8, padding: "8px 10px", color: "#fca5a5", fontSize: 12, marginBottom: 10 }}>⚠️ No has hecho un respaldo en más de 30 días. Exporta antes de limpiar.</div>}
          <button style={{ background: "#7f1d1d", border: "none", borderRadius: 12, padding: "12px", color: "#fca5a5", width: "100%", cursor: "pointer", fontWeight: 700 }}
            onClick={() => setShowClearConfirm(true)}>Limpiar historial y compras</button>
        </div>
      </div>

      {showClearConfirm && (
        <Modal title="⚠️ Confirmar limpieza" onClose={() => setShowClearConfirm(false)}>
          <div>
            <p style={{ color: "#fca5a5", marginTop: 0 }}>Esto eliminará todos los productos, tiendas, listas y compras permanentemente. Esta acción no se puede deshacer.</p>
            {daysSinceExport > 30 && <div style={{ background: "#450a0a", borderRadius: 8, padding: "10px", color: "#fca5a5", fontSize: 13, marginBottom: 12 }}>⚠️ Tu último respaldo fue hace {daysSinceExport} días. Exporta primero.</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button style={{ ...btnSecondary, flex: 1 }} onClick={() => setShowClearConfirm(false)}>Cancelar</button>
              <button style={{ background: "#7f1d1d", border: "none", borderRadius: 14, padding: "14px", color: "#fff", flex: 1, fontWeight: 700, cursor: "pointer" }} onClick={clearAll}>Sí, limpiar todo</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [currency, setCurrency] = useState({ value: "USD", symbol: "$" });
  const [budget, setBudget] = useState(0);
  const [categories, setCategories] = useState([]);
  const [shoppingTypes, setShoppingTypes] = useState([]);
  const [baseLists, setBaseLists] = useState([]);
  const [baseItems, setBaseItems] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [products, setProducts] = useState([]);

  const loadAll = useCallback(async () => {
    await seedData();
    const curr = await dbGet("settings", "currency");
    const budg = await dbGet("settings", "monthlyBudget");
    if (curr) setCurrency(curr);
    if (budg) setBudget(budg.value);
    setCategories(await dbGetAll("categories"));
    setShoppingTypes(await dbGetAll("shoppingTypes"));
    setBaseLists(await dbGetAll("baseLists"));
    setBaseItems(await dbGetAll("baseItems"));
    setSessions(await dbGetAll("sessions"));
    setProducts(await dbGetAll("products"));
    setReady(true);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Reload sessions when tab changes
  useEffect(() => {
    if (tab === "dashboard" || tab === "sessions") {
      dbGetAll("sessions").then(setSessions);
      dbGetAll("baseLists").then(setBaseLists);
      dbGetAll("baseItems").then(setBaseItems);
    }
    if (tab === "products" || tab === "lists") {
      dbGetAll("products").then(setProducts);
    }
    if (tab === "products") {
      dbGetAll("sessions").then(setSessions);
    }
  }, [tab]);

  if (!ready) return (
    <div style={{ background: "#0f0f1e", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🛒</div>
        <div style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 16 }}>Cargando ShopMaster…</div>
      </div>
    </div>
  );

  const tabs = [
    { id: "dashboard", icon: "chart", label: "Dashboard" },
    { id: "sessions", icon: "cart", label: "Compras" },
    { id: "lists", icon: "list", label: "Listas" },
    { id: "products", icon: "package", label: "Productos" },
    { id: "settings", icon: "settings", label: "Ajustes" },
  ];

  return (
    <div style={{ background: "#0f0f1e", minHeight: "100vh", maxWidth: 480, margin: "0 auto", position: "relative", fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1a1a2e", padding: "14px 20px 10px", borderBottom: "1px solid #2a2a4a", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 24 }}>🛒</span>
          <div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: 18, letterSpacing: -0.5 }}>ShopMaster</div>
            <div style={{ fontSize: 11, color: "#6366f1" }}>Control de compras</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ paddingBottom: 80 }}>
        {tab === "dashboard" && <Dashboard sessions={sessions} budget={budget} currency={currency} />}
        {tab === "sessions" && <ShoppingSessions shoppingTypes={shoppingTypes} baseLists={baseLists} baseItems={baseItems} currency={currency} />}
        {tab === "lists" && (
          <div>
            <StoresManagement shoppingTypes={shoppingTypes} />
            <div style={{ height: 1, background: "#2a2a4a", margin: "8px 16px" }} />
            <BaseLists shoppingTypes={shoppingTypes} currency={currency} products={products} />
          </div>
        )}
        {tab === "products" && <ProductsCatalog categories={categories} sessions={sessions} products={products} setProducts={setProducts} />}
        {tab === "settings" && <Settings currency={currency} setCurrency={setCurrency} budget={budget} setBudget={setBudget} shoppingTypes={shoppingTypes} setShoppingTypes={setShoppingTypes} onImport={loadAll} />}
      </div>

      {/* Bottom nav */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#1a1a2e", borderTop: "1px solid #2a2a4a", display: "flex", zIndex: 200 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ flex: 1, background: "none", border: "none", padding: "10px 4px 14px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: tab === t.id ? "#8b5cf6" : "#6b7280", transition: "color 0.2s" }}>
            <Icon name={t.icon} size={22} />
            <span style={{ fontSize: 10, fontWeight: tab === t.id ? 700 : 400 }}>{t.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
