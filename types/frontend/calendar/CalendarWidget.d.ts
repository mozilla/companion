import { LitElement } from 'lit'
import { Event } from './GoogleCalendar'
import './CalendarEvent'

export declare class CalendarWidget extends LitElement {
  static styles: import('lit').CSSResult
  private calendarApi
  busy: boolean
  authenticated: boolean
  error: Error | null
  events: Event[]
  constructor()
  login(): Promise<void>
  syncEvents(): Promise<void>
  render(): import('lit-html').TemplateResult<1>
}
