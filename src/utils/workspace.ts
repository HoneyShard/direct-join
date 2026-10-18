import { invoke } from "@tauri-apps/api/core";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import type {
    IBackupMeta,
    ISyncResult,
    WorkspaceClient,
    WorkspaceKind,
} from "../types/workspace";

export function syncWorkspace(
    source: string,
    targets: string[],
    client: WorkspaceClient,
    kinds: WorkspaceKind[],
    replace: boolean,
    backupFirst: boolean,
) {
    return invoke<ISyncResult>("workspace_sync", {
        source,
        targets,
        client,
        kinds,
        replace,
        backupFirst,
    });
}

export function createBackup(
    source: string,
    client: WorkspaceClient,
    kinds: WorkspaceKind[],
    name: string,
) {
    return invoke<IBackupMeta>("workspace_backup_create", {
        source,
        client,
        kinds,
        name,
    });
}

export function listBackups() {
    return invoke<IBackupMeta[]>("workspace_backup_list");
}

export function restoreBackup(
    backupId: string,
    targets: string[],
    kinds: WorkspaceKind[],
    replace: boolean,
    backupFirst: boolean,
) {
    return invoke<ISyncResult>("workspace_backup_restore", {
        backupId,
        targets,
        kinds,
        replace,
        backupFirst,
    });
}

export function deleteBackup(backupId: string) {
    return invoke<void>("workspace_backup_delete", { backupId });
}

export function openBackupsFolder() {
    return invoke<void>("workspace_open_backups");
}

export const WORKSPACE_WINDOW_LABEL = "workspace";

/**
 * Opens the workspace tools in their own draggable window, or focuses it if already open.
 */
export async function openWorkspaceWindow() {
    const existing = await WebviewWindow.getByLabel(WORKSPACE_WINDOW_LABEL);
    if (existing) {
        await existing.unminimize();
        await existing.setFocus();
        return;
    }

    new WebviewWindow(WORKSPACE_WINDOW_LABEL, {
        url: "index.html",
        title: "Autoexec / Workspace",
        width: 520,
        height: 640,
        minWidth: 420,
        minHeight: 400,
        hiddenTitle: true,
        titleBarStyle: "overlay",
        trafficLightPosition: new LogicalPosition(0, -10),
        center: true,
        acceptFirstMouse: true,
    });
}
