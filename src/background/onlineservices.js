/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { OAuth2 } from './oauth2.js'
import { parseGoogleCalendarResult } from './onlineserviceshelper.js'

const clientId = 'GOOGLE_CLIENT_ID'
const clientSecret = 'GOOGLE_CLIENT_SECRET'

const kIssuers = {
  google: {
    endpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenEndpoint: 'https://oauth2.googleapis.com/token',
    scope: [
      // For getting the email address
      'https://www.googleapis.com/auth/userinfo.email',
      // For getting calendar events
      'https://www.googleapis.com/auth/calendar.events.readonly',
      // For getting the list of calendars
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      // For getting titles of documents
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
    clientId,
    clientSecret,
  },
}

class GoogleService {
  app
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
    // This will force a new OAuth login if not logged in or the token
    // has expired.
    let token = await this.#auth.connect()
    if (token) {
      OnlineServices.persist()
    }
    return token
  }

  notifyListeners(eventName, data) {
    // Need to update for WebExtension so errors are proessed
  }

  async getToken() {
    let token = await this.#auth.getToken()
    if (token) {
      OnlineServices.persist()
    } else if (this.#auth.tokenError) {
      // A token error means we've lost access.
      this.authError(`${this.name} OAuth token invalid.`)
    }
    return token
  }

  authError(error) {
    console.error(error, `Deleting ${this.name} service.`)
    OnlineServices.deleteService(this)
    // Send message so sidebar can show error message
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
      response = await fetch(apiTarget, {
        headers,
      })
      this.hasConnectionError = false
      if (hadError) {
        this.notifyListeners('status', { status: 'connected' })
      }
    } catch (ex) {
      this.hasConnectionError = true
      if (!hadError) {
        this.notifyListeners('status', { status: 'error' })
      }
      // If we fail here, it's probably a network error.
      // Return null so we can detect this situation.
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

    // console.debug(JSON.stringify(results))

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
        // If we want to reduce the window, we can just make
        // timeMax an hour from now.
        let midnight = new Date()
        midnight.setHours(24, 0, 0, 0)
        apiTarget.searchParams.set('timeMax', midnight.toISOString())

        headers = {
          Authorization: `Bearer ${token}`,
        }

        response = await fetch(apiTarget, {
          headers,
        })

        results = await response.json()

        if (!response.ok) {
          if (results?.error?.code == 401) {
            this.authError(results.error.message)
          } else {
            console.error('Invalid calendar response', JSON.stringify(results))
          }
          return
        }

        // console.debug(JSON.stringify(results))

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
              // Allow parseGoogleCalendarResult to throw out certain events
              continue;
            }
            event.calendar = {
              id: calendar.id,
            }
            event.serviceType = this.app
            event.serviceId = this.id
            if (allEvents.has(result.id)) {
              // If an event is duplicated, use
              // the primary calendar
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
    if (!result) {
      return
    }
    let config = result['onlineservices.config']
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
      // Try to clean up our token, this could fail if the user already revoked
      // the credentials with the service.
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

    let meetingResults = new Array(servicesData.length)
    let i = 0
    for (let service of servicesData) {
      meetingResults[i] = service.getNextMeetings()
      i++
    }

    let eventResults = await Promise.allSettled(meetingResults)

    // Only update the events if at least one service successfully responds.
    // If all services failed then there was likely a network error.
    if (eventResults.some((r) => r.value != null)) {
      let events = eventResults.flatMap((r) => r.value || [])
      // Set events in preferences
      browser.storage.local.set({ events })
      //      this.setCache(events);
      //      Services.obs.notifyObservers(events, "companion-services-refresh");
    }

    this.alreadyFetching = false
  },
}
