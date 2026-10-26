(() => {
  'use strict';
  const REGION_RE = /^[a-z]{2}(-[a-z]+)+-\d$/;
  const TYPE_RE = /^[a-z][a-z0-9-]*\.[a-z0-9-]+$/;
  let ctx = { configured: false, os: 'Linux', hours: 730, creditsLeft: null };
  let prices = null, priceKey = '', loading = false, retryAt = 0, hinted = false;
  let timer = null, poll = null, observer = null, toastEl = null;

  const alive = () => { try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; } };

  function shutdown() {
    if (observer) observer.disconnect();
    clearInterval(poll);
    clearBadges();
    if (toastEl) toastEl.remove();
  }
  const clearBadges = () => document.querySelectorAll('.awscp-badge').forEach((b) => b.remove());

  function detectRegion() {
    const sub = location.hostname.split('.')[0];
    if (REGION_RE.test(sub)) return sub;
    const q = new URLSearchParams(location.search).get('region');
    if (q && REGION_RE.test(q)) return q;
    return 'us-east-1';
  }

  function toast(text, kind) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      document.body.appendChild(toastEl);
    }
    toastEl.className = 'awscp-toast' + (kind ? ' ' + kind : '');
    toastEl.textContent = 'AWS Credits Tracker: ' + text;
    toastEl.style.display = 'block';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => (toastEl.style.display = 'none'), 9000);
  }

  function badgeText(hourly) {
    const day = hourly * 24;
    let t = `$${hourly < 1 ? hourly.toFixed(4) : hourly.toFixed(2)}/hr · $${(hourly * ctx.hours).toFixed(2)}/mo`;
    if (ctx.creditsLeft > 0 && day > 0) t += ` · ${Math.floor(ctx.creditsLeft / day)}d of credits`;
    return t;
  }

  async function refreshContext() {
    if (!alive()) return shutdown();
    try {
      const r = await chrome.runtime.sendMessage({ type: 'getContext' });
      if (!r) return;
      const reprice = r.os !== ctx.os || r.configured !== ctx.configured;
      ctx = r;
      if (reprice) { priceKey = ''; prices = null; clearBadges(); }
      schedule();
    } catch (_) { if (!alive()) shutdown(); }
  }

  async function ensurePrices() {
    if (!alive()) return shutdown();
    if (!ctx.configured) {
      if (!hinted && /launch/i.test(location.hash + location.pathname)) {
        hinted = true;
        toast('open the extension and add your AWS keys to see instance prices here.', 'info');
      }
      return;
    }
    if (loading) return;
    const region = detectRegion();
    const key = region + '|' + ctx.os;
    if (key === priceKey && (prices || Date.now() < retryAt)) return;
    if (key !== priceKey) { prices = null; clearBadges(); }
    loading = true;
    priceKey = key;
    try {
      const r = await chrome.runtime.sendMessage({ type: 'getPrices', region, os: ctx.os });
      if (!r || r.error) throw new Error((r && r.error) || 'no response from extension');
      prices = r.map;
    } catch (e) {
      prices = null;
      retryAt = Date.now() + 120000;
      toast("couldn't load EC2 prices — " + e.message);
    }
    loading = false;
    scan();
  }

  function scan() {
    if (!prices || !document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest('.awscp-badge, .awscp-toast, script, style, textarea, input')) return NodeFilter.FILTER_REJECT;
        const t = n.nodeValue.trim();
        return t.length < 4 || t.length > 30 || !TYPE_RE.test(t) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const region = priceKey.split('|')[0];
    for (const n of nodes) {
      const type = n.nodeValue.trim();
      const hourly = prices[type];
      if (hourly == null) continue;
      const text = badgeText(hourly);
      const next = n.nextSibling;
      if (next && next.classList && next.classList.contains('awscp-badge')) {
        if (next.textContent !== text) next.textContent = text;
        continue;
      }
      const s = document.createElement('span');
      s.className = 'awscp-badge';
      s.textContent = text;
      s.title = `${type}: $${hourly}/hr · $${(hourly * 24).toFixed(2)}/day · $${(hourly * 24 * 7).toFixed(2)}/week (On-Demand, ${ctx.os}, ${region})`;
      n.parentNode.insertBefore(s, n.nextSibling);
    }
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { ensurePrices(); scan(); }, 300);
  }

  refreshContext();
  observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true });
  poll = setInterval(refreshContext, 60000);
  window.addEventListener('focus', refreshContext);
})();
