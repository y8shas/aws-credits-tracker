'use strict';
// Storage layout:
//   storage.session  -> creds          (always; cleared when the browser closes)
//   storage.local    -> creds          (only if "Remember keys on this device" is on)
//   storage.local    -> prefs, cache, creditsLeft, prices:<region>:<os>
// Content scripts never read storage directly: the background script restricts storage.local
// to trusted contexts and hands the content script only non-secret values.

const Store = {
  async getCreds() {
    const s = await chrome.storage.session.get('creds');
    if (s.creds) return s.creds;
    const { creds } = await chrome.storage.local.get('creds');
    if (creds) await chrome.storage.session.set({ creds });
    return creds || null;
  },
  async setCreds(creds, remember) {
    await chrome.storage.session.set({ creds });
    if (remember) await chrome.storage.local.set({ creds });
    else await chrome.storage.local.remove('creds');
  },
  async getPrefs() {
    return (await chrome.storage.local.get('prefs')).prefs || {};
  },
  async setPrefs(prefs) {
    await chrome.storage.local.set({ prefs });
  },
  async clearAll() {
    await chrome.storage.session.clear();
    await chrome.storage.local.clear();
  },
  // Pre-release builds kept everything in a single "settings" object.
  async migrate() {
    const { settings } = await chrome.storage.local.get('settings');
    if (!settings) return;
    const { ak, sk, st, ...rest } = settings;
    if (ak && sk) await Store.setCreds({ accessKey: ak, secretKey: sk, sessionToken: st || '' }, true);
    await Store.setPrefs({ ...rest, remember: true });
    await chrome.storage.local.remove('settings');
  },
};
