'use strict';
// Minimal AWS Signature V4 signer + JSON-protocol client (Cost Explorer, Pricing).

const _enc = new TextEncoder();
const _hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const _sha256Hex = async (s) => _hex(await crypto.subtle.digest('SHA-256', _enc.encode(s)));
async function _hmac(key, msg) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, _enc.encode(msg)));
}

/** Pure signing function (unit-tested against the AWS documentation example). */
async function signRequest({ method = 'POST', path = '/', query = '', headers, body = '', creds, region, service, amzDate }) {
  const dateStamp = amzDate.slice(0, 8);
  const lower = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v).trim().replace(/\s+/g, ' ');
  const names = Object.keys(lower).sort();
  const canonicalHeaders = names.map((n) => `${n}:${lower[n]}\n`).join('');
  const signedHeaders = names.join(';');
  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, await _sha256Hex(body)].join('\n');
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await _sha256Hex(canonicalRequest)].join('\n');

  let k = await _hmac(_enc.encode('AWS4' + creds.secretKey), dateStamp);
  k = await _hmac(k, region);
  k = await _hmac(k, service);
  k = await _hmac(k, 'aws4_request');
  const signature = _hex(await _hmac(k, stringToSign));
  return {
    signature,
    signedHeaders,
    authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

class AwsError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'AwsError';
    this.code = code;
    this.status = status;
  }
}

async function awsJson(creds, { host, service, target, region = 'us-east-1' }, payload) {
  const body = JSON.stringify(payload);
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const headers = {
    'content-type': 'application/x-amz-json-1.1',
    host,
    'x-amz-date': amzDate,
    'x-amz-target': target,
  };
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken;

  const { authorization } = await signRequest({ headers, body, creds, region, service, amzDate });
  const sendHeaders = { ...headers, Authorization: authorization };
  delete sendHeaders.host; // the browser sets Host itself

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let res, text;
  try {
    res = await fetch(`https://${host}/`, { method: 'POST', headers: sendHeaders, body, signal: ctrl.signal });
    text = await res.text();
  } catch (e) {
    throw new AwsError('NetworkError', e.name === 'AbortError' ? 'Request timed out' : e.message, 0);
  } finally {
    clearTimeout(timer);
  }
  let json;
  try { json = JSON.parse(text); } catch { json = { message: text.slice(0, 200) }; }
  if (!res.ok) {
    const code = String(json.__type || json.code || '').split('#').pop();
    throw new AwsError(code, json.message || json.Message || `HTTP ${res.status}`, res.status);
  }
  return json;
}

const ceRequest = (creds, action, payload) =>
  awsJson(creds, { host: 'ce.us-east-1.amazonaws.com', service: 'ce', target: 'AWSInsightsIndexService.' + action }, payload);

async function ceAll(creds, action, payload) {
  const pages = [];
  let token;
  do {
    const r = await ceRequest(creds, action, token ? { ...payload, NextPageToken: token } : payload);
    pages.push(r);
    token = r.NextPageToken;
  } while (token);
  return pages;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { signRequest, AwsError };
