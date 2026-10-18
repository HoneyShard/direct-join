export interface IAutoRelaunch {
    onCrash: boolean;
    onOffline: boolean;
    /** Restart every N minutes, 0 disables */
    forceRestartMinutes: number;
}

export const DEFAULT_AUTO_RELAUNCH: IAutoRelaunch = {
    onCrash: false,
    onOffline: false,
    forceRestartMinutes: 0,
};

export interface IProfile {
    id: string;
    name: string | null;
    cookie: string;
    userId: number;
    displayName: string;
    username: string;
    thumbnail: string | null;
    note: string;
    lastPlayedAt: number;
    placeId?: number | null;
    jobId?: string | null;
    autoRelaunch?: IAutoRelaunch;
}

export interface IRobloxProfile {
    id: number;
    name: string;
    displayName: string;
}
