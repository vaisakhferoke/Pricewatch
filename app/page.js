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
  const [chatId, setChatId] = useState("");
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [checkInterval, setCheckInterval] = useState(60);
  const [products, setProducts] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [checkingId, setCheckingId] = useState(null);

  const load = useCallback(async (id) => {
    if (!/^-?\d{5,20}$/.test(id)) return setProducts([]);
    try {
      const r = await fetch(`/api/products?chat_id=${id}`);
      if (!r.ok) return setProducts([]);
      const data = await r.json().catch(() => ({}));
      setProducts(data.products || []);
    } catch {
      setProducts([]);
    }
  }, []);

  useEffect(() => { try { setChatId(localStorage.getItem("chatId") || ""); } catch {} }, []);
  useEffect(() => { load(chatId.trim()); try { localStorage.setItem("chatId", chatId.trim()); } catch {} }, [chatId, load]);

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
      setUrl(""); setTarget(""); load(chatId.trim());
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
        <h1>Pricewatch</h1>
        <p>Paste an Amazon or Flipkart link, set the price you'd pay, and get a Telegram message when it drops.</p>
      </header>

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
          <input inputMode="numeric" required value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" />
          <small>Send /start to your bot to get this number.</small>
        </label>
        <button className="btn" disabled={busy}>{busy ? "Reading price…" : "Track product"}</button>
        {msg && <p className={`note ${msg.kind}`}>{msg.text}</p>}
      </form>

      <section>
        {products.length === 0 ? (
          <p className="empty">{chatId ? "Nothing tracked for this chat ID yet. Add a product to start." : "Enter your Telegram chat ID to see your tracked products."}</p>
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
