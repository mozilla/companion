/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OAuth2 } from './oauth2.js'
import { parseGoogleCalendarResult } from './onlineserviceshelper.js'

import { clientId, clientSecret } from './secrets.js'

const kIssuers = {
  google: {
    endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/calendar.events.readonly',
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
    clientId,
    clientSecret,
  },
}

class GoogleService {
  #auth
  constructor(config) {
    this.app = config.type
    this.name = 'Google'

    this.#auth = new OAuth2(
      kIssuers[this.app].endpoint,
      kIssuers[this.app].tokenEndpoint,
      kIssuers[this.app].scope,
      kIssuers[this.app].clientId,
      kIssuers[this.app].clientSecret,
      config?.auth
    )
  }

  getAuthUrl() {
    return this.#auth.getAuthUrl()
  }

  getRedirectBase() {
    return this.#auth.getRedirectBase()
  }

  async completeAuth(redirectUrl) {
    let token = await this.#auth.exchangeCodeFromUrl(redirectUrl)
    if (token) {
      OnlineServices.persist()
    }
    return token
  }

  async getToken() {
    let token = await this.#auth.getToken()
    if (token) {
      OnlineServices.persist()
    } else if (this.#auth.tokenError) {
      this.authError(`${this.name} OAuth token invalid.`)
    }
    return token
  }

  authError(error) {
    console.error(error, `Deleting ${this.name} service.`)
    OnlineServices.deleteService(this)
  }

  async getNextMeetings() {
    let token = await this.getToken()
    if (!token) {
      return []
    }

    let apiTarget = new URL(
      'https://www.googleapis.com/calendar/v3/users/me/calendarList'
    )

    let headers = {
      Authorization: `Bearer ${token}`,
    }

    let response
    let hadError = this.hasConnectionError
    try {
      response = await fetch(apiTarget, { headers })
      this.hasConnectionError = false
    } catch (ex) {
      this.hasConnectionError = true
      return null
    }

    let results = await response.json()

    if (!response.ok) {
      if (results?.error?.code == 401) {
        this.authError(results.error.message)
      } else {
        console.error('Invalid calendar list response', JSON.stringify(results))
      }
      return []
    }

    let calendarList = []
    for (let result of results.items) {
      if (!result.primary) {
        continue
      }
      let calendar = {}
      calendar.id = 'primary'
      calendar.backgroundColor = result.backgroundColor
      calendar.foregroundColor = result.foregroundColor
      calendarList.push(calendar)
    }

    let allEvents = new Map()
    await Promise.allSettled(
      calendarList.map(async (calendar) => {
        apiTarget = new URL(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
            calendar.id
          )}/events`
        )

        apiTarget.searchParams.set('orderBy', 'startTime')
        apiTarget.searchParams.set('singleEvents', 'true')
        let dayStart = new Date()
        dayStart.setHours(0, 0, 0, 0)
        apiTarget.searchParams.set('timeMin', dayStart.toISOString())
        let midnight = new Date()
        midnight.setHours(0, 0, 0, 0)
        // On Fridays fetch through Monday, otherwise just through tomorrow
        const daysAhead = midnight.getDay() === 5 ? 4 : 2
        midnight.setDate(midnight.getDate() + daysAhead)
        apiTarget.searchParams.set('timeMax', midnight.toISOString())

        headers = {
          Authorization: `Bearer ${token}`,
        }

        response = await fetch(apiTarget, { headers })
        results = await response.json()

        if (!response.ok) {
          if (results?.error?.code == 401) {
            this.authError(results.error.message)
          } else {
            console.error('Invalid calendar response', JSON.stringify(results))
          }
          return
        }

        for (let result of results.items) {
          try {
            if (
              calendar.id == 'primary' &&
              result.attendees &&
              !result.attendees.filter(
                (attendee) =>
                  attendee.self === true &&
                  attendee.responseStatus !== 'declined'
              ).length
            ) {
              continue
            }
            let event = parseGoogleCalendarResult(result, this.emailAddress)
            if (!event) {
              continue;
            }
            event.calendar = { id: calendar.id }
            event.serviceType = this.app
            event.serviceId = this.id
            if (allEvents.has(result.id)) {
              if (calendar.id == 'primary') {
                allEvents.set(result.id, event)
              }
            } else {
              allEvents.set(result.id, event)
            }
          } catch (e) {
            console.error(e)
          }
        }
      })
    )
    return Array.from(allEvents.values()).sort((a, b) => {
      if (a.startDate.getTime() == b.startDate.getTime()) {
        return a.endDate - a.startDate - (b.endDate - b.startDate)
      }
      return a.startDate - b.startDate
    })
  }

  async getUnreadCount() {
    let response;
    try {
      response = await fetch('https://mail.google.com/mail/feed/atom');
    } catch (ex) {
      return 0;
    }
    if (!response.ok) return 0;
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'text/xml');
    const fullcount = doc.querySelector('fullcount');
    return fullcount ? parseInt(fullcount.textContent, 10) : 0;
  }

  async getRecentDocs() {
    const token = await this.getToken();
    if (!token) return [];

    const apiTarget = new URL('https://www.googleapis.com/drive/v3/files');
    apiTarget.searchParams.set('orderBy', 'viewedByMeTime desc');
    apiTarget.searchParams.set('pageSize', '10');
    apiTarget.searchParams.set('fields', 'files(id,name,webViewLink,iconLink,mimeType,viewedByMeTime,modifiedTime,lastModifyingUser(displayName,me),sharedWithMeTime,sharingUser(displayName))');

    let response;
    try {
      response = await fetch(apiTarget, { headers: { Authorization: `Bearer ${token}` } });
    } catch (ex) {
      return [];
    }

    const results = await response.json();
    if (!response.ok) return [];

    return results.files.map(f => ({
      id: f.id,
      name: f.name,
      url: f.webViewLink,
      iconUrl: f.iconLink,
      mimeType: f.mimeType,
      viewedByMeTime: f.viewedByMeTime,
      modifiedTime: f.modifiedTime,
      lastModifyingUser: f.lastModifyingUser,
      sharedWithMeTime: f.sharedWithMeTime,
      sharingUser: f.sharingUser,
    }));
  }

  toJSON() {
    return {
      type: this.app,
      auth: this.#auth,
    }
  }
}

export const OnlineServices = {
  ServiceInstances: new Set(),

  async init() {
    let result = await browser.storage.local.get('onlineservices.config')
    if (!result) return
    let config = result['onlineservices.config']
    if (!config) return
    for (let service of config) {
      if (service.type.startsWith('google')) {
        this.ServiceInstances.add(new GoogleService(service))
      }
    }
  },

  getAllServices() {
    return [...this.ServiceInstances]
  },

  persist() {
    let config = JSON.stringify(Array.from(this.ServiceInstances))
    browser.storage.local.set({ 'onlineservices.config': JSON.parse(config) })
  },

  buildService(type) {
    if (type.startsWith('google')) {
      return new GoogleService({ type })
    }
    throw new Error(`Unknown service "${type}"`)
  },

  getAuthUrl(type) {
    return this.buildService(type).getAuthUrl()
  },

  getRedirectBase(type) {
    return this.buildService(type).getRedirectBase()
  },

  async completeAuth(type, redirectUrl) {
    const service = this.buildService(type)
    const token = await service.completeAuth(redirectUrl)
    if (!token) return null
    this.ServiceInstances.add(service)
    this.persist()
    return service
  },

  async deleteService(service) {
    try {
      await service.disconnect()
    } catch (e) {
      console.log(e)
    }
    this.ServiceInstances.delete(service)
    this.persist()
  },

  getServices(type) {
    return [...this.ServiceInstances].filter((service) =>
      service.app.startsWith(type)
    )
  },

  async fetchEvents() {
    let servicesData = this.getAllServices()
    if (!servicesData.length || this.alreadyFetching) {
      return
    }
    this.alreadyFetching = true

    let [eventResults, docResults, unreadResults] = await Promise.all([
      Promise.allSettled(servicesData.map(service => service.getNextMeetings())),
      Promise.allSettled(servicesData.map(service => service.getRecentDocs())),
      Promise.allSettled(servicesData.map(service => service.getUnreadCount())),
    ]);

    if (eventResults.some((r) => r.value != null)) {
      let events = eventResults.flatMap((r) => r.value || [])
      browser.storage.local.set({ events })
    }

    const recentDocs = docResults.flatMap((r) => r.value || []);
    if (recentDocs.length) {
      browser.storage.local.set({ recentDocs });

      // Update any pinned docs with fresh metadata
      const { pinnedDocs } = await browser.storage.local.get('pinnedDocs');
      if (pinnedDocs?.length) {
        const freshById = new Map(recentDocs.map(d => [d.id, d]));
        const updated = pinnedDocs.map(d => freshById.get(d.id) || d);
        browser.storage.local.set({ pinnedDocs: updated });
      }
    }

    const unreadCount = unreadResults.reduce((sum, r) => sum + (r.value || 0), 0);
    browser.storage.local.set({ unreadCount });

    this.alreadyFetching = false
  },
}
