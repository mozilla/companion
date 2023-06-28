/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, css, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { DateTime } from 'luxon'
import { Event, isHappeningToday, EventLink } from '../../background/event'
import './EventAction'

@customElement('calendar-event')
export class CalendarEvent extends LitElement {
  @property() data!: Event
  @state() view: 'compact' | 'expanded' = 'compact'

  debug() {
    console.debug(this.data)
  }


  openUrl(url: string) {
    browser.tabs.query({url}).then((tabs) => {
      if (tabs.length && tabs[0].id) {
        browser.tabs.update(tabs[0].id, {active: true});
      } else {
        window.open(url)
      }
    });
  }

  getLinkName(link: EventLink) {
    if (link.text && link.text.length > 0) return link.text
    const linkUrlParts = new URL(link.url)
    return linkUrlParts.host
  }

  private getNiceDateRange() {
    const lxStart = DateTime.fromJSDate(this.data.startDate)
    const lxEnd = DateTime.fromJSDate(this.data.endDate)

    if (
      isHappeningToday(this.data.startDate) &&
      isHappeningToday(this.data.endDate)
    ) {
      if (this.data.isAllDay) {
        return 'All day'
      }

      // "9:00 AM–5:00 PM"
      return [
        lxStart.toLocaleString(DateTime.TIME_SIMPLE),
        lxEnd.toLocaleString(DateTime.TIME_SIMPLE),
      ].join('–')
    }

    if (isHappeningToday(this.data.startDate)) {
      // "Starts at 9:00 AM"
      return `Starts today at ${lxStart.toLocaleString(DateTime.TIME_SIMPLE)}`
    }

    if (isHappeningToday(this.data.endDate)) {
      // "Starts at 5:00 PM"
      return `Ends today at ${lxEnd.toLocaleString(DateTime.TIME_SIMPLE)}`
    }

    if (lxStart.hasSame(lxEnd, 'day')) {
      if (this.data.isAllDay) {
        // "Jan 1"
        return `${lxStart.monthShort} ${lxStart.day}`
      }

      // "Jan 1 9:00 AM–5:00 PM"
      return `${lxStart.monthShort} ${lxStart.day} ${lxStart.toLocaleString(
        DateTime.TIME_SIMPLE
      )}–${lxEnd.toLocaleString(DateTime.TIME_SIMPLE)}`
    }

    if (this.data.isAllDay) {
      // "Jan 1–Jan 15"
      return [
        `${lxStart.monthShort} ${lxStart.day}`,
        `${lxEnd.monthShort} ${lxEnd.day}`,
      ].join('–')
    }

    // "Jan 1 9:00 AM–Jan 15 5:00 PM"
    return [
      `${lxStart.monthShort} ${lxStart.day} ${lxStart.toLocaleString(
        DateTime.TIME_SIMPLE
      )}`,
      `${lxEnd.monthShort} ${lxEnd.day} ${lxEnd.toLocaleString(
        DateTime.TIME_SIMPLE
      )}`,
    ].join('–')
  }

  private _eventHeader() {
    return html`
      <header class="event-header">
        <h3 class="event-title" title="${this.data.summary}">
          ${this.data.summary}
        </h3>
        <em>${this.getNiceDateRange()}</em>
        <em>${this.data.creator.email}</em>
      </header>
    `
  }

  private _meetingIconUrl() {
    // path.basename crashes the component for some reason
    const parts = this.data.conference?.icon.split('/')
    if (!parts) return ''
    return parts[parts.length - 1]
  }

  private _conferenceDetails() {
    return html`<div class="event-conferencedetails">
      <a
        class="join-meeting-link"
        .onclick=${async () => {
          this.openUrl(this.data.conference!.url);
        }}
        >Join meeting <img src="${this._meetingIconUrl()}"
      /></a>
    </div>`
  }

  private _eventLinks() {
    return html`
      <ul class="event-links">
        ${this.data.links.map((link) => {
          return html`<li>
            <a
              .onclick=${async () => {
                this.openUrl(link.url);
              }}
              >↗&nbsp;${this.getLinkName(link)}</a
            >
          </li>`
        })}
      </ul>
    `
  }

  private _eventActions() {
    return html`<div class="event-actions">
      ${this.data.conference
        ? html`<event-action
            .onclick=${async () => {
              await navigator.clipboard.writeText(this.data.conference!.url)
            }}
            text="Copy invite link"
            icon="chrome://global/skin/icons/link.svg"
          ></event-action>`
        : nothing}
      ${this.data.attendees && this.data.attendees.length > 0
        ? html`<event-action
            .onclick=${() => {
              window.open(
                `mailto:${this.data.attendees.reduce((emailList, attendee) => {
                  // todo filter out self
                  return [emailList, attendee.email].join(',')
                }, '')}`
              )
            }}
            text="E-mail attendees"
            icon="chrome://global/skin/icons/lightbulb.svg"
          ></event-action>`
        : nothing}
      <event-action
        .onclick=${() => {
          window.open(this.data.url)
        }}
        text="Open in calendar"
        icon="chrome://global/skin/icons/open-in-new.svg"
      ></event-action>
    </div>`
  }

  private _debugButton() {
    return html`<button @click=${this.debug}>Log data to console</button>`
  }

  render() {
    return html`
      <aside class="calendar-event">
        <div class="event-header-wrap">
          ${this._eventHeader()}
          ${this.view === 'compact'
            ? html`<button
                class="event-view-toggle"
                @click=${() => (this.view = 'expanded')}
                title="Expand view"
              >
                <img alt="downward pointing arrow" src="arrow-down.svg" />
              </button>`
            : html`<button
                class="event-view-toggle"
                @click=${() => (this.view = 'compact')}
                title="Collapse view"
              >
                <img alt="upward pointing arrow" src="arrow-up.svg" />
              </button>`}
        </div>
        ${this.data.conference ? this._conferenceDetails() : nothing}
        ${this.view === 'expanded' ? this._eventActions() : nothing}
        ${this.data.links && this.data.links.length > 0
          ? this._eventLinks()
          : nothing}
        ${
          //this._debugButton() ||
          nothing
        }
      </aside>
    `
  }

  static styles = css`
    .calendar-event {
      border-bottom: 1px solid var(--event-separator-color);
      padding: 10px;
    }
    .event-header-wrap {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .event-view-toggle {
      border-radius: 50%;
      margin-left: 5px;
      line-height: 1;
      cursor: pointer;
      width: 20px;
      height: 20px;
      box-shadow: none;
      border: none;
      flex-shrink: 0;
      flex-grow: 0;
    }
    .event-view-toggle > img {
      width: 100%;
      height: 100%;
    }
    .event-header {
      margin: 0.5rem 0;
      overflow: hidden;
    }
    .event-header > * {
      display: block;
    }
    .event-title {
      margin: 0;
      font-size: 1rem;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .event-links {
      list-style: none;
      display: flex;
      flex-flow: row wrap;
      margin: 0;
      padding: 1rem 0 0.5rem 0;
      cursor: pointer;
    }
    .event-links li {
      background-color: var(--button-bg);
      border-radius: 16px;
      padding: 4px 8px;
      font-size: 1rem;
      line-height: 1;
      max-width: 10em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .event-links a {
      text-decoration: none;
    }
    .join-meeting-link {
      display: block;
      appearance: none;
      background-color: rgb(132, 91, 220);
      border-bottom-left-radius: 4px;
      border-bottom-right-radius: 4px;
      border-top-left-radius: 4px;
      border-top-right-radius: 4px;
      color: rgb(251, 251, 254);
      cursor: pointer;
      flex-grow: 1;
      font-family: 'Inter', system-ui;
      font-size: 12.1875px;
      font-weight: 600;
      margin-block-start: 12px;
      margin-bottom: 4px;
      margin-inline-end: 0px;
      margin-inline-start: 0px;
      margin-left: 0px;
      margin-right: 0px;
      margin-top: 12px;
      min-height: auto;
      padding-bottom: 7px;
      padding-left: 15px;
      padding-right: 15px;
      padding-top: 7px;
      text-align: center;
      text-decoration-color: rgb(251, 251, 254);
      text-decoration-line: none;
      text-decoration-style: solid;
      text-decoration-thickness: auto;
      white-space: nowrap;
    }

    .join-meeting-link img {
      vertical-align: bottom;
      height: 16px;
      width: 16px;
    }

    .event-actions {
      display: flex;
      padding-top: 1rem;
      justify-content: center;
    }
  `
}
