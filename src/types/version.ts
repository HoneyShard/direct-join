export interface IRobloxVersion {
    version: string;
    clientVersionUpload: string;
    bootstrapperVersion: string;
}

export interface IMacsploitVersion {
    clientVersionUpload: string;
    appVersion: string;
    clientVersion: string;
    relVersion: string;
    channel: string;
    changelog: string;
}

export interface IOpiumwareVersion {
    CurrentVersion: string;
    SupportedRobloxVersion: string;
    Changelog: string;
    RequiredUpd: boolean;
}
