'use strict';
const $ = (id) => document.getElementById(id);
const usd = (n) => (n < 0 ? '-' : '') + '$' + Math.abs(n).toFixed(2);
const POLICY = JSON.stringify(
  { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Action: ['ce:GetCostAndUsage', 'pricing:GetProducts'], Resource: '*' }] },
  null, 2
);
let busy = false;

function showMsg(t) { $('msg').textContent = t; $('msg').classList.toggle('hidden', !t); }
function show(view) {
  $('dash').classList.toggle('hidden', view !== 'dash');
  $('settings').classList.toggle('hidden', view !== 'settings');
}

async function fetchData(creds, prefs) {
  const today = utcMidnight();
  const end = fmtDate(addDays(today, 1)); // End is exclusive
  const monthStart = fmtDate(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)));
  const floor = addDays(today, -360); // daily granularity is limited to ~12 months
  let from = prefs.start ? parseDay(prefs.start) : addDays(today, -90);
  if (from < floor) from = floor;

  const daily = await ceAll(creds, 'GetCostAndUsage', {
    TimePeriod: { Start: fmtDate(from), End: end },
    Granularity: 'DAILY',
    Metrics: ['UnblendedCost'],
    GroupBy: [{ Type: 'DIMENSION', Key: 'RECORD_TYPE' }],
  });
  const services = await ceAll(creds, 'GetCostAndUsage', {
    TimePeriod: { Start: monthStart, End: end },
    Granularity: 'MONTHLY',
    Metrics: ['UnblendedCost'],
    Filter: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Usage'] } },
    GroupBy: [{ Type: 'DIMENSION', Key: 'SERVICE' }],
  });
  return { days: parseDaily(daily), svc: parseServices(services), ts: Date.now() };
}

function render(data, prefs) {
  const s = summarize(data.days, prefs, utcMidnight());
  $('d1').textContent = usd(s.today);
  $('d2').textContent = usd(s.yesterday);
  $('w').textContent = usd(s.week);
  $('m').textContent = usd(s.month);
  $('m30').textContent = usd(s.last30);
  $('tot').textContent = usd(s.totalUsed);

  const proj = $('proj');
  proj.classList.remove('warn');
  const lines = [`Burn rate: <b>${usd(s.burn)}/day</b> (7-day avg) · <b>${usd(s.burn * 30)}</b>/month`];

  if (s.hasTotal) {
    $('left').textContent = usd(s.left);
    $('barfill').style.width = s.pct + '%';
    $('barfill').style.background = s.pct < 15 ? 'var(--bad)' : s.pct < 40 ? 'var(--acc)' : 'var(--ok)';
    $('leftsub').textContent = `${s.pct.toFixed(0)}% of ${usd(s.total)} remaining`;
    chrome.storage.local.set({ creditsLeft: s.left });
    chrome.action.setBadgeText({ text: String(Math.round(s.left)) });
    chrome.action.setBadgeBackgroundColor({ color: s.pct < 15 ? '#ff5c5c' : '#ff9900' });

    if (s.daysLeft != null) lines.push(`At this rate credits last <b>${s.daysLeft} days</b> (until ~${fmtDate(s.runOut)})`);
    else lines.push('No recent spend.');
    if (s.expiryDays != null) {
      if (s.expired) lines.push(`⚠ Credits expired on ${prefs.expiry}`);
      else {
        lines.push(`Expiry in <b>${s.expiryDays} days</b> → budget <b>${usd(s.safePerDay)}/day</b> to use it all`);
        if (s.runsOutBeforeExpiry) { proj.classList.add('warn'); lines.push('⚠ You will run out before expiry'); }
      }
    }
    if (s.needStart) lines.push('ℹ Set the credits <b>start date</b> in settings for an accurate balance.');
  } else {
    chrome.storage.local.remove('creditsLeft');
    chrome.action.setBadgeText({ text: '' });
    $('left').textContent = '—';
    $('barfill').style.width = '0';
    $('leftsub').textContent = 'Set “Total credits” in settings to see what is left';
  }
  proj.innerHTML = lines.join('<br>');

  const chart = $('chart');
  chart.replaceChildren();
  const max = Math.max(...s.chart.map((c) => c.value), 0.01);
  for (const c of s.chart) {
    const b = document.createElement('div');
    b.style.height = Math.max((c.value / max) * 100, 3) + '%';
    b.title = `${c.date}: ${usd(c.value)}`;
    chart.appendChild(b);
  }

  const svcBox = $('svc');
  svcBox.replaceChildren();
  const rows = Object.entries(data.svc).filter(([, v]) => v > 0.005).sort((a, b) => b[1] - a[1]).slice(0, 6);
  if (!rows.length) {
    const d = document.createElement('div');
    d.className = 'sub';
    d.textContent = 'No usage yet this month';
    svcBox.appendChild(d);
  }
  for (const [name, v] of rows) {
    const row = document.createElement('div');
    row.className = 'svcrow';
    const n = document.createElement('span');
    n.textContent = name.replace(/^Amazon |^AWS /, '');
    n.title = name;
    const val = document.createElement('b');
    val.textContent = usd(v);
    row.append(n, val);
    svcBox.appendChild(row);
  }
  $('foot').textContent = `Updated ${new Date(data.ts).toLocaleTimeString()} · AWS data lags up to ~24 h · dates are UTC`;
}

async function load(force = false) {
  if (busy) return;
  busy = true;
  showMsg('');
  $('refresh').disabled = true;
  try {
    await Store.migrate();
    const creds = await Store.getCreds();
    const prefs = await Store.getPrefs();
    if (!creds) { await openSettings(); return; }
    show('dash');
    const { cache } = await chrome.storage.local.get('cache');
    const ttl = (parseInt(prefs.ttl, 10) || 60) * 60000;
    let data = cache;
    if (force || !cache || Date.now() - cache.ts > ttl) {
      data = await fetchData(creds, prefs);
      await chrome.storage.local.set({ cache: data });
    }
    render(data, prefs);
  } catch (e) {
    showMsg(friendlyError(e));
  } finally {
    busy = false;
    $('refresh').disabled = false;
  }
}

async function openSettings() {
  const prefs = await Store.getPrefs();
  const creds = await Store.getCreds();
  $('ak').value = creds ? creds.accessKey : '';
  $('sk').value = ''; $('st').value = '';
  $('sk').placeholder = creds ? '•••••••• (saved — leave blank to keep)' : '';
  $('st').placeholder = creds && creds.sessionToken ? '•••••••• (saved — leave blank to keep)' : '';
  $('remember').checked = prefs.remember !== false;
  $('total').value = prefs.total || ''; $('start').value = prefs.start || ''; $('expiry').value = prefs.expiry || '';
  $('ttl').value = prefs.ttl || 60; $('os').value = prefs.os || 'Linux'; $('hours').value = prefs.hours || 730;
  $('guide').open = !creds;
  show('settings');
}

async function save() {
  showMsg('');
  const old = await Store.getCreds();
  const accessKey = $('ak').value.trim() || (old ? old.accessKey : '');
  const secretKey = $('sk').value.trim() || (old && $('ak').value.trim() === old.accessKey ? old.secretKey : '');
  const sessionToken = $('st').value.trim() || (old && $('ak').value.trim() === old.accessKey ? old.sessionToken || '' : '');
  if (!/^[A-Z0-9]{16,128}$/.test(accessKey)) return showMsg('That does not look like an AWS access key ID (e.g. AKIA…).');
  if (secretKey.length < 20) return showMsg('Enter the secret access key.');
  if (accessKey.startsWith('ASIA') && !sessionToken) return showMsg('Temporary (ASIA…) keys also need a session token.');

  const total = $('total').value, start = $('start').value, expiry = $('expiry').value;
  if (total !== '' && !(parseFloat(total) >= 0)) return showMsg('Total credits must be a positive number.');
  if (start && expiry && expiry < start) return showMsg('Expiry date is before the start date.');

  const prefs = {
    total, start, expiry,
    ttl: Math.min(Math.max(parseInt($('ttl').value, 10) || 60, 5), 1440),
    os: $('os').value,
    hours: Math.min(Math.max(parseFloat($('hours').value) || 730, 1), 744),
    remember: $('remember').checked,
  };
  await Store.setCreds({ accessKey, secretKey, sessionToken }, prefs.remember);
  await Store.setPrefs(prefs);
  await chrome.storage.local.remove('cache');
  load(true);
}

$('refresh').onclick = () => load(true);
$('gear').onclick = () => ($('settings').classList.contains('hidden') ? openSettings() : load());
$('save').onclick = save;
$('policy').textContent = POLICY;
$('copypolicy').onclick = async () => {
  await navigator.clipboard.writeText(POLICY);
  $('copypolicy').textContent = 'Copied ✓';
  setTimeout(() => ($('copypolicy').textContent = 'Copy policy'), 1500);
};
$('wipe').onclick = async () => {
  if (!confirm('Remove your AWS keys and all data this extension has stored?')) return;
  await Store.clearAll();
  chrome.action.setBadgeText({ text: '' });
  await openSettings();
};
load();
