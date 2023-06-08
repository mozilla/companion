/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { LitElement, html, css } from 'lit'
import { customElement, property } from 'lit/decorators.js'

@customElement('event-action')
export class EventAction extends LitElement {
  @property() icon = null
  @property() text = ''
  @property() onClick: null | (() => void) = null

  _onClick() {
    if (this.onClick && typeof this.onClick === 'function') {
      return this.onClick()
    }
  }

  render() {
    return html`<button
      class="action-button"
      @onclick=${this._onClick.bind(this)}
    >
      <div class="action-button-icon-container">
        <img
          class="action-button-icon"
          src=${this.icon || ''}
          role="presentation"
        />
      </div>
      <span class="action-button-label text-body-xs">${this.text}</span>
    </button>`
  }

  static styles = css`
    .action-button {
      appearance: none;
      background: none;
      border: none;
      padding: 0;
      margin: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      width: fit-content;
      max-width: 62px;
      cursor: pointer;
      color: black;
    }

    .action-button:focus-visible {
      outline: none;
    }

    .action-button:focus-visible > .action-button-icon-container {
      outline: 2px solid var(--text-color-light);
    }

    .action-button-icon-container {
      box-sizing: border-box;
      height: 32px;
      width: 32px;
      border-radius: 100px;
      background-color: var(--button-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0.5px solid transparent;
    }

    .action-button:hover > .action-button-icon-container {
      border-color: var(--text-color-light);
    }

    .action-button-icon {
      width: 15px;
      height: auto;
      -moz-context-properties: fill;
      fill: var(--button-text);
    }

    .action-button-label {
      margin-block-start: 6px;
      font-size: 0.8rem;
      text-align: center;
      color: var(--text-color-light);
    }

    .action-button:disabled .action-button-icon-container {
      opacity: 0.5;
    }
  `
}
