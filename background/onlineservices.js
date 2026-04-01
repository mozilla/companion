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

  async connect() {
    let token = await this.#auth.connect()
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
      if (result.hidden || !result.selected) {
        continue
      }
      let calendar = {}
      calendar.id = result.primary ? 'primary' : result.id
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
        midnight.setHours(24, 0, 0, 0)
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

  async createService(type) {
    let service
    if (type.startsWith('google')) {
      service = new GoogleService({ type })
    } else {
      throw new Error(`Unknown service "${type}"`)
    }

    let token = await service.connect()
    if (!token) {
      return null
    }

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

    let meetingResults = servicesData.map(service => service.getNextMeetings())
    let eventResults = await Promise.allSettled(meetingResults)

    if (eventResults.some((r) => r.value != null)) {
      let events = eventResults.flatMap((r) => r.value || [])
      browser.storage.local.set({ events })
    }

    this.alreadyFetching = false
  },
}
