import { useState } from "react";
import { CLIENT_NAME_VANILLA, FILTERS } from "../../constants";
import {
    useConfigStore,
    useFilterStore,
    useModalStore,
    useStore,
} from "../../store";
import { launchClient, removeProfile, stopClient } from "../../utils";
import FunnelIcon from "../icons/FunnelIcon";
import MinusIcon from "../icons/MinusIcon";
import PlusIcon from "../icons/PlusIcon";
import ProfileModal from "../ProfileModal";
import ManagerButton from "./ManagerButton";
import { AnimatePresence } from "motion/react";
import { FileIcon, LaunchIcon, StopIcon } from "../icons";
import { openWorkspaceWindow } from "../../utils/workspace";
import { IProfile, IState } from "../../types";

interface Props {
    children?: React.ReactNode;
}

export default function AccountManager(_props: Props) {
    const store = useStore();
    const modal = useModalStore();
    const config = useConfigStore();
    const filter = useFilterStore();
    const [profileModal, setProfileModal] = useState<React.ReactNode | null>(
        null,
    );

    function onCreate() {
        const destruct = () => setProfileModal(null);
        setProfileModal(<ProfileModal destruct={destruct} />);
    }

    function onRemove() {
        if (store.selectedIndex === null) return;

        const profile = store.profiles[store.selectedIndex];
        const id = crypto.randomUUID();
        modal.add({
            id,
            title: "Remove Profile",
            text: `Are you sure you want to delete '${profile.name ?? `Profile: ${profile.id}`}'?`,
            buttons: [
                {
                    text: "No",
                    onClick: () => modal.remove(id),
                },
                {
                    text: "Yes",
                    onClick: () =>
                        modal.remove(id) ?? removeProfile(profile.id),
                },
            ],
        });
    }

    async function onLaunch(
        client: string | null = config.config.client,
        profile: IProfile | null = null,
    ) {
        if (!client) {
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
            }

            if (config.config.client) {
                client = config.config.client;
            } else {
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
                        ...config.config.clients.map((c) => ({
                            text: c.name,
                            onClick: () =>
                                modal.remove(id) ?? onLaunch(c.name, profile),
                        })),
                    ],
                });
                return;
            }
        }

        // launch all
        if (!profile) {
            for (const profile of store.profiles) {
                await onLaunch(client, profile);
            }
            return;
        }

        const state =
            store.states.find((s) => s.profileId === profile.id) ?? null;
        if (!state) return;

        // launching the instance or already launched
        if (state.connected || state.pid) return;

        const launched = await launchClient(
            client,
            profile.id,
            profile.cookie,
        ).catch((err: Error) => err);
        if (launched instanceof Error) {
            const id = crypto.randomUUID();
            modal.add({
                id,
                title: "Failed to launch client",
                text: launched.message,
                buttons: [
                    {
                        text: "Okay",
                        onClick: () => modal.remove(id),
                    },
                ],
            });
            return;
        }

        if (client === CLIENT_NAME_VANILLA) {
            (launched as IState).connected = true;
            (launched as IState).client = CLIENT_NAME_VANILLA;
        }
        store.updateState(launched);
    }

    async function onStop(profile: IProfile | null = null) {
        // stop all
        if (!profile) {
            for (const profile of store.profiles) {
                await onStop(profile);
            }
            return;
        }

        const state =
            store.states.find((s) => s.profileId === profile.id) ?? null;
        if (!state) return;

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
        }
    }

    function onFilter() {
        filter.setFilter((filter.filter + 1) % filter.filterCount);
    }

    const style: React.CSSProperties = {
        display: "flex",
        marginBottom: 6,
        flexShrink: 0,
        justifyContent: "space-between",
    };

    const containerStyle: React.CSSProperties = {
        display: "flex",
        gap: 4,
    };

    return (
        <>
            <AnimatePresence>{profileModal}</AnimatePresence>
            <div style={style}>
                <div style={containerStyle}>
                    <ManagerButton icon={<PlusIcon />} onClick={onCreate} />
                    <ManagerButton
                        active={store.selectedIndex !== null}
                        icon={<MinusIcon />}
                        onClick={onRemove}
                    />
                    <ManagerButton
                        icon={<LaunchIcon />}
                        onClick={() =>
                            onLaunch(
                                null,
                                store.selectedIndex !== null
                                    ? store.profiles[store.selectedIndex]
                                    : null,
                            )
                        }
                    >
                        {store.selectedIndex === null ? "Launch All" : "Launch"}
                    </ManagerButton>
                    <ManagerButton
                        icon={<StopIcon />}
                        onClick={() =>
                            onStop(
                                store.selectedIndex !== null
                                    ? store.profiles[store.selectedIndex]
                                    : null,
                            )
                        }
                    >
                        {store.selectedIndex === null ? "Stop All" : "Stop"}
                    </ManagerButton>
                </div>
                <div style={containerStyle}>
                    <ManagerButton
                        icon={<FileIcon />}
                        onClick={() => openWorkspaceWindow()}
                    />
                    <ManagerButton icon={<FunnelIcon />} onClick={onFilter}>
                        {FILTERS[filter.filter]}
                    </ManagerButton>
                </div>
            </div>
        </>
    );
}
