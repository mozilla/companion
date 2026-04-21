/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OnlineServices } from './onlineservices.js'

function formatTime24(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

function isHappeningToday(startDate, endDate) {
  if (!startDate) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const start = new Date(startDate);
  if (!endDate) return start >= todayStart && start < todayEnd;
  const end = new Date(endDate);
  return start < todayEnd && end >= todayStart;
}

const notificationActions = new Map();

async function maybeNotify() {
  const { notificationsEnabled } = await browser.storage.sync.get('notificationsEnabled');
  if (notificationsEnabled === false) return;
  const key = formatTime24(new Date());
  const { notificationSchedule } = await browser.storage.local.get('notificationSchedule');
  if (!notificationSchedule) return;
  const toNotify = notificationSchedule.get(key);
  if (toNotify && toNotify.length > 0) {
    toNotify.forEach(notif => {
      const { actionUrl, ...notifData } = notif;
      const id = `companion-${Date.now()}-${Math.random()}`;
      if (actionUrl) notificationActions.set(id, actionUrl);
      browser.notifications.create(id, { type: 'basic', iconUrl: browser.runtime.getURL('icon48.png'), ...notifData });
    });
  }
}

browser.notifications.onClicked.addListener(id => {
  const url = notificationActions.get(id);
  if (url) {
    browser.tabs.create({ url });
    notificationActions.delete(id);
  }
});

browser.notifications.onClosed.addListener(id => {
  notificationActions.delete(id);
});

async function updateNotificationSchedule(events) {
  if (!events) return;
  const newSchedule = new Map();
  events
    .filter(event => isHappeningToday(new Date(event.startDate)))
    .forEach(event => {
      const startDate = new Date(event.startDate);
      const key = formatTime24(startDate);
      const actionUrl = event.conference?.url || event.url;
      const scheduledNotifications = newSchedule.get(key) || [];
      scheduledNotifications.push({ title: event.summary, message: 'Starting now', actionUrl });
      newSchedule.set(key, scheduledNotifications);

      const tenMinBefore = new Date(startDate.getTime() - 10 * 60 * 1000);
      const tenMinKey = formatTime24(tenMinBefore);
      const schdn = newSchedule.get(tenMinKey) || [];
      schdn.push({ title: event.summary, message: 'Starting soon', actionUrl });
      newSchedule.set(tenMinKey, schdn);
    });
  browser.storage.local.set({ notificationSchedule: newSchedule });
}

async function setStatus(status) {
  return browser.storage.local.set({ status });
}

async function fetchEvents() {
  await setStatus('fetching');
  await OnlineServices.fetchEvents();
  await setStatus('idle');
}

let authListener = null;

function registerAuthListener(type) {
  if (authListener) return;
  const redirectBase = OnlineServices.getRedirectBase(type);
  authListener = async (tabId, changeInfo) => {
    if (!changeInfo.url || !changeInfo.url.startsWith(redirectBase)) return;
    browser.tabs.onUpdated.removeListener(authListener);
    authListener = null;
    browser.tabs.remove(tabId).catch(() => {});
    const service = await OnlineServices.completeAuth(type, changeInfo.url);
    if (service) {
      fetchEvents();
    } else {
      registerAuthListener(type);
    }
  };
  browser.tabs.onUpdated.addListener(authListener, { properties: ['url'] });
}

function unregisterAuthListener() {
  if (authListener) {
    browser.tabs.onUpdated.removeListener(authListener);
    authListener = null;
  }
}

async function maybeRegisterAuthListener() {
  const result = await browser.storage.local.get('onlineservices.config');
  const config = result['onlineservices.config'];
  const connected = config && config.some(s => s.type.startsWith('google'));
  if (!connected) registerAuthListener('google');
}

browser.runtime.onMessage.addListener((request) => {
  switch (request.command) {
    case 'getAuthUrl':
      return Promise.resolve(OnlineServices.getAuthUrl(request.service));
    case 'signout':
      try {
        const service = OnlineServices.getServices('google')[0];
        OnlineServices.deleteService(service);
      } catch (e) {
        console.error(e);
      }
      browser.storage.local.remove(['events', 'recentDocs', 'collapsedHeroes', 'unreadCount']);
      registerAuthListener('google');
      break;
    case 'refresh':
      fetchEvents();
      break;
  }
});

OnlineServices.init().then(() => {
  maybeRegisterAuthListener();
  fetchEvents();
});

const syncAlarmName = 'companion-event-sync';
const refreshAlarmName = 'companion-event-refresh';
const unreadAlarmName = 'companion-unread-sync';

browser.alarms.clear(syncAlarmName).then(() => {
  browser.alarms.create(syncAlarmName, { periodInMinutes: 10 });
});
browser.alarms.clear(refreshAlarmName).then(() => {
  browser.alarms.create(refreshAlarmName, { periodInMinutes: 1 });
});
browser.alarms.clear(unreadAlarmName).then(() => {
  browser.alarms.create(unreadAlarmName, { periodInMinutes: 1 });
});

async function fetchUnreadCount() {
  const services = OnlineServices.getAllServices();
  if (!services.length) return;
  const results = await Promise.allSettled(services.map(s => s.getUnreadCount()));
  const unreadCount = results.reduce((sum, r) => sum + (r.value || 0), 0);
  browser.storage.local.set({ unreadCount });
}

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === syncAlarmName) fetchEvents();
  if (alarm.name === refreshAlarmName) maybeNotify();
  if (alarm.name === unreadAlarmName) fetchUnreadCount();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.events && changes.events.newValue) {
    updateNotificationSchedule(changes.events.newValue);
  }
});
