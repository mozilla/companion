/**
 * Parse any links out of a service-specific calendar event.
 *
 * @param {Object} result
 *     This is the service-specific calendar event. Expected to come from the
 *     Microsoft or Google API directly and unmodified.
 * @returns {Array<Object>}
 *     Returns an array of links with keys `url`, `text` and `type`. Only `url`
 *     is required, `type` is undefined or "conferencing" for video call links.
 */
export function getLinkInfo(result: Object): Array<Object>;
/**
 * Parses a providers calendar event to get conferencing information.
 * Currently works with Google and Microsoft.
 * Only looks at conferencing data and location.
 * @param result Object Service specific response from server
 * @param links Array Links parsed out of the description
 * @returns { icon, name, url }
 */
export function getConferenceInfo(result: any, links: any): icon;
export function parseGoogleCalendarResult(result: any, primaryEmail: any): {
    originalId: any;
    id: any;
    summary: any;
    startDate: Date;
    endDate: Date;
    links: any[];
    conference: icon;
    attendees: any;
    organizer: any;
    creator: any;
    url: string;
    isAllDay: boolean;
};
export function parseMicrosoftCalendarResult(result: any): {
    originalId: any;
    id: any;
    summary: any;
    startDate: Date;
    endDate: Date;
    conference: icon;
    links: Object[];
    url: any;
    creator: any;
    organizer: {
        email: any;
        name: any;
        isSelf: boolean;
    };
    attendees: any;
    isAllDay: any;
};
/**
 * TODO: Remove this when making the final transition to workshop.
 *
 * Helper function that takes an event start and end date and outputs
 * whether or not it spans one day or more. An optional `upperBound`
 * (in hours) can be provided to specify a limit on how many hours
 * an event spans until it's considered an all day event.
 */
export function isAllDayEvent(startDate: any, endDate: any, upperBound?: number): boolean;
