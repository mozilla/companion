/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

export {}

import { OnlineServices } from './onlineservices.js'
import { maybeNotify, updateNotificationSchedule } from './event'

type BackendStatus = 'idle' | 'fetching'

async function setStatus(status: BackendStatus) {
  return browser.storage.local.set({ status })
}

async function fetchEvents() {
  await setStatus('fetching')
  await OnlineServices.fetchEvents()
  await setStatus('idle')
}

function handleMessage(request: any) {
  switch (request.command) {
    case 'signin':
      OnlineServices.createService(request.service).then(() => fetchEvents())

      break
    case 'signout': {
      try {
        const service = OnlineServices.getServices('google')[0]
        OnlineServices.deleteService(service)
      } catch (e) {
        console.error(e)
      }
      browser.storage.local.remove('events')
      break
    }
    case 'refresh':
      fetchEvents()
      break
  }
}
browser.runtime.onMessage.addListener(handleMessage)

OnlineServices.init().then(() => {
  fetchEvents()
})

const syncAlarmName = 'companion-event-sync'
browser.alarms.clear(syncAlarmName).then(() => {
  browser.alarms.create(syncAlarmName, {
    periodInMinutes: 10,
  })
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== syncAlarmName) return
    fetchEvents()
  })
})

// every minute, check if there's a notification to send
const refreshAlarmName = 'companion-event-refresh'
browser.alarms.clear(refreshAlarmName).then(() => {
  browser.alarms.create(refreshAlarmName, {
    periodInMinutes: 1,
  })
})

browser.alarms.onAlarm.addListener(async (alarm) => {
  switch (alarm.name) {
    case syncAlarmName:
      fetchEvents()
      return
    case refreshAlarmName:
      maybeNotify()
  }
})

browser.storage.onChanged.addListener(async (changes) => {
  const eventsUpdate = changes.events
  console.log('eventsUpdate', eventsUpdate)
  if (eventsUpdate && eventsUpdate.newValue) {
    updateNotificationSchedule(eventsUpdate.newValue)
  }
})
