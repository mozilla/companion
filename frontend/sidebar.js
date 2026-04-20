/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let events = [];
let recentDocs = [];
let pinnedDocs = [];
let now = new Date();
let backendStatus = 'idle';
let viewDate = 'today'; // 'today' | 'tomorrow'
let unreadCount = 0;
let collapsedHeroes = new Set();

// ── Utilities ────────────────────────────────────────────────────────────────

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function updateOverflowTooltips() {
  document.querySelectorAll('.compact-title, .hero-link-chip, .doc-name, .doc-context').forEach(el => {
    el.title = el.scrollWidth > el.clientWidth ? el.textContent : '';
  });
}

const CONFERENCE_DOMAINS = ['zoom.us', 'teams.microsoft.com', 'meet.google.com', 'meet.jit.si', 'gotomeeting.com', 'webex.com', 'skype.com'];

function isConferenceUrl(url) {
  try {
    const host = new URL(url).host;
    return CONFERENCE_DOMAINS.some(domain => host.endsWith(domain));
  } catch (e) {
    return false;
  }
}

function sanitizeHTML(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Remove dangerous elements
  doc.querySelectorAll('script, style, iframe, object, embed, form').forEach(el => el.remove());

  // Remove dangerous attributes
  doc.querySelectorAll('*').forEach(el => {
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('on')) el.removeAttribute(attr.name);
    });
    if (el.hasAttribute('href') && el.getAttribute('href').startsWith('javascript:')) {
      el.removeAttribute('href');
    }
  });

  return doc.body.innerHTML;
}

function openUrl(url) {
  browser.tabs.query({ url }).then(tabs => {
    if (tabs.length && tabs[0].id) {
      browser.tabs.update(tabs[0].id, { active: true });
      browser.windows.update(tabs[0].windowId, { focused: true });
    } else {
      window.open(url);
    }
  });
}

function openDocUrl(url) {
  const basePath = url.split('?')[0].split('#')[0];
  browser.tabs.query({ url: '*://*.google.com/*' }).then(tabs => {
    const match = tabs.find(tab => tab.url && tab.url.split('?')[0].split('#')[0] === basePath);
    if (match) {
      browser.tabs.update(match.id, { active: true });
      browser.windows.update(match.windowId, { focused: true });
    } else {
      window.open(url);
    }
  });
}

function openInCalendarTab(url) {
  browser.tabs.query({ url: '*://calendar.google.com/*' }).then(tabs => {
    if (tabs.length && tabs[0].id) {
      browser.tabs.update(tabs[0].id, { active: true, url });
      browser.windows.update(tabs[0].windowId, { focused: true });
    } else {
      window.open(url);
    }
  });
}

// Returns { label, type } where type is 'now' | 'soon' | 'later'
function getEventStatus(event) {
  if (viewDate === 'tomorrow') {
    return { label: formatTime(event.startDate), type: 'later' };
  }

  const start = new Date(event.startDate);
  const end = new Date(event.endDate);

  if (now >= start && now < end) {
    return { label: 'Now', type: 'now' };
  }

  const minutesUntil = (start - now) / 60000;
  if (minutesUntil <= 30) {
    return { label: `In ${Math.ceil(minutesUntil)} min`, type: 'soon' };
  }

  return { label: formatTime(start), type: 'later' };
}

// Returns the next workday date (tomorrow normally, Monday on Fridays)
function getNextWorkday() {
  const day = now.getDay();
  const daysAhead = day === 5 ? 3 : day === 6 ? 2 : 1;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead);
}

function getNextDayLabel() {
  return now.getDay() === 5 ? 'Next Mon' : 'Tomorrow';
}

// Returns the target day's non-all-day events, sorted by start time
function getUpcomingEvents() {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  if (viewDate === 'today') {
    return (events || [])
      .filter(e => !e.isAllDay)
      .filter(e => new Date(e.startDate) < todayEnd && new Date(e.endDate) > now)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  }

  const nextDay = getNextWorkday();
  const nextDayEnd = new Date(nextDay.getTime() + 24 * 60 * 60 * 1000);
  return (events || [])
    .filter(e => !e.isAllDay)
    .filter(e => {
      const start = new Date(e.startDate);
      return start >= nextDay && start < nextDayEnd;
    })
    .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
}

// ── Event card builders ───────────────────────────────────────────────────────

function createHeroCard(event) {
  const status = getEventStatus(event);

  const card = document.createElement('div');
  card.className = `hero-card status-${status.type}`;
  card.dataset.eventId = event.id || event.originalId || '';

  // Status badge + minimize button
  const header = document.createElement('div');
  header.className = 'hero-header';

  const badge = document.createElement('div');
  badge.className = 'status-badge';
  badge.textContent = status.label;
  header.appendChild(badge);

  const minimize = document.createElement('button');
  minimize.className = 'hero-minimize-btn';
  minimize.textContent = '−';
  minimize.title = 'Minimize';
  minimize.addEventListener('click', e => {
    e.stopPropagation();
    collapsedHeroes.add(event.id || event.originalId || '');
    browser.storage.local.set({ collapsedHeroes: [...collapsedHeroes] });
    renderCalendar();
  });
  header.appendChild(minimize);

  card.appendChild(header);

  // Title (clicks to open in calendar)
  const title = document.createElement('a');
  title.className = 'hero-title';
  title.href = event.url;
  title.style.textDecoration = 'none';
  title.style.color = 'inherit';
  title.textContent = event.summary;
  title.addEventListener('click', e => {
    e.preventDefault();
    openInCalendarTab(event.url);
  });
  card.appendChild(title);

  // Time range
  const time = document.createElement('div');
  time.className = 'hero-time';
  time.textContent = `${formatTime(event.startDate)}\u2013${formatTime(event.endDate)}`;
  card.appendChild(time);

  // Join button
  if (event.conference) {
    const joinBtn = document.createElement('a');
    joinBtn.className = 'join-btn';
    joinBtn.href = event.conference.url;
    joinBtn.target = '_blank';
    joinBtn.addEventListener('click', e => {
      e.preventDefault();
      openUrl(event.conference.url);
    });

    const icon = document.createElement('img');
    icon.className = 'join-btn-icon';
    icon.src = event.conference.icon;
    icon.setAttribute('role', 'presentation');
    joinBtn.appendChild(icon);

    joinBtn.appendChild(document.createTextNode(`Join ${event.conference.name}`));
    card.appendChild(joinBtn);
  }

  // Description (collapsed by default)
  if (event.description && event.description.trim()) {
    const divider = document.createElement('hr');
    divider.className = 'hero-description-divider';
    card.appendChild(divider);

    const toggle = document.createElement('div');
    toggle.className = 'hero-description-toggle';

    const label = document.createElement('span');
    label.className = 'hero-section-label';
    label.textContent = 'Description';
    toggle.appendChild(label);

    const arrow = document.createElement('img');
    arrow.className = 'hero-description-arrow';
    arrow.src = 'public/arrow-down.svg';
    arrow.setAttribute('role', 'presentation');
    toggle.appendChild(arrow);

    const desc = document.createElement('div');
    desc.className = 'hero-description';
    desc.style.display = 'none';
    desc.innerHTML = sanitizeHTML(event.description);

    desc.querySelectorAll('a[href]').forEach(a => {
      if (isConferenceUrl(a.href)) {
        const parent = a.parentElement;
        a.remove();
        if (parent && parent !== desc && !parent.textContent.trim()) {
          parent.remove();
        }
      } else {
        a.addEventListener('click', e => {
          e.preventDefault();
          openUrl(a.href);
        });
      }
    });

    toggle.addEventListener('click', () => {
      const isExpanded = desc.style.display !== 'none';
      desc.style.display = isExpanded ? 'none' : 'block';
      arrow.classList.toggle('expanded', !isExpanded);
    });

    card.appendChild(toggle);
    card.appendChild(desc);
  }

  // Attachments
  if (event.attachments && event.attachments.length > 0) {
    const docsSection = document.createElement('div');
    docsSection.className = 'hero-docs';

    const docsLabel = document.createElement('div');
    docsLabel.className = 'hero-section-label';
    docsLabel.textContent = 'Documents';
    docsSection.appendChild(docsLabel);

    event.attachments.forEach(attachment => {
      const link = document.createElement('a');
      link.className = 'hero-link-chip';
      link.href = attachment.url;
      link.target = '_blank';
      if (attachment.iconUrl) {
        const icon = document.createElement('img');
        icon.src = attachment.iconUrl;
        icon.width = 14;
        icon.height = 14;
        icon.style.verticalAlign = 'middle';
        icon.style.marginRight = '4px';
        link.appendChild(icon);
      }
      link.appendChild(document.createTextNode(attachment.text || new URL(attachment.url).host));
      link.addEventListener('click', e => {
        e.preventDefault();
        openDocUrl(attachment.url);
      });
      docsSection.appendChild(link);
    });

    card.appendChild(docsSection);
  }

  applyUnacceptedTreatment(card, event);

  return card;
}

function createCompactEvent(event) {
  const item = document.createElement('a');
  item.className = 'compact-event';
  item.href = event.url;
  item.style.cursor = 'pointer';
  item.style.textDecoration = 'none';
  item.style.color = 'inherit';
  item.addEventListener('click', e => {
    e.preventDefault();
    openInCalendarTab(event.url);
  });

  const time = document.createElement('span');
  time.className = 'compact-time';
  time.textContent = formatTime(event.startDate);
  item.appendChild(time);

  const title = document.createElement('span');
  title.className = 'compact-title';
  title.textContent = event.summary;
  item.appendChild(title);

  if (event.conference) {
    const joinLink = document.createElement('a');
    joinLink.className = 'compact-join';
    joinLink.href = event.conference.url;
    joinLink.target = '_blank';
    joinLink.title = `Join ${event.conference.name}`;
    joinLink.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      openUrl(event.conference.url);
    });

    const icon = document.createElement('img');
    icon.className = 'compact-join-icon';
    icon.src = event.conference.icon;
    icon.alt = `Join ${event.conference.name}`;
    joinLink.appendChild(icon);
    item.appendChild(joinLink);
  }

  applyUnacceptedTreatment(item, event);

  return item;
}

function applyUnacceptedTreatment(element, event) {
  if (event.responseStatus === 'accepted') return;
  element.style.background = 'repeating-linear-gradient(135deg, transparent, transparent 4px, color-mix(in srgb, currentColor 6%, transparent) 4px, color-mix(in srgb, currentColor 6%, transparent) 8px)';
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderCalendar(animate = false) {
  now = new Date();
  const container = document.getElementById('calendar-view');
  container.innerHTML = '';
  if (animate) {
    container.style.animation = 'none';
    container.offsetHeight; // force reflow
    container.style.animation = '';
  }

  // Keep the next-day button label current
  const tomorrowBtn = document.getElementById('view-tomorrow-btn');
  if (tomorrowBtn) tomorrowBtn.textContent = getNextDayLabel();

  const upcoming = getUpcomingEvents();

  if (upcoming.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';

    if (backendStatus === 'fetching') {
      const text = document.createElement('div');
      text.className = 'empty-subtitle';
      text.textContent = 'Loading events\u2026';
      empty.appendChild(text);
    } else {
      const icon = document.createElement('div');
      icon.className = 'empty-icon';
      icon.textContent = '🎉';
      empty.appendChild(icon);

      const title = document.createElement('div');
      title.className = 'empty-title';
      title.textContent = viewDate === 'tomorrow' ? `Nothing on ${getNextDayLabel()}` : 'You\'re free for the rest of the day';
      empty.appendChild(title);

      const subtitle = document.createElement('div');
      subtitle.className = 'empty-subtitle';
      subtitle.textContent = viewDate === 'tomorrow' ? 'No meetings scheduled' : 'No more meetings today';
      empty.appendChild(subtitle);
    }

    container.appendChild(empty);
    return;
  }

  if (viewDate === 'tomorrow') {
    // Flat list for tomorrow — no urgency, no hero card
    const section = document.createElement('div');
    section.className = 'later-section later-section-tomorrow';

    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = getNextDayLabel();
    section.appendChild(label);

    upcoming.forEach(event => section.appendChild(createCompactEvent(event)));
    container.appendChild(section);
  } else {
    // Hero cards: currently-happening events, or events starting within 30 min
    const heroEvents = upcoming.filter(e => {
      const type = getEventStatus(e).type;
      return type === 'now' || type === 'soon';
    });
    heroEvents.forEach(event => {
      const eventId = event.id || event.originalId || '';
      if (collapsedHeroes.has(eventId)) {
        const row = createCompactEvent(event);
        row.dataset.heroId = eventId;
        row.style.margin = '0 12px';
        const expand = document.createElement('button');
        expand.className = 'hero-expand-btn';
        expand.textContent = '+';
        expand.title = 'Expand';
        expand.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          collapsedHeroes.delete(eventId);
          browser.storage.local.set({ collapsedHeroes: [...collapsedHeroes] });
          renderCalendar();
        });
        row.appendChild(expand);
        container.appendChild(row);
      } else {
        container.appendChild(createHeroCard(event));
      }
    });

    // Later today
    const laterEvents = upcoming.filter(e => !heroEvents.includes(e));
    if (laterEvents.length > 0) {
      const section = document.createElement('div');
      section.className = 'later-section' + (heroEvents.length === 0 ? ' later-section-tomorrow' : '');

      const label = document.createElement('div');
      label.className = 'section-label';
      label.textContent = heroEvents.length > 0 ? 'Later today' : 'Today';
      section.appendChild(label);

      laterEvents.forEach(event => section.appendChild(createCompactEvent(event)));
      container.appendChild(section);
    }
  }

  // Loading spinner
  if (backendStatus === 'fetching') {
    const aside = document.createElement('aside');
    aside.className = 'status-indicator';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    aside.appendChild(spinner);
    container.appendChild(aside);
  }

  updateOverflowTooltips();
}

function updateUnreadBadge() {
  const btn = document.getElementById('gmail-btn');
  if (!btn) return;
  let badge = btn.querySelector('.unread-badge');
  if (unreadCount > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'unread-badge';
      btn.appendChild(badge);
    }
    badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
  } else if (badge) {
    badge.remove();
  }
}

function docContext(doc) {
  function relativeTime(dateStr) {
    const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
    if (days === 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) > 1 ? 's' : ''} ago`;
    return `${Math.floor(days / 30)} month${Math.floor(days / 30) > 1 ? 's' : ''} ago`;
  }
  if (doc.sharedWithMeTime) {
    const who = doc.sharingUser?.displayName;
    return who ? `Shared by ${who} · ${relativeTime(doc.sharedWithMeTime)}` : `Shared · ${relativeTime(doc.sharedWithMeTime)}`;
  }
  if (doc.lastModifyingUser) {
    const time = relativeTime(doc.modifiedTime);
    return doc.lastModifyingUser.me ? `You modified · ${time}` : `Modified by ${doc.lastModifyingUser.displayName} · ${time}`;
  }
  if (doc.viewedByMeTime) {
    return `You opened · ${relativeTime(doc.viewedByMeTime)}`;
  }
  return null;
}

function renderRecentDocs() {
  const container = document.getElementById('recent-docs-view');
  if (!container) return;
  container.innerHTML = '';
  const toggle = document.getElementById('recent-docs-toggle');
  const pinnedIds = new Set(pinnedDocs.map(d => d.id));
  const unpinnedRecent = recentDocs.filter(d => !pinnedIds.has(d.id)).slice(0, 5);
  if (!pinnedDocs.length && !unpinnedRecent.length || (toggle && !toggle.checked)) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';

  const section = document.createElement('div');
  section.className = 'later-section';

  const label = document.createElement('a');
  label.className = 'section-label';
  label.textContent = 'Recent Documents';
  label.href = 'https://drive.google.com/';
  label.target = '_blank';
  section.appendChild(label);

  [...pinnedDocs, ...unpinnedRecent].forEach((doc, index) => {
    const isPinned = index < pinnedDocs.length;
    const row = document.createElement('a');
    row.className = 'doc-row';
    row.href = doc.url;
    row.target = '_blank';
    row.addEventListener('click', e => {
      e.preventDefault();
      openDocUrl(doc.url);
    });

    if (doc.iconUrl) {
      const icon = document.createElement('img');
      icon.className = 'doc-icon';
      icon.src = doc.iconUrl;
      icon.alt = '';
      row.appendChild(icon);
    }

    const info = document.createElement('div');
    info.className = 'doc-info';

    const name = document.createElement('span');
    name.className = 'doc-name';
    name.textContent = doc.name;
    info.appendChild(name);

    const context = docContext(doc);
    if (context) {
      const sub = document.createElement('span');
      sub.className = 'doc-context';
      sub.textContent = context;
      info.appendChild(sub);
    }

    row.appendChild(info);

    const pin = document.createElement('button');
    pin.className = 'doc-pin' + (isPinned ? ' doc-pin-active' : '');
    pin.title = isPinned ? 'Unpin' : 'Pin';
    pin.textContent = '📌';
    pin.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (isPinned) {
        pinnedDocs = pinnedDocs.filter(d => d.id !== doc.id);
      } else {
        pinnedDocs = [...pinnedDocs, doc];
      }
      browser.storage.local.set({ pinnedDocs });
    });
    row.appendChild(pin);

    section.appendChild(row);
  });

  container.appendChild(section);

  updateOverflowTooltips();
}

// ── View management ───────────────────────────────────────────────────────────

function showLoginView() {
  document.getElementById('footer').style.display = 'none';
  document.getElementById('settings-popup').style.display = 'none';
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('calendar-view').style.display = 'none';
  document.getElementById('recent-docs-view').style.display = 'none';
}

function showCalendarView() {
  document.getElementById('footer').style.display = 'flex';
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('calendar-view').style.display = 'block';
  renderCalendar(true);
}

let syncDebounce = null;

function debouncedSync(calendarChanged, docsChanged) {
  if (syncDebounce) {
    syncDebounce.calendar = syncDebounce.calendar || calendarChanged;
    syncDebounce.docs = syncDebounce.docs || docsChanged;
    return;
  }
  syncDebounce = { calendar: calendarChanged, docs: docsChanged };
  setTimeout(async () => {
    const { calendar, docs } = syncDebounce;
    syncDebounce = null;
    await syncStorage(calendar, docs);
  }, 200);
}

async function syncStorage(calendarChanged = true, docsChanged = true) {
  const [eventData, statusData, docsData, pinnedData, collapsedData, unreadData] = await Promise.all([
    browser.storage.local.get('events'),
    browser.storage.local.get('status'),
    browser.storage.local.get('recentDocs'),
    browser.storage.local.get('pinnedDocs'),
    browser.storage.local.get('collapsedHeroes'),
    browser.storage.local.get('unreadCount'),
  ]);
  const newEvents = eventData.events || [];
  const newStatus = statusData.status || 'idle';
  const newRecentDocs = docsData.recentDocs || [];
  const newPinnedDocs = pinnedData.pinnedDocs || [];
  const newCollapsed = new Set(collapsedData.collapsedHeroes || []);
  const newUnread = unreadData.unreadCount || 0;

  const eventsChanged = JSON.stringify(newEvents) !== JSON.stringify(events);
  const statusChanged = newStatus !== backendStatus;
  const recentDocsChanged = JSON.stringify(newRecentDocs) !== JSON.stringify(recentDocs);
  const pinnedDocsChanged = JSON.stringify(newPinnedDocs) !== JSON.stringify(pinnedDocs);

  events = newEvents;
  backendStatus = newStatus;
  recentDocs = newRecentDocs;
  pinnedDocs = newPinnedDocs;
  collapsedHeroes = newCollapsed;

  if (newUnread !== unreadCount) {
    unreadCount = newUnread;
    updateUnreadBadge();
  }

  const refreshIcon = document.querySelector('#refresh-btn img');
  if (refreshIcon) {
    refreshIcon.classList.toggle('spinning', backendStatus === 'fetching');
  }

  if (calendarChanged && (eventsChanged || statusChanged)) renderCalendar();
  if (docsChanged && (recentDocsChanged || pinnedDocsChanged)) renderRecentDocs();
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // i18n
  document.getElementById('service-name').textContent =
    browser.i18n.getMessage('service-name.google');
  document.getElementById('service-description').textContent =
    browser.i18n.getMessage('service-labels.google');
  const connectBtn = document.getElementById('connect-btn');
  connectBtn.textContent = browser.i18n.getMessage('connect');
  const authUrl = await browser.runtime.sendMessage({ command: 'getAuthUrl', service: 'google' });
  connectBtn.href = authUrl;


  // Today / Tomorrow toggle
  document.getElementById('view-today-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    viewDate = 'today';
    document.getElementById('view-today-btn').classList.add('active');
    document.getElementById('view-tomorrow-btn').classList.remove('active');
    renderCalendar(true);
  });
  document.getElementById('view-tomorrow-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    viewDate = 'tomorrow';
    document.getElementById('view-tomorrow-btn').classList.add('active');
    document.getElementById('view-today-btn').classList.remove('active');
    renderCalendar(true);
  });

  document.getElementById('gmail-btn').addEventListener('click', (e) => {
    e.preventDefault();
    browser.tabs.query({ url: '*://mail.google.com/*' }).then(tabs => {
      if (tabs.length && tabs[0].id) {
        browser.tabs.update(tabs[0].id, { active: true });
        browser.windows.update(tabs[0].windowId, { focused: true });
      } else {
        window.open('https://mail.google.com/');
      }
    });
  });

  // Refresh button
  document.getElementById('refresh-btn').addEventListener('click', () => {
    browser.runtime.sendMessage({ command: 'refresh' });
  });

  // Settings gear toggle
  document.getElementById('settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const popup = document.getElementById('settings-popup');
    popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
  });

  // Close popup when clicking outside or when sidebar loses focus
  document.addEventListener('click', () => {
    document.getElementById('settings-popup').style.display = 'none';
  });
  window.addEventListener('blur', () => {
    document.getElementById('settings-popup').style.display = 'none';
  });

  // Notifications toggle
  const notifToggle = document.getElementById('notifications-toggle');
  const { notificationsEnabled } = await browser.storage.local.get('notificationsEnabled');
  notifToggle.checked = notificationsEnabled !== false;
  notifToggle.addEventListener('change', (e) => {
    e.stopPropagation();
    browser.storage.local.set({ notificationsEnabled: notifToggle.checked });
  });

  // Recent docs toggle
  const recentDocsToggle = document.getElementById('recent-docs-toggle');
  const { recentDocsEnabled } = await browser.storage.local.get('recentDocsEnabled');
  recentDocsToggle.checked = recentDocsEnabled !== false;
  recentDocsToggle.addEventListener('change', (e) => {
    e.stopPropagation();
    browser.storage.local.set({ recentDocsEnabled: recentDocsToggle.checked });
    renderRecentDocs();
  });

  // Initial connection check
  const result = await browser.storage.local.get('onlineservices.config');
  const config = result['onlineservices.config'];
  const connected = config && config.some(s => s.type.startsWith('google'));

  if (connected) {
    showCalendarView();
    await syncStorage();
  } else {
    showLoginView();
  }

  // React to storage changes
  browser.storage.onChanged.addListener((changes) => {
    if ('onlineservices.config' in changes) {
      const newConfig = changes['onlineservices.config'].newValue;
      const nowConnected = newConfig && newConfig.some(s => s.type.startsWith('google'));
      if (nowConnected) {
        showCalendarView();
        syncStorage();
      } else {
        showLoginView();
      }
    }
    if ('events' in changes || 'status' in changes || 'recentDocs' in changes || 'pinnedDocs' in changes || 'unreadCount' in changes) {
      const calendarChanged = 'events' in changes || 'status' in changes;
      const docsChanged = 'recentDocs' in changes || 'pinnedDocs' in changes;
      debouncedSync(calendarChanged, docsChanged);
    }
  });

// Update hero badges every minute — surgical DOM updates, no full re-render
  browser.alarms.create('sidebar-clock', { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'sidebar-clock') {
      now = new Date();
      if (viewDate !== 'today') return;

      const container = document.getElementById('calendar-view');
      const upcoming = getUpcomingEvents();
      const heroEvents = upcoming.filter(e => {
        const type = getEventStatus(e).type;
        return type === 'now' || type === 'soon';
      });
      const heroIds = new Set(heroEvents.map(e => e.id || e.originalId || ''));

      // Remove ended or no-longer-hero cards
      container.querySelectorAll('.hero-card').forEach(card => {
        if (!heroIds.has(card.dataset.eventId)) {
          card.remove();
        }
      });

      // Remove collapsed hero compact rows that ended
      container.querySelectorAll('.compact-event[data-hero-id]').forEach(row => {
        if (!heroIds.has(row.dataset.heroId)) {
          row.remove();
        }
      });

      // Update badges on remaining hero cards
      container.querySelectorAll('.hero-card').forEach(card => {
        const event = heroEvents.find(e => (e.id || e.originalId || '') === card.dataset.eventId);
        if (event) {
          const status = getEventStatus(event);
          card.className = `hero-card status-${status.type}`;
          card.dataset.eventId = event.id || event.originalId || '';
          const badge = card.querySelector('.status-badge');
          if (badge) badge.textContent = status.label;
        }
      });

      // Add new hero cards for events that just became 'soon'
      const existingIds = new Set([...container.querySelectorAll('.hero-card')].map(c => c.dataset.eventId));
      heroEvents.forEach(event => {
        const eventId = event.id || event.originalId || '';
        if (!existingIds.has(eventId) && !collapsedHeroes.has(eventId)) {
          const laterSection = container.querySelector('.later-section');
          container.insertBefore(createHeroCard(event), laterSection);
        }
      });

      // Update section label
      const label = container.querySelector('.section-label');
      const hasHeroes = container.querySelector('.hero-card') !== null;
      if (label && label.textContent !== 'Today' && label.textContent !== 'Later today') return;
      if (label) label.textContent = hasHeroes ? 'Later today' : 'Today';
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
