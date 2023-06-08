export interface Event {
  id: string
  start?: string
  summary: string
}
export interface GoogleCalendarEvent {
  id: string
  summary: string
  start?: {
    dateTime: string
    timeZone: string
  }
  status: 'cancelled' | 'confirmed'
}
export declare class GoogleCalendar {
  private clientId
  private redirectURL
  private accessToken
  private authEndpoint
  private scopes
  constructor(clientId: string, redirectURL: string)
  get authenticated(): string | undefined
  authenticate(): Promise<void>
  getUpcomingEvents(): Promise<Event[]>
}
