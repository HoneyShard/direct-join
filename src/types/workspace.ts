export type WorkspaceClient = "MacSploit" | "Opiumware";
export type WorkspaceKind = "autoexec" | "workspace";

export interface IBackupMeta {
    id: string;
    name: string;
    client: WorkspaceClient;
    kinds: WorkspaceKind[];
    /** Unix epoch milliseconds */
    createdAt: number;
    sourceProfileId: string;
    auto: boolean;
    files: number;
}

export interface ISyncResult {
    targets: number;
    files: number;
}
