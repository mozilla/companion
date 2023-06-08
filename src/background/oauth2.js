/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// This is used for Microsoft OAuth integration. Microsoft requires the Origin
// header to be correct, or to be missing. There's no way to disable the Origin
// header using `fetch()` (at best it can be empty, which doesn't work), so we
// use XHR instead.
function promiseXHR(data) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.responseType = "json";

    const method = data.method || "GET";
    let url = data.url;
    const body = data.body || null;

    xhr.addEventListener(
      "loadend",
      function(event) {
        resolve({ status: xhr.status, json: xhr.response });
      },
      { once: true }
    );

    xhr.open(method, url);

    xhr.send(body);
  });
}

export class OAuth2 {
  /**
   * Constructor for the OAuth2 object.
   *
   * @constructor
   * @param {string} authorizationEndpoint - The authorization endpoint as
   *   defined by RFC 6749 Section 3.1.
   * @param {string} tokenEndpoint - The token endpoint as defined by
   *   RFC 6749 Section 3.2.
   * @param {?string} scope - The scope as specified by RFC 6749 Section 3.3.
   *   Will not be included in the requests if falsy.
   * @param {string} clientId - The client_id as specified by RFC 6749 Section
   *   2.3.1.
   * @param {string} [clientSecret=null] - The client_secret as specified in
   *    RFC 6749 section 2.3.1. Will not be included in the requests if null.
   */
  constructor(
    authorizationEndpoint,
    tokenEndpoint,
    scope,
    clientId,
    clientSecret = null,
    config = null,
  ) {
    this.authorizationEndpoint = authorizationEndpoint;
    this.tokenEndpoint = tokenEndpoint;
    this.scope = scope;
    this.clientId = clientId;
    this.consumerSecret = clientSecret;

    if (config) {
      this.deserialize(config);
    }
  }

  clientId = null;
  consumerSecret = null;
  subdomain = new URL(browser.identity.getRedirectURL("oauth2")).host.split(".")[0];

  redirectionEndpoint = `http://127.0.0.1/mozoauth2/${this.subdomain}`;
  scope = null;

  accessToken = null;
  refreshToken = null;
  tokenExpires = null;
  tokenError = false;

  getTokenPromise = null;

  async internalGetToken() {
    // If we have a valid access token and it hasn't expired, return it.
    if (this.accessToken && this.tokenExpires > Date.now()) {
      console.debug("Have accessToken and it's valid");
      return this.accessToken;
    }

    // Our access token has expired, so we need to get a new one.
    if (this.refreshToken) {
      console.debug("accessToken has expired, requesting a new one.");
      // This could return null if we have an invalid_grant.
      // Error should be handled by the caller.
      return this.requestAccessToken();
    }

    return null;
  }

  async getToken() {
    if (!this.getTokenPromise) {
      this.getTokenPromise = this.internalGetToken().finally(
        () => (this.getTokenPromise = null)
      );
    }

    return this.getTokenPromise;
  }
  async connect() {
    let params = new URLSearchParams({
        client_id: this.clientId,
        response_type: 'code',
        access_type: 'offline',
        prompt: 'select_account',
        redirect_uri: this.redirectionEndpoint,
        scope: this.scope.join(' '),
      });
      let responseUrl = await browser.identity.launchWebAuthFlow({ url: `${this.authorizationEndpoint}?${params.toString()}`, interactive: true });
      const url = new URL(responseUrl);
      const urlParams = new URLSearchParams(url.search.slice(1));
      let result = Object.fromEntries(urlParams.entries());
      let code = result.code;
      let accessToken = await this.requestAccessToken(code);
      return accessToken;
  }


  toJSON() {
    if (!this.refreshToken) {
      return null;
    }

    return {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpires: this.tokenExpires,
    };
  }

  deserialize(data) {
    this.accessToken = data.accessToken;
    this.refreshToken = data.refreshToken;
    this.tokenExpires = data.tokenExpires;
  }

  async requestAccessToken(aCode) {
    // @see RFC 6749 section 4.1.3. Access Token Request
    // @see RFC 6749 section 6. Refreshing an Access Token

    let data = new URLSearchParams();
    data.append("client_id", this.clientId);
    if (this.consumerSecret !== null) {
      // Section 2.3.1. of RFC 6749 states that empty secrets MAY be omitted
      // by the client. This OAuth implementation delegates this decision to
      // the caller: If the secret is null, it will be omitted.
      data.append("client_secret", this.consumerSecret);
    }

    if (!aCode) {
      data.append("grant_type", "refresh_token");
      data.append("refresh_token", this.refreshToken);
    } else {
      data.append("grant_type", "authorization_code");
      data.append("code", aCode);
      data.append("redirect_uri", this.redirectionEndpoint);
    }

    let response = await promiseXHR({
      url: this.tokenEndpoint,
      method: "POST",
      body: data,
    });

    let result = response.json;

    if (result && "error" in result) {
      // RFC 6749 section 5.2. Error Response

      // Typically in production this would be {"error": "invalid_grant"}.
      // That is, the token expired or was revoked (user changed password?).
      // Reset the tokens we have and call success so that the auth flow
      // will be re-triggered.
      this.accessToken = null;
      this.refreshToken = null;
      this.tokenError = true;

      let resultStr = JSON.stringify(result, null, 2);
      console.error(
        `The authorization server returned an error response: ${resultStr}`
      );

      // We return instead of throw here so we can handle it as a null token.
      return null;
    }

    console.debug("New accessToken received.");

    this.tokenError = false;

    // RFC 6749 section 5.1. Successful Response
    this.accessToken = result.access_token;
    if ("refresh_token" in result) {
      this.refreshToken = result.refresh_token;
    }

    if ("expires_in" in result) {
      this.tokenExpires = Date.now() + result.expires_in * 1000;
    } else {
      this.tokenExpires = Number.MAX_VALUE;
    }

    return this.accessToken;
  }
}
