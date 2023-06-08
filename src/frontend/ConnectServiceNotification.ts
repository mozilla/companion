/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'

@customElement('connect-service-notification')
export class ConnectServiceNotification extends LitElement {
  static styles = css`
    .card {
      box-shadow: -1px 2px 4px rgba(122, 94, 63, 0.08);
      padding-inline: 16px;
      padding-block: 12px;
      margin: 16px;
      border-radius: var(--border-radius);
      display: flex;
      align-items: center;
      gap: 8px;
      box-sizing: border-box;
      background-color: var(--card-background);
    }

    @media (max-width: 400px) {
      .card {
        flex-direction: column;
        justify-content: center;
        text-align: center;
      }
      .notification-content .notification-heading {
        text-align: center;
        justify-content: center;
      }
    }

    button {
      margin: 0 !important;
      flex-shrink: 0;
    }

    .notification-icon-container {
      height: 32px;
      width: 32px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      box-sizing: border-box;
      flex-shrink: 0;
    }

    .notification-icon {
      width: 20px;
      height: 20px;
    }

    .notification-content {
      flex-grow: 1;
    }

    .notification-heading {
      margin: 0;
      margin-block-end: 4px;
      word-break: break-word;
      display: flex;
      align-items: center;
      justify-content: flex-start;
    }

    .notification-description {
      color: var(--pine-text-color-secondary);
      margin: 0;
    }
    .notification-action-wrap {
      display: flex;
      flex-flow: column nowrap;
      justify-content: center;
      align-items: center;
    }
  `

  @state() connected = false
  @state() type = this.getAttribute('type')

  connect(): void {
    browser.runtime.sendMessage({
      command: 'signin',
      service: this.type,
    })
  }

  render() {
    return html`
      <div class="card card-no-hover">
        <div class="notification-icon-container">
          <img class="notification-icon" src="googleAccount.png" />
        </div>
        <div class="notification-content">
          <h2 class="notification-heading text-body-l-med">
            ${browser.i18n.getMessage('service-name.google')}
          </h2>
          <p class="notification-description text-body-s">
            ${browser.i18n.getMessage('service-labels.' + this.type)}
          </p>
        </div>
        <div class="notification-action-wrap">
          <button @click=${() => this.connect()}>
            ${browser.i18n.getMessage('connect')}
          </button>
        </div>
      </div>
    `
  }
}
