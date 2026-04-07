/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const URL_REGEX = /(?:(?:https?|ftp|file):\/\/|www\.|ftp\.)(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[-A-Z0-9+&@#/%=~_|$?!:,.])*(?:\([-A-Z0-9+&@#/%=~_|$?!:,.]*\)|[A-Z0-9+&@#/%=~_|$])/gim;

const ONE_HOUR_MS = 60 * 60 * 1000;

// Some common links provide nothing useful in the companion,
// so we just ignore them.
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
    try {
      url = new URL(`https://${url}`);
    } catch (e2) {
      return null;
    }
  }
  for (let pattern of patternsToIgnore) {
    if (url.href.match(pattern)) {
      return null;
    }
  }
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

export function getLinkInfo(result) {
  let doc;
  let links = new Map();
  let anchorText = new Set();
  let parser = new DOMParser();
  let description;
  if ("body" in result) {
    description = result.body.content;
  } else {
    description = result.description;
  }
  description = description
    ?.replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/<wbr>/g, "");
  doc = parser.parseFromString(description, "text/html");
  let anchors = doc.getElementsByTagName("a");
  if (anchors.length) {
    for (let anchor of anchors) {
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
  if ("description" in result) {
    let descriptionURLs = description?.match(URL_REGEX);
    if (descriptionURLs?.length) {
      for (let descriptionURL of descriptionURLs) {
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
        attachment.iconUrl = item.iconLink;
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
    icon: browser.runtime.getURL("public/zoom.svg"),
  },
  {
    name: "Teams",
    domain: "teams.microsoft.com",
    icon: browser.runtime.getURL("public/teams.svg"),
  },
  {
    name: "Meet",
    domain: "meet.google.com",
    icon: browser.runtime.getURL("public/meet.svg"),
  },
  {
    name: "Jitsi",
    domain: "meet.jit.si",
    icon: browser.runtime.getURL("public/jitsi.png"),
  },
  {
    name: "GoToMeeting",
    domain: ".gotomeeting.com",
    icon: browser.runtime.getURL("public/gotomeeting.png"),
  },
  {
    name: "WebEx",
    domain: ".webex.com",
    icon: browser.runtime.getURL("public/webex.png"),
  },
  {
    name: "Skype",
    domain: ".skype.com",
    icon: browser.runtime.getURL("public/skype.svg"),
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

export function getConferenceInfo(result, links) {
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
  if (result.onlineMeeting) {
    let locationURL = new URL(result.onlineMeeting.joinUrl);
    return getConferencingDetails(locationURL);
  }
  if (result.location) {
    try {
      let locationURL;
      if (result.location.displayName) {
        locationURL = new URL(result.location.displayName);
      } else {
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
      if (locationURL) {
        return getConferencingDetails(locationURL);
      }
    } catch (e) {
      // Location didn't contain a URL
    }
  }
  let conferenceLink = links.find(link => link.type == "conferencing");
  if (conferenceLink) {
    return getConferencingDetails(conferenceLink.url);
  }
  return null;
}

export function parseGoogleCalendarResult(result, primaryEmail) {
  let event = {};
  if (!result.start?.dateTime || !result.start?.dateTime) {
    return null;
  }
  let start = result.start?.dateTime;
  let end = result.end?.dateTime;

  event.originalId = event.id = result.id;
  event.summary = result.summary;

  event.startDate = new Date(start);
  event.endDate = new Date(end);
  event.description = result.description || '';
  let links = getLinkInfo(result);
  event.attachments = getAttachmentInfo(result.attachments);
  event.conference = getConferenceInfo(result, links);
  event.attendees =
    result.attendees?.filter(a => !a.self && a.responseStatus !== "declined") ||
    [];
  event.organizer = result.organizer;
  event.creator = result.creator;
  if (
    !event.organizer.self &&
    !event.organizer.email.endsWith("@group.calendar.google.com") &&
    !event.attendees.some(attendee => attendee.email == event.organizer.email)
  ) {
    event.attendees.push(event.organizer);
  }

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

export function isAllDayEvent(startDate, endDate, upperBound = 12) {
  startDate = new Date(startDate);
  endDate = new Date(endDate);

  let durationInMs = endDate.getTime() - startDate.getTime();
  let durationInHours = durationInMs / ONE_HOUR_MS;

  return durationInHours >= upperBound;
}
