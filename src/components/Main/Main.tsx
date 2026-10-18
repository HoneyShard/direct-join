import { emit, listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useStore } from "../../store";
import type { ICloseState } from "../../types/state";
import { onClientClosed, startWatchdog } from "../../utils/relaunch";
import AccountInfo from "./AccountInfo";
import AccountList from "./AccountList";

interface Props {
    children?: React.ReactNode;
}

export default function Main(_props: Props) {
    const store = useStore();

    useEffect(() => {
        const stopWatchdog = startWatchdog();
        const unlisten = listen<ICloseState>("client_close", (event) =>
            onClientClosed(event.payload.profileId, event.payload.exitCode),
        );
        // The workspace window has no process state of its own, so answer its requests
        const unlistenStates = listen("workspace_request_states", () =>
            emit(
                "workspace_states",
                useStore
                    .getState()
                    .states.filter((state) => state.connected)
                    .map((state) => state.profileId),
            ),
        );
        return () => {
            stopWatchdog();
            unlisten.then((unlisten) => unlisten());
            unlistenStates.then((unlisten) => unlisten());
        };
    }, []);

    const style: React.CSSProperties = {
        display: "flex",
        flexGrow: 1,
        gap: 12,
    };

    const selectedProfile =
        store.selectedIndex !== null
            ? store.profiles[store.selectedIndex]
            : null;
    const selectedState =
        store.states.find((state) => state.profileId === selectedProfile?.id) ??
        null;

    return (
        <main style={style}>
            <AccountInfo
                key={selectedProfile?.id ?? null}
                profile={selectedProfile}
                state={selectedState}
            />
            <AccountList />
        </main>
    );
}
