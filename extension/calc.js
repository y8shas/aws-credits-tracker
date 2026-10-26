'use strict';
// Pure helpers (no DOM, no chrome.* APIs) so they can be unit-tested in Node.

const DAY = 864e5;
const fmtDate = (d) => d.toISOString().slice(0, 10);
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const utcMidnight = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const parseDay = (s) => new Date(s + 'T00:00:00Z');

/** Cost Explorer daily results grouped by RECORD_TYPE -> { 'YYYY-MM-DD': {usage, credit} } */
function parseDaily(pages) {
  const days = {};
  for (const page of pages) {
    for (const r of page.ResultsByTime || []) {
      const d = (days[r.TimePeriod.Start] ||= { usage: 0, credit: 0 });
      for (const g of r.Groups || []) {
        const amt = parseFloat(g.Metrics.UnblendedCost.Amount) || 0;
        if (g.Keys[0] === 'Usage') d.usage += amt;
        else if (g.Keys[0] === 'Credit') d.credit += Math.abs(amt); // credits are negative in CE
      }
    }
  }
  return days;
}

/** Cost Explorer results grouped by SERVICE -> { serviceName: amount } */
function parseServices(pages) {
  const svc = {};
  for (const page of pages) {
    for (const r of page.ResultsByTime || []) {
      for (const g of r.Groups || []) {
        svc[g.Keys[0]] = (svc[g.Keys[0]] || 0) + (parseFloat(g.Metrics.UnblendedCost.Amount) || 0);
      }
    }
  }
  return svc;
}

/** Pricing API GetProducts PriceList (array of JSON strings) -> { instanceType: USD per hour } */
function parsePrices(priceList) {
  const map = {};
  for (const item of priceList || []) {
    let p;
    try { p = typeof item === 'string' ? JSON.parse(item) : item; } catch { continue; }
    const type = p.product && p.product.attributes && p.product.attributes.instanceType;
    const od = p.terms && p.terms.OnDemand;
    if (!type || !od) continue;
    const term = Object.values(od)[0];
    const dim = term && term.priceDimensions && Object.values(term.priceDimensions)[0];
    const usd = dim && parseFloat(dim.pricePerUnit && dim.pricePerUnit.USD);
    if (usd > 0 && (map[type] == null || usd < map[type])) map[type] = usd;
  }
  return map;
}

/** Turn daily data + user prefs into everything the popup displays. */
function summarize(days, prefs, today) {
  const sum = (from, to, key) => {
    let t = 0;
    for (let d = new Date(from); d <= to; d = addDays(d, 1)) t += (days[fmtDate(d)] || {})[key] || 0;
    return t;
  };
  // "Used" = credits applied; if no credits were applied in the window, fall back to gross usage.
  const used = (from, to) => {
    const c = sum(from, to, 'credit');
    return c > 0 ? c : sum(from, to, 'usage');
  };
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const yesterday = addDays(today, -1);

  const out = {
    today: used(today, today),
    yesterday: used(yesterday, yesterday),
    week: used(addDays(today, -6), today),
    month: used(monthStart, today),
    last30: used(addDays(today, -29), today),
  };
  const keys = Object.keys(days).sort();
  const first = keys.length ? parseDay(keys[0]) : today;
  out.totalUsed = sum(first, today, 'credit');
  out.burn = out.week / 7;
  out.chart = [];
  for (let i = 13; i >= 0; i--) {
    const d = addDays(today, -i);
    out.chart.push({ date: fmtDate(d), value: used(d, d) });
  }

  const total = parseFloat(prefs.total);
  out.hasTotal = total > 0;
  out.total = out.hasTotal ? total : 0;
  out.needStart = out.hasTotal && !prefs.start;
  out.left = null; out.pct = null; out.daysLeft = null; out.runOut = null;
  out.expiryDays = null; out.expired = false; out.safePerDay = null; out.runsOutBeforeExpiry = false;

  if (out.hasTotal) {
    out.left = Math.max(total - out.totalUsed, 0);
    out.pct = Math.max(0, Math.min(100, (out.left / total) * 100));
    if (out.burn > 0) {
      out.daysLeft = Math.floor(out.left / out.burn);
      out.runOut = addDays(today, out.daysLeft);
    }
    if (prefs.expiry) {
      const exp = parseDay(prefs.expiry);
      out.expiryDays = Math.round((exp - today) / DAY);
      out.expired = out.expiryDays < 0;
      if (!out.expired) {
        out.safePerDay = out.left / Math.max(out.expiryDays, 1);
        out.runsOutBeforeExpiry = out.runOut != null && out.runOut < exp;
      }
    }
  }
  return out;
}

/** Human-friendly message for common AWS / network failures. */
function friendlyError(err) {
  const code = (err && err.code) || '';
  const msg = (err && err.message) || String(err);
  if (/AccessDenied/i.test(code) || /not authorized|access denied/i.test(msg))
    return 'Access denied. The IAM user needs ce:GetCostAndUsage and pricing:GetProducts, and the account owner must enable "IAM user and role access to Billing information" (Billing → Account settings).';
  if (/UnrecognizedClient|InvalidClientTokenId/i.test(code) || /security token included in the request is invalid/i.test(msg))
    return 'AWS does not recognise this access key ID (or the session token is wrong).';
  if (/SignatureDoesNotMatch/i.test(code))
    return "The secret access key looks wrong — or your computer's clock is off by more than 5 minutes.";
  if (/ExpiredToken/i.test(code) || /RequestExpired/i.test(code))
    return 'These credentials have expired (or your computer clock is off). Paste fresh ones.';
  if (/DataUnavailable/i.test(code))
    return 'Cost Explorer has no data yet. If you just enabled it, wait up to 24 hours.';
  if (/Throttl|LimitExceeded|TooManyRequests/i.test(code))
    return 'AWS is rate-limiting requests. Try again in a minute.';
  if (code === 'NetworkError' || /failed to fetch/i.test(msg))
    return 'Network error — could not reach AWS. Check your connection or proxy.';
  return msg;
}

if (typeof module !== 'undefined' && module.exports)
  module.exports = { DAY, fmtDate, addDays, utcMidnight, parseDay, parseDaily, parseServices, parsePrices, summarize, friendlyError };
