/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, css } from 'lit'
import { customElement, state } from 'lit/decorators.js'
import {classMap} from 'lit/directives/class-map.js';

@customElement('service-row')
export class ServiceRow extends LitElement {
  static styles = css`
  .service-wrapper {
    display: grid;
    grid-template-columns: 300px auto auto;
    grid-column-gap: 64px;
    align-items: center;
  }

  .service-info-container {
    display: flex;
  }

  .service-info-container > .service-icon {
    height: 32px;
    width: 32px;
    margin-inline-end: 16px;
    align-self: center;
  }

  .service-info {
    display: flex;
    flex-direction: column;
  }

  .service-status {
    justify-self: flex-start;
  }

  .service-labels,
  .status-text {
    color: var(--in-content-deemphasized-text);
    font-size: 85%;
    white-space: nowrap;
  }

  .status-connected::before {
    display: inline-block;
    content: "";
    padding: 2px;
    margin-inline-end: 4px;
    border-radius: 100%;
    background-color: #2ac3a2;
    height: 4px;
    width: 4px;
  }`

  @state() connected = false
  @state() type = this.getAttribute("type")

  connectedCallback() {
    super.connectedCallback()
    browser.storage.local.get("onlineservices.config").then((result: any) => {
      if (!result) {
        return;
      }
      const config = result["onlineservices.config"];
      for (const service of config) {
        if (service.type.startsWith(this.type)) {
          this.connected = true;
        }
      }
    });
    browser.storage.onChanged.addListener((changes: any) => {
      if ("onlineservices.config" in changes) {
        const config = changes["onlineservices.config"].newValue;
        if (config.filter((service: any) => service.type.startsWith(this.type)).length) {
          this.connected = true;
        } else {
          this.connected = false;
        }
      }
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback()
    // Remove listeners?
  }

  connectDisconnect(): void {
    browser.runtime.sendMessage({
      "command": this.connected ? "signout" : "signin",
      "service": this.type
    });
  }

  render() {
    const statusClass = { "status-connected": this.connected };
    return html`<div class="service-wrapper">
    <div class="service-info-container">
      <img class="service-icon" src="googleAccount.png" />
      <div class="service-info">
        <div class="service-name">
          ${browser.i18n.getMessage("service-name." + this.type)}
        </div>
        <div class="service-labels">
          ${browser.i18n.getMessage("service-labels." + this.type)}
        </div>
      </div>
    </div>
    <div class="service-status">
      <div class="status-text" data-l10n-id="preferences-services-status">
        STATUS
      </div>
      <div class="status-text ${classMap(statusClass)}">
      ${browser.i18n.getMessage( this.connected ? "connected" : "disconnected")}
      </div>
    </div>
    <button @click=${() =>
      (this.connectDisconnect())}
    >${browser.i18n.getMessage( this.connected ? "disconnect" : "connect")}
    </button>
  </div>`;
  }
}
