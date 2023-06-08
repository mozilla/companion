import { DateTime } from 'luxon'

export interface ConferenceDetails {
  icon: string
  name: string
  url: string
}

export interface EventLink {
  url: string
  text: string
}

export interface Event {
  id: string
  summary: string
  creator: {
    email: string
  }
  startDate: Date
  endDate: Date
  conference: null | ConferenceDetails
  links: EventLink[]
  isAllDay: boolean
  url: string
  attendees: EventAttendee[]
}

interface EventAttendee {
  email: string
}

export const isHappeningToday = (startDate: Date, endDate?: Date) => {
  if (!startDate) return false

  const start = DateTime.fromJSDate(startDate)
  const now = DateTime.now()

  if (!endDate) {
    return start.hasSame(now, 'day')
  }

  const end = DateTime.fromJSDate(endDate)

  if (now.day - start.day >= 0) {
    if (end.day - now.day >= 0) {
      return true
    }
  }

  return false
}

export const maybeNotify = async () => {
  const key = DateTime.now().toLocaleString(DateTime.TIME_24_SIMPLE)
  console.log(`maybe notifying for meetings at ${key}`)
  const { notificationSchedule } = await browser.storage.local.get(
    'notificationSchedule'
  )
  if (!notificationSchedule) return
  const toNotify = notificationSchedule.get(key)
  if (toNotify && toNotify.length > 0) {
    toNotify.map((notif: Notification) =>
      browser.notifications.create({
        type: 'basic',
        ...notif,
      })
    )
  }
}

export const updateNotificationSchedule = async (events: Event[]) => {
  if (!events) return
  const newSchedule: NotificationSchedule = new Map()
  events
    .filter((event) => {
      return isHappeningToday(event.startDate)
    })
    .map((event) => {
      const key = DateTime.fromJSDate(event.startDate).toLocaleString(
        DateTime.TIME_24_SIMPLE
      )
      let scheduledNotifications = newSchedule.get(key)
      if (!scheduledNotifications) {
        scheduledNotifications = []
      }
      scheduledNotifications.push({
        title: event.summary,
        message: 'Starting now',
      })
      newSchedule.set(key, scheduledNotifications)

      const tenminkey = DateTime.fromJSDate(event.startDate)
        .minus({ minutes: 10 })
        .toLocaleString(DateTime.TIME_24_SIMPLE)
      let schdn = newSchedule.get(tenminkey)
      if (!schdn) {
        schdn = []
      }
      schdn.push({
        title: event.summary,
        message: 'Starting soon',
      })
      newSchedule.set(tenminkey, schdn)
    })
  browser.storage.local.set({
    notificationSchedule: newSchedule,
  })
}

interface Notification {
  title: string
  message: string
}

type NotificationSchedule = Map<string, Notification[]>
