'use strict';
importScripts('sigv4.js', 'calc.js', 'store.js');

// Defence in depth: keep storage.local (which may hold the secret key) away from content scripts.
try {
  const p = chrome.storage.local.setAccessLevel && chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
  if (p && p.catch) p.catch(() => {});
} catch (_) { /* older Chrome */ }

const LOCATIONS = {
  'us-east-1': 'US East (N. Virginia)', 'us-east-2': 'US East (Ohio)',
  'us-west-1': 'US West (N. California)', 'us-west-2': 'US West (Oregon)',
  'af-south-1': 'Africa (Cape Town)', 'ap-east-1': 'Asia Pacific (Hong Kong)',
  'ap-south-1': 'Asia Pacific (Mumbai)', 'ap-south-2': 'Asia Pacific (Hyderabad)',
  'ap-southeast-1': 'Asia Pacific (Singapore)', 'ap-southeast-2': 'Asia Pacific (Sydney)',
  'ap-southeast-3': 'Asia Pacific (Jakarta)', 'ap-southeast-4': 'Asia Pacific (Melbourne)',
  'ap-northeast-1': 'Asia Pacific (Tokyo)', 'ap-northeast-2': 'Asia Pacific (Seoul)',
  'ap-northeast-3': 'Asia Pacific (Osaka)', 'ca-central-1': 'Canada (Central)',
  'eu-central-1': 'EU (Frankfurt)', 'eu-central-2': 'EU (Zurich)',
  'eu-west-1': 'EU (Ireland)', 'eu-west-2': 'EU (London)', 'eu-west-3': 'EU (Paris)',
  'eu-north-1': 'EU (Stockholm)', 'eu-south-1': 'EU (Milan)', 'eu-south-2': 'EU (Spain)',
  'me-south-1': 'Middle East (Bahrain)', 'me-central-1': 'Middle East (UAE)',
  'il-central-1': 'Israel (Tel Aviv)', 'sa-east-1': 'South America (Sao Paulo)',
};

const PRICE_TTL = 7 * DAY;
const inflight = {};

async function loadPrices(region, os) {
  const key = `prices:${region}:${os}`;
  const cached = (await chrome.storage.local.get(key))[key];
  if (cached && Date.now() - cached.ts < PRICE_TTL) return cached.map;
  if (inflight[key]) return inflight[key];

  inflight[key] = (async () => {
    const creds = await Store.getCreds();
    if (!creds) throw new Error('Add your AWS keys in the extension popup first.');
    const F = (Field, Value) => ({ Type: 'TERM_MATCH', Field, Value });
    const filters = [
      LOCATIONS[region] ? F('location', LOCATIONS[region]) : F('regionCode', region),
      F('operatingSystem', os), F('tenancy', 'Shared'), F('preInstalledSw', 'NA'),
      F('capacitystatus', 'Used'), F('licenseModel', 'No License required'),
    ];
    const map = {};
    let token;
    do {
      const r = await awsJson(
        creds,
        { host: 'api.pricing.us-east-1.amazonaws.com', service: 'pricing', target: 'AWSPriceListService.GetProducts' },
        { ServiceCode: 'AmazonEC2', Filters: filters, FormatVersion: 'aws_v1', MaxResults: 100, ...(token ? { NextToken: token } : {}) }
      );
      Object.assign(map, parsePrices(r.PriceList));
      token = r.NextToken;
    } while (token);

    if (!Object.keys(map).length) throw new Error('No prices returned for ' + region);
    await chrome.storage.local.set({ [key]: { ts: Date.now(), map } });
    return map;
  })().finally(() => { delete inflight[key]; });

  return inflight[key];
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  // Only accept messages from this extension's own pages / content scripts.
  if (sender.id !== chrome.runtime.id) return;

  if (msg.type === 'getPrices') {
    loadPrices(msg.region, msg.os).then((map) => send({ map }), (e) => send({ error: friendlyError(e) }));
    return true;
  }
  if (msg.type === 'getContext') {
    (async () => {
      await Store.migrate();
      const creds = await Store.getCreds();
      const prefs = await Store.getPrefs();
      const { creditsLeft } = await chrome.storage.local.get('creditsLeft');
      send({
        configured: !!creds,
        os: ['Linux', 'Windows', 'RHEL', 'SUSE'].includes(prefs.os) ? prefs.os : 'Linux',
        hours: parseFloat(prefs.hours) || 730,
        creditsLeft: creditsLeft ?? null,
      });
    })().catch(() => send(null));
    return true;
  }
});
