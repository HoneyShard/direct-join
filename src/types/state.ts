export type ClientName = "Vanilla" | "MacSploit" | "Opiumware";

export interface IState {
    profileId: string;
    connected: boolean;
    pid: number | null;
    client: ClientName | null;
    port: number | null;
}

export interface ICloseState {
    profileId: string;
    pid: number;
    exitCode: number;
}
