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

async function maybeNotify() {
  const { notificationsEnabled } = await browser.storage.local.get('notificationsEnabled');
  if (notificationsEnabled === false) return;
  const key = formatTime24(new Date());
  const { notificationSchedule } = await browser.storage.local.get('notificationSchedule');
  if (!notificationSchedule) return;
  const toNotify = notificationSchedule.get(key);
  if (toNotify && toNotify.length > 0) {
    toNotify.forEach(notif => browser.notifications.create({ type: 'basic', iconUrl: browser.runtime.getURL('icon48.png'), ...notif }));
  }
}

async function updateNotificationSchedule(events) {
  if (!events) return;
  const newSchedule = new Map();
  events
    .filter(event => isHappeningToday(new Date(event.startDate)))
    .forEach(event => {
      const startDate = new Date(event.startDate);
      const key = formatTime24(startDate);
      const scheduledNotifications = newSchedule.get(key) || [];
      scheduledNotifications.push({ title: event.summary, message: 'Starting now' });
      newSchedule.set(key, scheduledNotifications);

      const tenMinBefore = new Date(startDate.getTime() - 10 * 60 * 1000);
      const tenMinKey = formatTime24(tenMinBefore);
      const schdn = newSchedule.get(tenMinKey) || [];
      schdn.push({ title: event.summary, message: 'Starting soon' });
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

browser.runtime.onMessage.addListener((request) => {
  switch (request.command) {
    case 'signin':
      OnlineServices.createService(request.service).then(() => fetchEvents());
      break;
    case 'signout':
      try {
        const service = OnlineServices.getServices('google')[0];
        OnlineServices.deleteService(service);
      } catch (e) {
        console.error(e);
      }
      browser.storage.local.remove('events');
      break;
    case 'refresh':
      fetchEvents();
      break;
  }
});

OnlineServices.init().then(() => fetchEvents());

const syncAlarmName = 'companion-event-sync';
const refreshAlarmName = 'companion-event-refresh';

browser.alarms.clear(syncAlarmName).then(() => {
  browser.alarms.create(syncAlarmName, { periodInMinutes: 10 });
});
browser.alarms.clear(refreshAlarmName).then(() => {
  browser.alarms.create(refreshAlarmName, { periodInMinutes: 1 });
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === syncAlarmName) fetchEvents();
  if (alarm.name === refreshAlarmName) maybeNotify();
});

browser.storage.onChanged.addListener((changes) => {
  if (changes.events && changes.events.newValue) {
    updateNotificationSchedule(changes.events.newValue);
  }
});
