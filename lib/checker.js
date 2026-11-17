import { initDb } from "./db";
import { scrapeProduct, ScrapeError, sleep, jitter } from "./scraper";
import { sendPriceAlert } from "./telegram";

const DROP_PERCENT = Number(process.env.DROP_PERCENT || 10);

// Alert when the price reaches the target (on first crossing or any further drop),
// or on EVERY check if alertEveryCheck is enabled,
// or when it falls at least DROP_PERCENT below the previous price.
  export function decideAlert({ price, previous, target, alertEveryCheck = true }) {
    if (price <= target) {
      if (alertEveryCheck) return "target";
      if (previous == null || previous > target || price < previous) return "target";
    }
    if (previous && price <= previous * (1 - DROP_PERCENT / 100)) return "drop";
    return null;
  }

    export async function checkProduct(p) {
      const d = await initDb();
      const { title, price } = await scrapeProduct(p.url);
      const previous = p.current_price;

      await d.batch(
        [
          { sql: "UPDATE products SET current_price = ?, title = COALESCE(title, ?) WHERE id = ?", args: [price, title, p.id] },
          { sql: "INSERT INTO price_history (product_id, price) VALUES (?, ?)", args: [p.id, price] },
        ],
        "write"
      );

        const alertEveryCheck = p.alert_every_check === 0 ? false : true;
        const reason = decideAlert({
          price,
          previous,
          target: p.target_price,
          alertEveryCheck,
        });
        let alerted = false;
        if(reason) {
          alerted = await sendPriceAlert({
            chatId: p.chat_id, title: title || p.title, url: p.url, price, previous, target: p.target_price, reason,
          });
        } else {
          console.log(`ℹ️ [No alert for product #${p.id}]: Price is ₹${price}, Target is ₹${p.target_price}`);
        }
  return { id: p.id, price, previous, alerted, reason };
      }

  export function isProductDue(p, now = Date.now()) {
        const intervalMinutes = Number(p.check_interval) || 60;
        if (!p.last_checked) return true;
        const lastTime = new Date(p.last_checked.replace(" ", "T") + "Z").getTime();
        if (isNaN(lastTime)) return true;
        const diffMinutes = (now - lastTime) / (1000 * 60);
        return diffMinutes >= intervalMinutes;
      }

      // Checks products that are due based on their individual check_interval.
      export async function checkDue({ budgetMs = 50000, force = false } = {}) {
        const started = Date.now();
        const d = await initDb();
        const { rows } = await d.execute(
          `SELECT p.*,
      (SELECT MAX(checked_at) FROM price_history h WHERE h.product_id = p.id) as last_checked
     FROM products p
     ORDER BY (SELECT MAX(checked_at) FROM price_history h WHERE h.product_id = p.id) ASC`
        );
        const now = Date.now();
        const dueProducts = force ? rows : rows.filter((p) => isProductDue(p, now));
        const summary = { total: rows.length, due: dueProducts.length, checked: 0, alerts: 0, failed: [], skipped: 0 };

        for (const p of dueProducts) {
          if (Date.now() - started > budgetMs) {
            summary.skipped = dueProducts.length - summary.checked - summary.failed.length;
            break;
          }
          try {
            const r = await checkProduct(p);
            summary.checked++;
            if (r.alerted) summary.alerts++;
          } catch (e) {
            const code = e instanceof ScrapeError ? e.code : "ERROR";
            console.error(`Product ${p.id} failed [${code}]: ${e.message}`);
            summary.failed.push({ id: p.id, code, message: e.message });
          }
          if (dueProducts.length > 1) {
            await sleep(jitter(1500, 3500)); // spread requests out
          }
        }
        return summary;
      }

      // Checks all products regardless of interval (for manual trigger or legacy cron).
      export async function checkAll(opts = {}) {
        return checkDue({ ...opts, force: true });
      }
