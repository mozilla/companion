/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html, css, LitElement } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

@customElement('connectable-service-router')
export class ConnectableServiceRouter extends LitElement {
  @state() mode: 'service-login' | 'service-run' = 'service-login'
  @property() type: string

  connectedCallback() {
    super.connectedCallback()
    browser.storage.local.get('onlineservices.config').then((result: any) => {
      if (!result) {
        return
      }
      const config = result['onlineservices.config']
      for (const service of config) {
        if (service.type.startsWith(this.type)) {
          this.mode = 'service-run'
        }
      }
    })
    browser.storage.onChanged.addListener((changes: any) => {
      if ('onlineservices.config' in changes) {
        const config = changes['onlineservices.config'].newValue
        if (
          config.filter((service: any) => service.type.startsWith(this.type))
            .length
        ) {
          this.mode = 'service-run'
        } else {
          this.mode = 'service-login'
        }
      }
    })
  }

  disconnect(): void {
    browser.runtime.sendMessage({
      command: 'signout',
      service: 'google',
    })
  }

  render() {
    switch (this.mode) {
      case 'service-run':
        return html`<slot name="run"></slot>
        <slot name="disconnect"></slot>
        <div class="disconnect">
        <button @click=${() => this.disconnect()}>
          ${browser.i18n.getMessage('disconnect')}
        </button>
        </div>`
      case 'service-login':
      default:
        return html`<slot name="login"></slot>
          <div class="login-guide">Connect service to continue</div>`
    }
  }

  static styles = css`
    .login-guide {
      margin: 12px;
      text-align: center;
    }
    .disconnect {
      position: fixed;
      bottom: 0;
      width: 100%;
      text-align: center;
      padding-bottom: 10px;
    }
  `
}
