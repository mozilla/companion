/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let connected = false;

function updateStatus() {
  const statusEl = document.getElementById('connection-status');
  const btnEl = document.getElementById('connect-disconnect-btn');
  statusEl.textContent = browser.i18n.getMessage(connected ? 'connected' : 'disconnected');
  statusEl.className = connected ? 'status-connected' : '';
  btnEl.textContent = browser.i18n.getMessage(connected ? 'disconnect' : 'connect');
}

async function init() {
  document.getElementById('service-name').textContent =
    browser.i18n.getMessage('service-name.google');
  document.getElementById('service-labels').textContent =
    browser.i18n.getMessage('service-labels.google');

  const result = await browser.storage.local.get('onlineservices.config');
  const config = result['onlineservices.config'];
  connected = !!(config && config.some(s => s.type.startsWith('google')));
  updateStatus();

  const btn = document.getElementById('connect-disconnect-btn');

  async function updateConnectHref() {
    if (!connected) {
      const authUrl = await browser.runtime.sendMessage({ command: 'getAuthUrl', service: 'google' });
      btn.href = authUrl;
      btn.target = '_blank';
    } else {
      btn.removeAttribute('href');
      btn.removeAttribute('target');
    }
  }
  await updateConnectHref();

  btn.addEventListener('click', (e) => {
    if (connected) {
      e.preventDefault();
      browser.runtime.sendMessage({ command: 'signout', service: 'google' });
    }
  });

  browser.storage.onChanged.addListener(async (changes) => {
    if ('onlineservices.config' in changes) {
      const newConfig = changes['onlineservices.config'].newValue;
      connected = !!(newConfig && newConfig.some(s => s.type.startsWith('google')));
      updateStatus();
      await updateConnectHref();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
