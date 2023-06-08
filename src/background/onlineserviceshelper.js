/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const URL_REGEX = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[A-Z0-9+&@#/%=~_|$])/gim;
  
const ONE_HOUR_MS = 60 * 60 * 1000;
  
// Some common links provide nothing useful in the companion,
// so we just ignore them.
// We also ignore some patterns (currently only protocols)
let patternsToIgnore = [
  /^tel:/,
  /^https:\/\/aka.ms\/JoinTeamsMeeting/,
  /^https:\/\/www.microsoft.com\/microsoft-teams\/join-a-meeting/,
  /^https:\/\/www.microsoft.com\/.*\/microsoft-teams\/download-app/,
];
  
function processLink(url, text) {
  try {
    url = new URL(url);
  } catch (e) {
    // We might have URLS without protocols.
    // Just add https://
    try {
      url = new URL(`https://${url}`);
    } catch (e2) {
      // This link doesn't appear to be valid, could be totally wrong, or a just
      // a path (like "/foo") but we don't have a domain. Ignore it.
      return null;
    }
  }
  for (let pattern of patternsToIgnore) {
    if (url.href.match(pattern)) {
      return null;
    }
  }
  // Tag conferencing URLs in case we need them, but just return.
  if (conferencingInfo.find(info => url.host.endsWith(info.domain))) {
    return {
      url: url.href,
      type: "conferencing",
    };
  }
  let link = {};
  link.url = url.href;

  if (text && url.href != text) {
    link.text = text;
  }
  return link;
}

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
export function getLinkInfo(result) {
  let doc;
  let links = new Map();
  let anchorText = new Set();
  let parser = new DOMParser();
  let description;
  if ("body" in result) {
    // This is Microsoft specific
    description = result.body.content;
  } else {
    description = result.description;
  }
  // Descriptions from both providers use HTML entities in some URLs.
  // The only ones that seem to affect us are &amp; and &nbsp;
  // We also remove wordbreak tags as Google inserts them in URLs.
  description = description
    ?.replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<wbr>/g, "");
  doc = parser.parseFromString(description, "text/html");
  let anchors = doc.getElementsByTagName("a");
  if (anchors.length) {
    for (let anchor of anchors) {
      // We explicitly ignore anchors with empty text content
      // as they wouldn't show up in the calendar UI anyway.
      if (!anchor.href || anchor.textContent === "") {
        continue;
      }
      let link = processLink(anchor.href, anchor.textContent);
      if (link && link.text !== "") {
        links.set(link.url, link);
        anchorText.add(link.text);
      }
    }
  }
  // We only parse the description as text for Google events
  if ("description" in result) {
    let descriptionURLs = description?.match(URL_REGEX);
    if (descriptionURLs?.length) {
      for (let descriptionURL of descriptionURLs) {
        // skip processing if URL is the textContent of an anchor element
        if (anchorText.has(descriptionURL)) {
          continue;
        }

        let descriptionLink = processLink(descriptionURL);
        if (
          !descriptionLink ||
          descriptionLink.text === "" ||
          links.has(descriptionLink.url)
        ) {
          continue;
        }
        links.set(descriptionLink.url, descriptionLink);
      }
    }
  }

  return [...links.values()];
}

function getAttachmentInfo(data) {
  const attachments = new Map();
  if (data?.length) {
    for (const item of data) {
      let attachment = processLink(item.fileUrl, item.title);
      if (attachment?.text && !attachments.has(attachment.url)) {
        attachments.set(attachment.url, attachment);
      }
    }
  }
  return [...attachments.values()];
}

const conferencingInfo = [
  {
    name: "Zoom",
    domain: "zoom.us",
    icon: "chrome://browser/content/companion/zoom.svg",
  },
  {
    name: "Teams",
    domain: "teams.microsoft.com",
    icon: "chrome://browser/content/companion/teams.png",
  },
  {
    name: "Meet",
    domain: "meet.google.com",
    icon: "chrome://browser/content/companion/meet.png",
  },
  {
    name: "Jitsi",
    domain: "meet.jit.si",
    icon: "chrome://browser/content/companion/jitsi.png",
  },
  {
    name: "GoToMeeting",
    domain: ".gotomeeting.com",
    icon: "chrome://browser/content/companion/gotomeeting.png",
  },
  {
    name: "WebEx",
    domain: ".webex.com",
    icon: "chrome://browser/content/companion/webex.png",
  },
  {
    name: "Skype",
    domain: ".skype.com",
    icon: "chrome://browser/content/companion/skype.svg",
  },
];

function getConferencingDetails(url) {
  try {
    url = new URL(url);
  } catch (e) {
    url = new URL(`https://${url}`);
  }

  let domainInfo = conferencingInfo.find(info =>
    url.host.endsWith(info.domain)
  );
  if (domainInfo) {
    return {
      icon: domainInfo.icon,
      name: domainInfo.name,
      url: url.href,
    };
  }
  return null;
}

/**
 * Parses a providers calendar event to get conferencing information.
 * Currently works with Google and Microsoft.
 * Only looks at conferencing data and location.
 * @param result Object Service specific response from server
 * @param links Array Links parsed out of the description
 * @returns { icon, name, url }
 */
export function getConferenceInfo(result, links) {
  // conferenceData is a Google specific field
  if (result.conferenceData?.conferenceSolution) {
    let locationURL;

    for (let entry of result.conferenceData.entryPoints) {
      if (entry.entryPointType == "video") {
        locationURL = new URL(entry.uri);
        break;
      }
    }

    let conferencingDetails = getConferencingDetails(locationURL);
    return (
      conferencingDetails || {
        icon: result.conferenceData.conferenceSolution.iconUri,
        name: result.conferenceData.conferenceSolution.name,
        url: locationURL.href,
      }
    );
  }
  // onlineMeeting is a Microsoft specific field
  if (result.onlineMeeting) {
    let locationURL = new URL(result.onlineMeeting.joinUrl);
    return getConferencingDetails(locationURL);
  }
  // Check to see if location contains a conferencing URL
  if (result.location) {
    try {
      let locationURL;
      if (result.location.displayName) {
        // Microsoft
        locationURL = new URL(result.location.displayName);
      } else {
        // Google
        // Location can be multiple entries, split by a comma.
        // Look for a URL
        let locations = result.location.split(",");
        for (let location of locations) {
          try {
            locationURL = new URL(location);
            break;
          } catch (e) {
            // Move on to the next one if it fails.
          }
        }
      }
      return getConferencingDetails(locationURL);
    } catch (e) {
      // Location didn't contain a URL
    }
  }
  // If we didn't get any conferencing data in server response, see if there
  // is a link in the document that has conferencing. We grab the first one.
  let conferenceLink = links.find(link => link.type == "conferencing");
  if (conferenceLink) {
    return getConferencingDetails(conferenceLink.url);
  }
  return null;
}

export function parseGoogleCalendarResult(result, primaryEmail) {
  let event = {};
  // Ignore all day events
  if (!result.start?.dateTime || !result.start?.dateTime) {
    return null;
  }
  let start = result.start?.dateTime;
  let end = result.end?.dateTime;

  event.originalId = event.id = result.id;
  event.summary = result.summary;

  event.startDate = new Date(start);
  event.endDate = new Date(end);
  let links = getLinkInfo(result);
  let attachments = getAttachmentInfo(result.attachments);
  event.links = [...attachments, ...links].filter(
    link => link.type != "conferencing"
  );
  event.conference = getConferenceInfo(result, links);
  event.attendees =
    result.attendees?.filter(a => !a.self && a.responseStatus !== "declined") ||
    [];
  event.organizer = result.organizer;
  event.creator = result.creator;
  // Add organizer to attendees list if:
  // 1. They aren't the owner of this calendar.
  // 2. They aren't a group calendar email.
  // 3. They aren't already in the list.
  // This is needed because outlook doesn't put organizers as attendees.
  if (
    !event.organizer.self &&
    !event.organizer.email.endsWith("@group.calendar.google.com") &&
    !event.attendees.some(attendee => attendee.email == event.organizer.email)
  ) {
    event.attendees.push(event.organizer);
  }

  // Secondary calendars don't use the same email as
  // the primary, so we manually mark the "self" entries
  if (event.organizer?.email == primaryEmail) {
    event.organizer.isSelf = true;
  }
  if (event.creator?.email == primaryEmail) {
    event.creator.isSelf = true;
  }
  let formattedURL = new URL(result.htmlLink);
  formattedURL.searchParams.set("authuser", primaryEmail);
  event.url = formattedURL.href;
  event.isAllDay = isAllDayEvent(start, end);
  return event;
}

export function parseMicrosoftCalendarResult(result) {
  function _normalizeUser(user, { self } = {}) {
    return {
      email: user.emailAddress.address,
      name: user.emailAddress.name,
      isSelf: !!self,
    };
  }

  let event = {};
  event.originalId = event.id = result.id;
  event.summary = result.subject;
  event.startDate = new Date(result.start?.dateTime + "Z");
  event.endDate = new Date(result.end?.dateTime + "Z");
  let links = getLinkInfo(result);
  event.conference = getConferenceInfo(result, links);
  event.links = links.filter(link => link.type != "conferencing");
  event.url = result.webLink;
  event.creator = null; // No creator seems to be available.
  event.organizer = _normalizeUser(result.organizer, {
    self: result.isOrganizer,
  });
  event.attendees = result.attendees
    .filter(a => a.status.response != "declined")
    .map(a => _normalizeUser(a));
  event.isAllDay =
    result.isAllDay ||
    isAllDayEvent(result.start?.dateTime, result.end?.dateTime);
  return event;
}
/**
 * TODO: Remove this when making the final transition to workshop.
 *
 * Helper function that takes an event start and end date and outputs
 * whether or not it spans one day or more. An optional `upperBound`
 * (in hours) can be provided to specify a limit on how many hours
 * an event spans until it's considered an all day event.
 */
export function isAllDayEvent(startDate, endDate, upperBound = 12) {
  startDate = new Date(startDate);
  endDate = new Date(endDate);

  let durationInMs = endDate.getTime() - startDate.getTime();
  let durationInHours = durationInMs / ONE_HOUR_MS;

  return durationInHours >= upperBound;
}
