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
    constructor(authorizationEndpoint: string, tokenEndpoint: string, scope: string | null, clientId: string, clientSecret?: string | undefined, config?: null);
    authorizationEndpoint: string;
    tokenEndpoint: string;
    scope: null;
    clientId: null;
    consumerSecret: null;
    subdomain: string;
    redirectionEndpoint: string;
    accessToken: null;
    refreshToken: null;
    tokenExpires: null;
    tokenError: boolean;
    getTokenPromise: null;
    internalGetToken(): Promise<null>;
    getToken(): Promise<null>;
    connect(): Promise<null>;
    toJSON(): {
        accessToken: null;
        refreshToken: never;
        tokenExpires: null;
    } | null;
    deserialize(data: any): void;
    requestAccessToken(aCode: any): Promise<null>;
}
