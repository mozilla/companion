/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, css, nothing } from 'lit'
import { repeat } from 'lit/directives/repeat.js'
import { customElement, state } from 'lit/decorators.js'
import { DateTime } from 'luxon'
import { Event, isHappeningToday } from '../../background/event'
import './CalendarEvent'

@customElement('calendar-widget')
export class CalendarWidget extends LitElement {
  private alarmName = 'refresh-ui'
  // TODO actually check if we're connected and expose a way to connect if not
  @state() authenticated = true
  @state() error: Error | null = null
  @state()
  events: Event[] = []
  @state() showAllEvents = false
  @state() backendStatus = 'idle'
  @state() now: Date

  constructor() {
    super()
    this.now = new Date()
  }

  connectedCallback() {
    super.connectedCallback()
    browser.storage.onChanged.addListener(this.syncStorage.bind(this))
    this.syncStorage()
    this.connectClock()
  }

  /**
   * The "Now" listing is based on an event's proximity to the current time.
   * Rather than rely on implicit state from calling Date.now(),
   * it seems more idiomatic to express "now" as explicit state for
   * this component.
   *
   * connectClock() is how we synchronize this value with the browser clock,
   * once per minute.
   */
  private connectClock() {
    browser.alarms.clear(this.alarmName).then(() => {
      browser.alarms.create(this.alarmName, {
        periodInMinutes: 1,
      })
      browser.alarms.onAlarm.addListener(this.alarmHandler.bind(this))
    })
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    browser.storage.onChanged.removeListener(this.syncStorage.bind(this))
    browser.alarms.onAlarm.removeListener(this.alarmHandler.bind(this))
  }

  async alarmHandler(alarm: browser.alarms.Alarm) {
    if (alarm.name !== this.alarmName) return
    this.now = new Date()
  }

  async syncStorage() {
    const eventData = await browser.storage.local.get('events')
    const backendStatus = await browser.storage.local.get('status')
    this.events = eventData.events
    this.backendStatus = backendStatus.status
  }

  shouldShowEvent(event: Event) {
    if (this.showAllEvents)
      return isHappeningToday(event.startDate, event.endDate)

    if (event.isAllDay) return false

    const now = DateTime.fromJSDate(this.now)
    const start = DateTime.fromJSDate(event.startDate)
    const end = DateTime.fromJSDate(event.endDate)

    const isOver = end.diff(now).as('minutes') < 0
    if (isOver) return false

    const startsIn = start.diff(now).as('minutes')
    if (startsIn > 30) return false

    return true
  }

  eventList() {
    return repeat(
      this.events.filter((e) => this.shouldShowEvent(e)),
      (event) => event.id,
      (event) => html` <calendar-event .data=${event}></calendar-event>`
    )
  }

  eventPlaceholder() {
    return html`<div class="event-placeholder">No events to show.</div>`
  }

  render() {
    if (this.error) {
      return html`<main>Error</main>`
    } else if (this.authenticated) {
      return html` <main>
        <div class="card button-group">
          <button title="Show events happening soon" ?disabled=${!this
            .showAllEvents} @click=${() =>
        (this.showAllEvents = false)}>Now</button>
        <div class="flex-spacer"></div>
          <button title="Show all events for today" ?disabled=${
            this.showAllEvents
          } @click=${() => (this.showAllEvents = true)}>Today</button>
          </label>
        </div>
        <div class="card">
          ${
            this.events && this.events.length > 0
              ? this.eventList()
              : this.eventPlaceholder()
          }
        </div>
        ${
          this.backendStatus === 'fetching'
            ? html`<aside class="status-indicator">
                <div class="loading-spinner"></div>
              </aside>`
            : nothing
        }
      </main>`
    } else {
      // note: this is currently unreachable
      return html`<main>
        Not authenticated, connect service via extension settings
      </main>`
    }
  }

  static styles = css`
    .card {
      box-shadow: 0 2px 6px 0 rgba(58, 57, 68, 0.2);
      padding: 0;
      margin: 1rem;
      border: none;
      border-radius: var(--border-radius);
      background-color: var(--card-background);
    }

    .button-group {
      background-color: var(--card-background-transparent);
      padding: 5px;
      display: flex;
      justify-content: stretch;
    }
    .button-group button {
      border: none;
      box-shadow: none;
      border-radius: 18px;
      display: block;
      flex-grow: 1;
      font-size: 1rem;
      padding: 5px;
      background-color: transparent;
      cursor: pointer;
      color: var(--button-text);
    }
    .button-group button:disabled {
      background-color: var(--card-background);
    }
    .button-group button:enabled:hover {
      background-color: var(--card-background-transparent);
    }
    .flex-spacer {
      width: 5px;
    }
    .event-placeholder {
      padding: 5px;
      text-align: center;
    }
    .status-indicator {
      position: fixed;
      bottom: 0;
      padding: 10px 0;
      width: 100%;
      display: flex;
      place-content: center;
    }
    .loading-spinner {
      border: 3px solid #fbb57f;
      border-radius: 50%;
      width: 12px;
      height: 12px;
      border-right-color: transparent;
      animation: rotateCW 1s linear infinite;
      display: inline-block;
    }
    @keyframes rotateCW {
      from {
        transform: rotateZ(0deg);
      }
      to {
        transform: rotateZ(360deg);
      }
    }
  `
}
