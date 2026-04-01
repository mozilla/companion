/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

let events = [];
let showAllEvents = false;
let now = new Date();
let backendStatus = 'idle';

function isHappeningToday(startDate, endDate) {
  if (!startDate) return false;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const start = new Date(startDate);
  if (!endDate) return start >= todayStart && start < todayEnd;
  const end = new Date(endDate);
  return start < todayEnd && end >= todayStart;
}

function formatTime(date) {
  return new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatMonthDay(date) {
  return new Date(date).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function getNiceDateRange(event) {
  const start = new Date(event.startDate);
  const end = new Date(event.endDate);
  const startToday = isHappeningToday(start);
  const endToday = isHappeningToday(end);

  if (startToday && endToday) {
    if (event.isAllDay) return 'All day';
    return `${formatTime(start)}\u2013${formatTime(end)}`;
  }
  if (startToday) return `Starts today at ${formatTime(start)}`;
  if (endToday) return `Ends today at ${formatTime(end)}`;

  const sameDay = start.toDateString() === end.toDateString();
  if (sameDay) {
    if (event.isAllDay) return formatMonthDay(start);
    return `${formatMonthDay(start)} ${formatTime(start)}\u2013${formatTime(end)}`;
  }
  if (event.isAllDay) return `${formatMonthDay(start)}\u2013${formatMonthDay(end)}`;
  return `${formatMonthDay(start)} ${formatTime(start)}\u2013${formatMonthDay(end)} ${formatTime(end)}`;
}

function shouldShowEvent(event) {
  if (showAllEvents) return isHappeningToday(event.startDate, event.endDate);
  if (event.isAllDay) return false;
  const eventEnd = new Date(event.endDate);
  const eventStart = new Date(event.startDate);
  if (eventEnd < now) return false;
  const minutesUntilStart = (eventStart - now) / 60000;
  return minutesUntilStart <= 30;
}

function openUrl(url) {
  browser.tabs.query({ url }).then(tabs => {
    if (tabs.length && tabs[0].id) {
      browser.tabs.update(tabs[0].id, { active: true });
    } else {
      window.open(url);
    }
  });
}

function createActionButton(icon, text, onClick) {
  const btn = document.createElement('button');
  btn.className = 'action-button';
  btn.addEventListener('click', onClick);

  const iconContainer = document.createElement('div');
  iconContainer.className = 'action-button-icon-container';
  const img = document.createElement('img');
  img.className = 'action-button-icon';
  img.src = icon;
  img.setAttribute('role', 'presentation');
  iconContainer.appendChild(img);
  btn.appendChild(iconContainer);

  const label = document.createElement('span');
  label.className = 'action-button-label';
  label.textContent = text;
  btn.appendChild(label);

  return btn;
}

function createEventElement(event) {
  const el = document.createElement('div');
  el.className = 'calendar-event';
  let expanded = false;

  function render() {
    el.innerHTML = '';

    // Header
    const headerWrap = document.createElement('div');
    headerWrap.className = 'event-header-wrap';

    const header = document.createElement('div');
    header.className = 'event-header';

    const title = document.createElement('h3');
    title.className = 'event-title';
    title.title = event.summary;
    title.textContent = event.summary;
    header.appendChild(title);

    const dateRange = document.createElement('em');
    dateRange.textContent = getNiceDateRange(event);
    header.appendChild(dateRange);

    if (event.creator && event.creator.email) {
      const creator = document.createElement('em');
      creator.textContent = event.creator.email;
      header.appendChild(creator);
    }

    headerWrap.appendChild(header);

    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'event-view-toggle';
    toggleBtn.title = expanded ? 'Collapse view' : 'Expand view';
    const arrow = document.createElement('img');
    arrow.alt = expanded ? 'upward pointing arrow' : 'downward pointing arrow';
    arrow.src = expanded ? 'public/arrow-up.svg' : 'public/arrow-down.svg';
    toggleBtn.appendChild(arrow);
    toggleBtn.addEventListener('click', () => {
      expanded = !expanded;
      render();
    });
    headerWrap.appendChild(toggleBtn);

    el.appendChild(headerWrap);

    // Conference join button
    if (event.conference) {
      const confDiv = document.createElement('div');
      confDiv.className = 'event-conferencedetails';
      const joinLink = document.createElement('a');
      joinLink.className = 'join-meeting-link';
      joinLink.href = '#';
      joinLink.addEventListener('click', (e) => {
        e.preventDefault();
        openUrl(event.conference.url);
      });
      joinLink.textContent = 'Join meeting ';
      const icon = document.createElement('img');
      icon.src = event.conference.icon;
      icon.style.height = '16px';
      icon.style.width = '16px';
      icon.style.verticalAlign = 'bottom';
      joinLink.appendChild(icon);
      confDiv.appendChild(joinLink);
      el.appendChild(confDiv);
    }

    // Links
    if (event.links && event.links.length > 0) {
      const linkList = document.createElement('ul');
      linkList.className = 'event-links';
      event.links.forEach(link => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.addEventListener('click', (e) => {
          e.preventDefault();
          openUrl(link.url);
        });
        const linkText = (link.text && link.text.length > 0)
          ? link.text
          : new URL(link.url).host;
        a.textContent = `\u2197\u00a0${linkText}`;
        li.appendChild(a);
        linkList.appendChild(li);
      });
      el.appendChild(linkList);
    }

    // Expanded actions
    if (expanded) {
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'event-actions';

      if (event.conference) {
        actionsDiv.appendChild(createActionButton(
          'chrome://global/skin/icons/link.svg',
          'Copy invite link',
          async () => { await navigator.clipboard.writeText(event.conference.url); }
        ));
      }

      if (event.attendees && event.attendees.length > 0) {
        const emailList = event.attendees.map(a => a.email).join(',');
        actionsDiv.appendChild(createActionButton(
          'chrome://global/skin/icons/lightbulb.svg',
          'E-mail attendees',
          () => { window.open(`mailto:${emailList}`); }
        ));
      }

      actionsDiv.appendChild(createActionButton(
        'chrome://global/skin/icons/open-in-new.svg',
        'Open in calendar',
        () => { window.open(event.url); }
      ));

      el.appendChild(actionsDiv);
    }
  }

  render();
  return el;
}

function renderCalendar() {
  const container = document.getElementById('calendar-view');
  container.innerHTML = '';

  // Now / Today toggle
  const buttonGroup = document.createElement('div');
  buttonGroup.className = 'card button-group';

  const nowBtn = document.createElement('button');
  nowBtn.textContent = 'Now';
  nowBtn.title = 'Show events happening soon';
  nowBtn.disabled = !showAllEvents;
  nowBtn.addEventListener('click', () => {
    showAllEvents = false;
    renderCalendar();
  });
  buttonGroup.appendChild(nowBtn);

  const spacer = document.createElement('div');
  spacer.className = 'flex-spacer';
  buttonGroup.appendChild(spacer);

  const todayBtn = document.createElement('button');
  todayBtn.textContent = 'Today';
  todayBtn.title = 'Show all events for today';
  todayBtn.disabled = showAllEvents;
  todayBtn.addEventListener('click', () => {
    showAllEvents = true;
    renderCalendar();
  });
  buttonGroup.appendChild(todayBtn);

  container.appendChild(buttonGroup);

  // Events list
  const card = document.createElement('div');
  card.className = 'card';

  const visibleEvents = (events || []).filter(shouldShowEvent);
  if (visibleEvents.length > 0) {
    visibleEvents.forEach(event => card.appendChild(createEventElement(event)));
  } else {
    const placeholder = document.createElement('div');
    placeholder.className = 'event-placeholder';
    placeholder.textContent = 'No events to show.';
    card.appendChild(placeholder);
  }

  container.appendChild(card);

  // Loading spinner
  if (backendStatus === 'fetching') {
    const aside = document.createElement('aside');
    aside.className = 'status-indicator';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    aside.appendChild(spinner);
    container.appendChild(aside);
  }
}

function showLoginView() {
  document.getElementById('login-view').style.display = 'block';
  document.getElementById('calendar-view').style.display = 'none';
  document.getElementById('disconnect-section').style.display = 'none';
}

function showCalendarView() {
  document.getElementById('login-view').style.display = 'none';
  document.getElementById('calendar-view').style.display = 'block';
  document.getElementById('disconnect-section').style.display = 'block';
  renderCalendar();
}

async function syncStorage() {
  const eventData = await browser.storage.local.get('events');
  const statusData = await browser.storage.local.get('status');
  events = eventData.events || [];
  backendStatus = statusData.status || 'idle';
  renderCalendar();
}

async function init() {
  document.getElementById('service-name').textContent =
    browser.i18n.getMessage('service-name.google');
  document.getElementById('service-description').textContent =
    browser.i18n.getMessage('service-labels.google');

  const connectBtn = document.getElementById('connect-btn');
  connectBtn.textContent = browser.i18n.getMessage('connect');
  connectBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ command: 'signin', service: 'google' });
  });

  const disconnectBtn = document.getElementById('disconnect-btn');
  disconnectBtn.textContent = browser.i18n.getMessage('disconnect');
  disconnectBtn.addEventListener('click', () => {
    browser.runtime.sendMessage({ command: 'signout', service: 'google' });
  });

  // Check initial connection state
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
    if ('events' in changes || 'status' in changes) {
      syncStorage();
    }
  });

  // Refresh the "Now" view every minute
  browser.alarms.create('sidebar-clock', { periodInMinutes: 1 });
  browser.alarms.onAlarm.addListener(alarm => {
    if (alarm.name === 'sidebar-clock') {
      now = new Date();
      renderCalendar();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
