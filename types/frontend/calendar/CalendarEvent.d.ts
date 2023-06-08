import { LitElement } from 'lit';
import { Event as EventData } from './GoogleCalendar';
export declare class CalendarEvent extends LitElement {
    static styles: import("lit").CSSResult;
    data: EventData;
    render(): import("lit-html").TemplateResult<1>;
}
