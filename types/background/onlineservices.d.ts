export namespace OnlineServices {
    const ServiceInstances: Set<any>;
    function init(): Promise<void>;
    function init(): Promise<void>;
    function getAllServices(): any[];
    function getAllServices(): any[];
    function persist(): void;
    function persist(): void;
    function createService(type: any): Promise<GoogleService | null>;
    function createService(type: any): Promise<GoogleService | null>;
    function deleteService(service: any): Promise<void>;
    function deleteService(service: any): Promise<void>;
    function getServices(type: any): any[];
    function getServices(type: any): any[];
    function fetchEvents(): Promise<void>;
    function fetchEvents(): Promise<void>;
}
declare class GoogleService {
    constructor(config: any);
    app: any;
    name: string;
    connect(): Promise<null>;
    notifyListeners(eventName: any, data: any): void;
    getToken(): Promise<null>;
    authError(error: any): void;
    getNextMeetings(): Promise<any[] | null>;
    hasConnectionError: boolean | undefined;
    toJSON(): {
        type: any;
        auth: OAuth2;
    };
    #private;
}
import { OAuth2 } from "./oauth2.js";
export {};
