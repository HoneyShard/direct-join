import { emit, listen } from "@tauri-apps/api/event";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";
import { UI_STYLES } from "../../constants/ui";
import { useStore } from "../../store";
import type { IProfile } from "../../types/profile";
import type {
    IBackupMeta,
    WorkspaceClient,
    WorkspaceKind,
} from "../../types/workspace";
import { showConfirmationModal, showErrorModal } from "../../utils/modal";
import {
    createBackup,
    deleteBackup,
    listBackups,
    openBackupsFolder,
    restoreBackup,
    syncWorkspace,
} from "../../utils/workspace";
import Input from "../EditProfileModal/Input";
import Text from "../EditProfileModal/Text";
import Title from "../EditProfileModal/Title";
import Button from "../Shared/Button";

const CLIENTS: WorkspaceClient[] = ["MacSploit", "Opiumware"];

function profileLabel(profile: IProfile) {
    return profile.name ?? profile.displayName ?? profile.id;
}

function formatDate(millis: number) {
    return new Date(millis).toLocaleString();
}

export default function WorkspaceTools() {
    const store = useStore();
    const [connectedIds, setConnectedIds] = useState<string[]>([]);
    const nameRef =
        useRef<[string, React.Dispatch<React.SetStateAction<string>>]>(null);
    const [client, setClient] = useState<WorkspaceClient>("MacSploit");
    const [autoexec, setAutoexec] = useState(true);
    const [workspace, setWorkspace] = useState(true);
    const [replace, setReplace] = useState(true);
    const [backupFirst, setBackupFirst] = useState(true);
    const [source, setSource] = useState(store.profiles[0]?.id ?? "");
    const [targets, setTargets] = useState<string[]>([]);
    const [backups, setBackups] = useState<IBackupMeta[]>([]);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState<"copy" | "backups">("copy");

    function refreshBackups() {
        listBackups()
            .then(setBackups)
            .catch((err: string) =>
                showErrorModal("Failed to list backups", err),
            );
    }

    useEffect(refreshBackups, []);

    // Running state lives in the main window; ask it for the connected profiles
    useEffect(() => {
        const unlisten = listen<string[]>("workspace_states", (event) =>
            setConnectedIds(event.payload),
        );
        unlisten.then(() => emit("workspace_request_states"));
        return () => {
            unlisten.then((unlisten) => unlisten());
        };
    }, []);

    const kinds: WorkspaceKind[] = [
        ...(autoexec ? (["autoexec"] as const) : []),
        ...(workspace ? (["workspace"] as const) : []),
    ];
    const otherProfiles = store.profiles.filter((p) => p.id !== source);
    const selectedTargets = targets.filter((id) => id !== source);
    const visibleBackups = backups.filter((b) => b.client === client);

    function toggleTarget(id: string) {
        setTargets((current) =>
            current.includes(id)
                ? current.filter((t) => t !== id)
                : [...current, id],
        );
    }

    function runningTargets(ids: string[]) {
        return connectedIds.filter((id) => ids.includes(id)).length;
    }

    function confirmDestructive(
        title: string,
        what: string,
        ids: string[],
        action: () => Promise<void>,
    ) {
        const running = runningTargets(ids);
        const text = [
            `${what} ${ids.length} profile(s). ${
                replace
                    ? "Existing files in the selected folders will be deleted first"
                    : "Files with the same name will be overwritten"
            }${replace && backupFirst ? " (a safety backup is taken)" : ""}.`,
            running > 0
                ? `${running} of them are running; close them first or they may overwrite the result.`
                : "",
        ]
            .filter(Boolean)
            .join(" ");
        showConfirmationModal(title, text, async () => {
            setBusy(true);
            try {
                await action();
            } finally {
                setBusy(false);
            }
        });
    }

    function requireKinds() {
        if (kinds.length === 0) {
            showErrorModal(
                "Nothing selected",
                "Select autoexec, workspace or both.",
            );
            return false;
        }
        return true;
    }

    function onCopy() {
        if (!requireKinds()) return;
        if (!source) {
            showErrorModal("No source", "Select a source profile.");
            return;
        }
        if (selectedTargets.length === 0) {
            showErrorModal("No targets", "Select at least one target profile.");
            return;
        }
        confirmDestructive(
            "Copy to profiles",
            `Copy ${kinds.join(" + ")} of ${client} to`,
            selectedTargets,
            async () => {
                try {
                    const result = await syncWorkspace(
                        source,
                        selectedTargets,
                        client,
                        kinds,
                        replace,
                        backupFirst,
                    );
                    refreshBackups();
                    showErrorModal(
                        "Copied",
                        `Copied ${result.files} file(s) to ${result.targets} profile(s).`,
                    );
                } catch (err) {
                    showErrorModal("Failed to copy", String(err));
                }
            },
        );
    }

    async function onBackup() {
        if (!requireKinds()) return;
        if (!source) {
            showErrorModal("No source", "Select a profile to back up.");
            return;
        }
        setBusy(true);
        try {
            const meta = await createBackup(
                source,
                client,
                kinds,
                nameRef.current?.[0] ?? "",
            );
            nameRef.current?.[1]("");
            refreshBackups();
            showErrorModal(
                "Backup created",
                `Saved ${meta.files} file(s) as '${meta.name}'.`,
            );
        } catch (err) {
            showErrorModal("Failed to create backup", String(err));
        } finally {
            setBusy(false);
        }
    }

    function onRestore(backup: IBackupMeta) {
        if (!requireKinds()) return;
        if (targets.length === 0) {
            showErrorModal("No targets", "Tick the profiles to restore to.");
            return;
        }
        confirmDestructive(
            "Restore backup",
            `Restore '${backup.name}' to`,
            targets,
            async () => {
                try {
                    const result = await restoreBackup(
                        backup.id,
                        targets,
                        kinds,
                        replace,
                        backupFirst,
                    );
                    refreshBackups();
                    showErrorModal(
                        "Restored",
                        `Restored ${result.files} file(s) to ${result.targets} profile(s).`,
                    );
                } catch (err) {
                    showErrorModal("Failed to restore", String(err));
                }
            },
        );
    }

    function onDelete(backup: IBackupMeta) {
        showConfirmationModal(
            "Delete backup",
            `Delete '${backup.name}'? This cannot be undone.`,
            () =>
                deleteBackup(backup.id)
                    .then(refreshBackups)
                    .catch((err) =>
                        showErrorModal("Failed to delete", String(err)),
                    ),
        );
    }

    const contentStyle: CSSProperties = {
        display: "flex",
        flexGrow: 1,
        minHeight: 0,
        padding: UI_STYLES.SPACING.XLARGE,
        flexDirection: "column",
        gap: UI_STYLES.SPACING.TINY,
    };

    const rowStyle: CSSProperties = {
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        gap: UI_STYLES.SPACING.MEDIUM,
        flexWrap: "wrap",
        color: UI_STYLES.COLORS.TEXT_BRIGHT,
        fontFamily: UI_STYLES.TYPOGRAPHY.FONT_FAMILY_AVENIR,
        fontSize: UI_STYLES.TYPOGRAPHY.FONT_SIZE_NORMAL,
    };

    const listStyle: CSSProperties = {
        display: "flex",
        flexDirection: "column",
        gap: 2,
        flexGrow: 1,
        flexShrink: 1,
        minHeight: 84,
        overflowY: "auto",
        padding: UI_STYLES.SPACING.TINY,
        border: `1px solid ${UI_STYLES.COLORS.BORDER}`,
        borderRadius: UI_STYLES.SPACING.MEDIUM,
    };

    const selectStyle: CSSProperties = {
        flexShrink: 0,
        padding: "4px 8px",
        backgroundColor: UI_STYLES.COLORS.BACKGROUND_LIGHT,
        color: UI_STYLES.COLORS.TEXT_BRIGHT,
        border: 0,
        borderRadius: UI_STYLES.SPACING.MEDIUM,
        fontFamily: UI_STYLES.TYPOGRAPHY.FONT_FAMILY_AVENIR,
        fontSize: UI_STYLES.TYPOGRAPHY.FONT_SIZE_NORMAL,
    };

    const backupRowStyle: CSSProperties = {
        ...rowStyle,
        justifyContent: "space-between",
        flexWrap: "nowrap",
    };

    const mutedStyle: CSSProperties = {
        flexShrink: 0,
        fontFamily: UI_STYLES.TYPOGRAPHY.FONT_FAMILY_AVENIR,
        color: UI_STYLES.COLORS.TEXT_MEDIUM,
        fontSize: UI_STYLES.TYPOGRAPHY.FONT_SIZE_SMALL,
    };

    const targetPicker = (
        <>
            <Text>{tab === "copy" ? "Target profiles" : "Restore to"}</Text>
            <div style={listStyle}>
                {otherProfiles.length === 0 && (
                    <span style={mutedStyle}>No other profiles.</span>
                )}
                {otherProfiles.length > 1 && (
                    <label style={rowStyle}>
                        <input
                            type="checkbox"
                            checked={
                                selectedTargets.length === otherProfiles.length
                            }
                            onChange={(e) =>
                                setTargets(
                                    e.target.checked
                                        ? otherProfiles.map((p) => p.id)
                                        : [],
                                )
                            }
                        />
                        All
                    </label>
                )}
                {otherProfiles.map((p) => (
                    <label key={p.id} style={rowStyle}>
                        <input
                            type="checkbox"
                            checked={targets.includes(p.id)}
                            onChange={() => toggleTarget(p.id)}
                        />
                        {profileLabel(p)}
                    </label>
                ))}
            </div>
            <label style={rowStyle}>
                <input
                    type="checkbox"
                    checked={replace}
                    onChange={(e) => setReplace(e.target.checked)}
                />
                Override (delete existing first, else merge)
            </label>
            <label style={rowStyle}>
                <input
                    type="checkbox"
                    checked={backupFirst}
                    disabled={!replace}
                    onChange={(e) => setBackupFirst(e.target.checked)}
                />
                Back up targets before overriding
            </label>
        </>
    );

    const sourcePicker = (
        <>
            <Text>Source profile</Text>
            <select
                style={selectStyle}
                value={source}
                onChange={(e) => setSource(e.target.value)}
            >
                {store.profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                        {profileLabel(p)}
                    </option>
                ))}
            </select>
        </>
    );

    return (
                <div style={contentStyle}>
                    <Title>Workspace Tools</Title>

                    <div style={rowStyle}>
                        {CLIENTS.map((name) => (
                            <Button
                                key={name}
                                variant="modal"
                                onClick={() => setClient(name)}
                                style={{ opacity: client === name ? 1 : 0.5 }}
                            >
                                {name}
                            </Button>
                        ))}
                        <label style={rowStyle}>
                            <input
                                type="checkbox"
                                checked={autoexec}
                                onChange={(e) => setAutoexec(e.target.checked)}
                            />
                            Autoexec
                        </label>
                        <label style={rowStyle}>
                            <input
                                type="checkbox"
                                checked={workspace}
                                onChange={(e) => setWorkspace(e.target.checked)}
                            />
                            Workspace
                        </label>
                    </div>

                    <div style={rowStyle}>
                        {(["copy", "backups"] as const).map((name) => (
                            <Button
                                key={name}
                                variant="modal"
                                onClick={() => setTab(name)}
                                style={{ opacity: tab === name ? 1 : 0.5 }}
                            >
                                {name === "copy" ? "Copy" : "Backups"}
                            </Button>
                        ))}
                    </div>

                    {tab === "copy" ? (
                        <>
                            {sourcePicker}
                            {targetPicker}
                            <div style={rowStyle}>
                                <Button
                                    variant="modal"
                                    onClick={busy ? undefined : onCopy}
                                >
                                    Copy source to targets
                                </Button>
                            </div>
                        </>
                    ) : (
                        <>
                            {sourcePicker}
                            <div style={rowStyle}>
                                <Input
                                    ref={nameRef}
                                    placeholder="Backup name (optional)"
                                />
                                <Button
                                    variant="modal"
                                    onClick={busy ? undefined : onBackup}
                                >
                                    Back up source
                                </Button>
                            </div>
                            <Text>Saved backups ({client})</Text>
                            <div style={listStyle}>
                                {visibleBackups.length === 0 && (
                                    <span style={mutedStyle}>
                                        No backups yet.
                                    </span>
                                )}
                                {visibleBackups.map((backup) => (
                                    <div key={backup.id} style={backupRowStyle}>
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                            }}
                                        >
                                            <span>
                                                {backup.name}
                                                {backup.auto ? " (auto)" : ""}
                                            </span>
                                            <span style={mutedStyle}>
                                                {formatDate(backup.createdAt)} ·{" "}
                                                {backup.kinds.join(" + ")} ·{" "}
                                                {backup.files} files
                                            </span>
                                        </div>
                                        <div style={rowStyle}>
                                            <Button
                                                variant="modal"
                                                onClick={
                                                    busy
                                                        ? undefined
                                                        : () =>
                                                              onRestore(backup)
                                                }
                                            >
                                                Restore
                                            </Button>
                                            <Button
                                                variant="modal"
                                                onClick={
                                                    busy
                                                        ? undefined
                                                        : () => onDelete(backup)
                                                }
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {targetPicker}
                        </>
                    )}

                    <div style={rowStyle}>
                        <Button
                            variant="modal"
                            onClick={() =>
                                openBackupsFolder().catch((err) =>
                                    showErrorModal(
                                        "Failed to open folder",
                                        String(err),
                                    ),
                                )
                            }
                        >
                            Open backups folder
                        </Button>
                    </div>
                </div>
    );
}
