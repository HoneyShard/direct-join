import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import {
    CLIENT_NAME_MACSPLOIT,
    CLIENT_NAME_OPIUMWARE,
    PROFILE_CRASHED_SUFFIX,
    STATUS_LAUNCH,
    STATUS_LAUNCHING,
    STATUS_OFFLINE,
    STATUS_STOP,
} from "../../constants";
import { useConfigStore, useModalStore, useStore } from "../../store";
import type { IProfile } from "../../types/profile";
import type { ICloseState, IState } from "../../types/state";
import { startProfile, stopClient, updateProfile } from "../../utils";
import LaunchIcon from "../icons/LaunchIcon";
import LoadingIcon from "../icons/LoadingIcon";
import StopIcon from "../icons/StopIcon";
import SharedButton from "../Shared/Button";
import Status from "../Shared/Status";
import BigUsername from "./BigUsername";
import Thumbnail from "./Thumbnail";
import { showErrorModal } from "../../utils/modal";
import { oklch } from "../../utils/colors";

interface Props {
    profile: IProfile | null;
    state: IState | null;
    children?: React.ReactNode;
}

export default function AccountInfo({ profile, state }: Props) {
    const store = useStore();
    const modal = useModalStore();
    const config = useConfigStore();

    const [placeId, setPlaceId] = useState(profile?.placeId?.toString() ?? "");

    // Keep the field in sync when the place id is changed from the relaunch settings
    useEffect(() => {
        setPlaceId(profile?.placeId?.toString() ?? "");
    }, [profile?.placeId]);

    /** Saves the place id field to the profile. Returns false if it is invalid. */
    async function commitPlaceId() {
        if (!profile) return true;
        const text = placeId.trim();
        if (text && !/^\d+$/.test(text)) {
            showErrorModal("Invalid Place ID", "Place ID must be a number.");
            return false;
        }
        const next = text ? Number(text) : null;
        if (next !== (profile.placeId ?? null)) {
            await updateProfile({ ...profile, placeId: next });
        }
        return true;
    }

    useEffect(() => {
        const unlistenOpen = listen<IState>("client_open", (event) => {
            store.updateState(event.payload);
        });

        const unlistenClose = listen<ICloseState>("client_close", (event) => {
            store.updateState({
                profileId: event.payload.profileId,
                connected: false,
                pid: null,
                client: null,
                port: null,
            });

            const profile = store.profiles.find(
                (profile) => profile.id === event.payload.profileId,
            );
            if (
                event.payload.exitCode !== 0 &&
                event.payload.exitCode !== 9 &&
                !profile?.autoRelaunch?.onCrash
            ) {
                const id = crypto.randomUUID();
                modal.add({
                    id,
                    title:
                        profile?.name ??
                        `Profile: ${event.payload.profileId} ${PROFILE_CRASHED_SUFFIX}`,
                    text: `Your client has crashed with exit code ${event.payload.exitCode}.\nThis is usually an issue with the client, please contact the corresponding developers.`,
                    buttons: [
                        {
                            text: "Okay",
                            onClick: () => modal.remove(id),
                        },
                    ],
                });
            }
        });

        return () => {
            unlistenOpen.then((unlisten) => unlisten());
            unlistenClose.then((unlisten) => unlisten());
        };
    }, [store.updateState, store.profiles, modal.add, modal.remove]);

    async function launch(client = config.config.client) {
        if (!profile || !state) return;

        // launching the instance
        if (!state.connected && state.pid) return;

        if (state.connected) {
            if (state.pid === null) {
                const id = crypto.randomUUID();
                modal.add({
                    id,
                    title: "Cannot stop client",
                    text: "PID is null, unable to stop the client.",
                    buttons: [
                        {
                            text: "Okay",
                            onClick: () => modal.remove(id),
                        },
                    ],
                });
                return;
            }

            const stopped = await stopClient(state.pid).catch(
                (err) => new Error(err),
            );
            if (stopped instanceof Error) {
                const id = crypto.randomUUID();
                modal.add({
                    id,
                    title: "Failed to stop client",
                    text: stopped.message,
                    buttons: [
                        {
                            text: "Okay",
                            onClick: () => modal.remove(id),
                        },
                    ],
                });
            }
        } else {
            if (config.config.clients.length === 0) {
                const id = crypto.randomUUID();
                modal.add({
                    id,
                    title: "No client installation found",
                    text: "Please install a client from the settings tab (top right) before selecting one!",
                    buttons: [
                        {
                            text: "Okay",
                            onClick: () => modal.remove(id),
                        },
                    ],
                });
                return;
            } else if (!client) {
                const id = crypto.randomUUID();
                modal.add({
                    id,
                    title: "Client Selection",
                    text: "Please select a client to run!",
                    buttons: [
                        {
                            text: "Cancel",
                            onClick: () => modal.remove(id),
                        },
                        ...config.config.clients.map((client) => ({
                            text: client.name,
                            onClick: () =>
                                modal.remove(id) ?? launch(client.name),
                        })),
                    ],
                });
                return;
            }

            if (!(await commitPlaceId())) return;

            const started = await startProfile(profile.id, client).catch(
                (err: Error) => err,
            );
            if (started instanceof Error) {
                const id = crypto.randomUUID();
                modal.add({
                    id,
                    title: "Failed to launch client",
                    text: started.message,
                    buttons: [
                        {
                            text: "Okay",
                            onClick: () => modal.remove(id),
                        },
                    ],
                });
            }
        }
    }

    const style: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        width: 260,
        padding: 10,
        backgroundColor: oklch(0.22, 0, 0),
        border: "1px solid #FFFFFF20",
        borderRadius: 12,
        justifyContent: "space-between",
    };

    const topContainerStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        gap: 4,
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
    };

    const bottomContainerStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        gap: 8,
        alignItems: "center",
    };

    const placeIdStyle: React.CSSProperties = {
        width: "100%",
        boxSizing: "border-box",
        padding: "6px 10px",
        backgroundColor: oklch(0.28, 0, 0),
        color: oklch(0.95, 0, 0),
        border: 0,
        borderRadius: 8,
        outline: 0,
        fontFamily: "TASA Explorer",
        fontSize: 12,
        textAlign: "center",
    };

    const launchColor = state?.connected
        ? "red"
        : state?.pid
          ? "darkgreen"
          : "green";
    const launchIcon = state?.connected ? (
        <StopIcon size={24} color={"white"} />
    ) : state?.pid ? (
        <LoadingIcon />
    ) : (
        <LaunchIcon size={24} color={"white"} />
    );
    const launchText = state?.connected
        ? STATUS_STOP
        : state?.pid
          ? STATUS_LAUNCHING
          : STATUS_LAUNCH;

    let statusText: string = STATUS_OFFLINE;
    if (profile && state && state.connected && state.client) {
        statusText = state.client;
        if (state.port) {
            // modified clients
            statusText = state.client;
            if (
                [CLIENT_NAME_MACSPLOIT, CLIENT_NAME_OPIUMWARE].includes(
                    state.client,
                )
            ) {
                statusText += ` ${state.port}`;
            }
        }
        statusText += ` | PID ${state.pid}`;
    }

    return (
        <>
            {profile && state ? (
                <div style={style}>
                    <div style={topContainerStyle}>
                        <Status color={state.connected ? "green" : "red"}>
                            {statusText}
                        </Status>
                        <BigUsername
                            displayName={profile.displayName}
                            username={profile.username}
                        />
                        {profile.thumbnail && (
                            <Thumbnail
                                thumbnail={profile.thumbnail}
                                size={100}
                            />
                        )}
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                gap: 4,
                                width: "100%",
                            }}
                        >
                            {profile.note && (
                                <span
                                    style={{
                                        color: oklch(0.9, 0, 0, 0.8),
                                        fontFamily: "TASA Explorer",
                                        fontSize: 11,
                                        textAlign: "center",
                                        wordBreak: "break-all",
                                        maxWidth: "90%",
                                    }}
                                >
                                    {profile.note}
                                </span>
                            )}
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    alignItems: "center",
                                    gap: 2,
                                }}
                            >
                                <span
                                    style={{
                                        color: oklch(0.7, 0, 0),
                                        fontFamily: "TASA Explorer",
                                        fontSize: 10,
                                        fontWeight: 500,
                                    }}
                                >
                                    ID: {profile.userId}
                                </span>
                                {profile.lastPlayedAt > 0 && (
                                    <span
                                        style={{
                                            color: oklch(0.7, 0, 0),
                                            fontFamily: "TASA Explorer",
                                            fontSize: 10,
                                            fontWeight: 500,
                                        }}
                                    >
                                        Last Played:{" "}
                                        {new Date(
                                            profile.lastPlayedAt,
                                        ).toLocaleString("en-US")}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div style={bottomContainerStyle}>
                        <input
                            style={placeIdStyle}
                            placeholder="Place ID (direct join)"
                            value={placeId}
                            disabled={!!state.pid}
                            onChange={(e) => setPlaceId(e.target.value)}
                            onBlur={commitPlaceId}
                            onKeyDown={(e) => e.key === "Enter" && launch()}
                        />
                        <SharedButton
                            variant="main"
                            color={launchColor}
                            cursor={state.connected || !state.pid}
                            icon={launchIcon}
                            onClick={() => launch()}
                        >
                            {launchText}
                        </SharedButton>
                    </div>
                </div>
            ) : null}
        </>
    );
}
