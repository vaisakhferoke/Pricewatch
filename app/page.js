"use client";
import { useCallback, useEffect, useState } from "react";

const inr = (n) => (n == null ? "-" : "₹" + Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 }));
const when = (s) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
const host = (u) => { try { return new URL(u).hostname.replace("www.", ""); } catch { return u; } };

export const INTERVAL_OPTIONS = [
  { value: 10, label: "Every 10 minutes" },
  { value: 20, label: "Every 20 minutes" },
  { value: 30, label: "Every 30 minutes" },
  { value: 60, label: "Every 1 hour" },
  { value: 120, label: "Every 2 hours" },
  { value: 240, label: "Every 4 hours" },
  { value: 360, label: "Every 6 hours" },
  { value: 600, label: "Every 10 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Every 24 hours" },
];

// Price line with the target price drawn as a dashed amber rule.
function Spark({ history, target }) {
  const W = 600, H = 64, P = 6;
  if (history.length < 2) return <p className="muted spark" style={{ height: "auto" }}>Chart appears after the second price check.</p>;
  const vals = history.map((h) => h.price).concat(target);
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const y = (v) => H - P - ((v - lo) / span) * (H - 2 * P);
  const x = (i) => P + (i / (history.length - 1)) * (W - 2 * P);
  const pts = history.map((h, i) => `${x(i)},${y(h.price)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Price history chart">
      <line x1="0" x2={W} y1={y(target)} y2={y(target)} stroke="var(--target)" strokeDasharray="6 5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <polyline points={pts} fill="none" stroke="var(--drop)" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [chatId, setChatId] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [checkInterval, setCheckInterval] = useState(60);
  const [products, setProducts] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkingId, setCheckingId] = useState(null);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState("login"); // "login" | "register"
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authChatId, setAuthChatId] = useState("");
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);

  // Edit telegram modal
  const [showTgModal, setShowTgModal] = useState(false);
  const [tempChatId, setTempChatId] = useState("");

  const load = useCallback(async (id) => {
    const q = id && /^-?\d{5,20}$/.test(id) ? `?chat_id=${id}` : "";
    try {
      const r = await fetch(`/api/products${q}`);
      if (!r.ok) return setProducts([]);
      const data = await r.json().catch(() => ({}));
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    }
  }, []);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const data = await res.json().catch(() => ({}));
      if (data.user) {
        setUser(data.user);
        if (data.user.chat_id) {
          setChatId(data.user.chat_id);
          try { localStorage.setItem("chatId", data.user.chat_id); } catch {}
          load(data.user.chat_id);
          return;
        }
      }
    } catch {}
    try {
      const saved = localStorage.getItem("chatId") || "";
      if (saved) {
        setChatId(saved);
        load(saved);
      }
    } catch {}
  }, [load]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError("");
    setAuthBusy(true);
    try {
      const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = authMode === "login"
        ? { email: authEmail, password: authPassword }
        : { email: authEmail, password: authPassword, chat_id: authChatId.trim() };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      setAuthBusy(false);
      if (!res.ok) {
        return setAuthError(data.error || "Authentication failed.");
      }
      setUser(data.user);
      if (data.user.chat_id) {
        setChatId(data.user.chat_id);
        try { localStorage.setItem("chatId", data.user.chat_id); } catch {}
      }
      setShowAuthModal(false);
      setAuthPassword("");
      load(data.user.chat_id || chatId);
    } catch (err) {
      setAuthBusy(false);
      setAuthError(err.message || "Authentication request failed.");
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    load(chatId);
  }

  async function saveTelegramId(e) {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: tempChatId.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.user) {
        setUser(data.user);
        setChatId(data.user.chat_id || "");
        try { localStorage.setItem("chatId", data.user.chat_id || ""); } catch {}
        setShowTgModal(false);
        load(data.user.chat_id || "");
      }
    } catch (err) {
      alert(err.message || "Failed to update Telegram ID");
    }
  }

  async function add(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          target_price: target,
          chat_id: chatId.trim(),
          check_interval: checkInterval,
        }),
      });
      const j = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) return setMsg({ kind: "err", text: j.error || "Failed to add product" });
      setMsg(j.warning
        ? { kind: "warn", text: `Added, but the price couldn't be read yet (${j.warning}). We'll retry on the next check.` }
        : { kind: "ok", text: "Added. A confirmation is on its way to Telegram." });
      setUrl(""); setTarget("");
      if (user && !user.chat_id && chatId.trim()) {
        setUser({ ...user, chat_id: chatId.trim() });
      }
      load(chatId.trim());
    } catch (err) {
      setBusy(false);
      setMsg({ kind: "err", text: err.message || "Failed to connect to server" });
    }
  }

  async function changeInterval(id, newInterval) {
    try {
      await fetch(`/api/products/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId.trim(), check_interval: newInterval }),
      });
      load(chatId.trim());
    } catch (e) {
      console.error(e);
    }
  }

  async function checkNow(id) {
    setCheckingId(id);
    try {
      const res = await fetch(`/api/products/${id}?chat_id=${chatId.trim()}`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) alert(data.error || "Failed to check price");
    } catch (err) {
      alert(err.message || "Network error");
    } finally {
      setCheckingId(null);
      load(chatId.trim());
    }
  }

  async function remove(id) {
    try {
      await fetch(`/api/products/${id}?chat_id=${chatId.trim()}`, { method: "DELETE" });
    } catch {}
    load(chatId.trim());
  }

  return (
    <main className="wrap">
      <header>
        <div>
          <h1>Pricewatch</h1>
          <p>Paste an Amazon or Flipkart link, set the price you'd pay, and get automated Telegram alerts when it drops.</p>
        </div>

        <div>
          {user ? (
            <div className="user-card">
              <div>
                <span className="user-email">{user.email}</span>
                {user.chat_id ? (
                  <span className="tg-tag" style={{ marginLeft: "8px" }}>
                    TG: {user.chat_id}
                  </span>
                ) : (
                  <button className="link" style={{ fontSize: "0.82rem", marginLeft: "8px" }} onClick={() => { setTempChatId(""); setShowTgModal(true); }}>
                    + Link Telegram
                  </button>
                )}
              </div>
              <button className="link" style={{ fontSize: "0.82rem" }} onClick={() => { setTempChatId(user.chat_id || ""); setShowTgModal(true); }}>
                Settings
              </button>
              <button className="btn-sm" onClick={handleLogout}>
                Sign out
              </button>
            </div>
          ) : (
            <button className="btn" onClick={() => { setAuthMode("login"); setAuthError(""); setShowAuthModal(true); }}>
              Sign in / Register
            </button>
          )}
        </div>
      </header>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowAuthModal(false)} aria-label="Close">✕</button>
            
            <div className="auth-tabs">
              <button
                className={`auth-tab ${authMode === "login" ? "active" : ""}`}
                onClick={() => { setAuthMode("login"); setAuthError(""); }}
              >
                Sign in
              </button>
              <button
                className={`auth-tab ${authMode === "register" ? "active" : ""}`}
                onClick={() => { setAuthMode("register"); setAuthError(""); }}
              >
                Create account
              </button>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ position: "static", padding: 0, border: "none", background: "none" }}>
              <label>Email
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </label>

              <label>Password
                <input
                  type="password"
                  required
                  minLength={6}
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
              </label>

              {authMode === "register" && (
                <label>Telegram Chat ID (optional)
                  <input
                    inputMode="numeric"
                    value={authChatId}
                    onChange={(e) => setAuthChatId(e.target.value)}
                    placeholder="e.g. 543236588"
                  />
                  <small>Can also be set later in settings.</small>
                </label>
              )}

              {authError && <p className="note err">{authError}</p>}

              <button className="btn" style={{ marginTop: "8px" }} disabled={authBusy}>
                {authBusy ? "Please wait…" : (authMode === "login" ? "Sign in" : "Create account")}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Link / Edit Telegram Modal */}
      {showTgModal && (
        <div className="modal-overlay" onClick={() => setShowTgModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowTgModal(false)} aria-label="Close">✕</button>
            <h3>Telegram Alerts Setting</h3>
            <p className="muted" style={{ fontSize: "0.88rem", margin: "6px 0 16px" }}>
              Connect your Telegram account to receive instant notifications when prices drop.
            </p>
            <form onSubmit={saveTelegramId} style={{ position: "static", padding: 0, border: "none", background: "none" }}>
              <label>Telegram Chat ID
                <input
                  inputMode="numeric"
                  required
                  value={tempChatId}
                  onChange={(e) => setTempChatId(e.target.value)}
                  placeholder="e.g. 543236588"
                />
                <small>Send <code>/start</code> to your bot to find your Chat ID.</small>
              </label>
              <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                <button className="btn" style={{ flex: 1 }}>Save</button>
                <button type="button" className="btn-sm" onClick={() => setShowTgModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <form onSubmit={add}>
        <label>Product link
          <input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.amazon.in/dp/..." />
        </label>
        <label>Target price (₹)
          <input type="number" required min="1" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
        </label>
        <label>Check frequency
          <select value={checkInterval} onChange={(e) => setCheckInterval(Number(e.target.value))}>
            {INTERVAL_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <small>How often to continuously check price</small>
        </label>
        <label>Telegram chat ID
          <input
            inputMode="numeric"
            required
            value={chatId}
            onChange={(e) => {
              setChatId(e.target.value);
              try { localStorage.setItem("chatId", e.target.value); } catch {}
            }}
            placeholder="123456789"
          />
          <small>
            {user?.chat_id && user.chat_id === chatId
              ? "✓ Linked to your account"
              : "Send /start to your bot to get this number."}
          </small>
        </label>
        <button className="btn" disabled={busy}>{busy ? "Reading price…" : "Track product"}</button>
        {msg && <p className={`note ${msg.kind}`}>{msg.text}</p>}
      </form>

      <section>
        {products.length === 0 ? (
          <p className="empty">{chatId ? "Nothing tracked for this chat ID yet. Add a product to start." : "Enter your Telegram chat ID or sign in to see your tracked products."}</p>
        ) : (
          <ul>
            {products.map((p) => {
              const hit = p.current_price != null && p.current_price <= p.target_price;
              const lastCheck = p.history?.[p.history.length - 1];
              return (
                <li className="row" key={p.id}>
                  <div>
                    <h2><a href={p.url} target="_blank" rel="noreferrer">{p.title || host(p.url)}</a></h2>
                    <span className="host">{host(p.url)}</span>
                    {lastCheck && (
                      <span className="muted" style={{ marginLeft: "10px", fontSize: "0.82rem" }}>
                        · Last checked: {when(lastCheck.checked_at)}
                      </span>
                    )}
                  </div>
                  <div className={`price ${hit ? "hit" : ""}`}>
                    <strong>{inr(p.current_price)}</strong>
                    <span className="muted">{hit ? "At or below your target of " : "Target "}{inr(p.target_price)}</span>
                  </div>
                  <Spark history={p.history} target={p.target_price} />
                  <details>
                    <summary>Price history ({p.history.length})</summary>
                    <table><tbody>
                      {[...p.history].reverse().slice(0, 10).map((h, i) => (
                        <tr key={i}><th scope="row">{when(h.checked_at)}</th><td>{inr(h.price)}</td></tr>
                      ))}
                    </tbody></table>
                  </details>
                  <div className="actions">
                    <label className="interval-wrap">
                      <span className="muted">Check:</span>
                      <select
                        className="interval-select"
                        value={p.check_interval || 60}
                        onChange={(e) => changeInterval(p.id, Number(e.target.value))}
                      >
                        {INTERVAL_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="btn-sm"
                      disabled={checkingId === p.id}
                      onClick={() => checkNow(p.id)}
                    >
                      {checkingId === p.id ? "Checking…" : "Check now"}
                    </button>
                    <button className="link" onClick={() => remove(p.id)}>Stop tracking</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
