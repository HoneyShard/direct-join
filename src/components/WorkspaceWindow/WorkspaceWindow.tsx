import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { AnimatePresence } from "motion/react";
import { useEffect } from "react";
import { useModalStore } from "../../store";
import { readProfiles } from "../../utils";
import { oklch } from "../../utils/colors";
import TrafficLight from "../Header/TrafficLight";
import Modal, { ModalButton } from "../Modal";
import WorkspaceTools from "../WorkspaceTools";

export default function WorkspaceWindow() {
    const modal = useModalStore();

    useEffect(() => {
        readProfiles();

        const preventDefault = (event: MouseEvent) => event.preventDefault();
        window.addEventListener("contextmenu", preventDefault);
        return () => window.removeEventListener("contextmenu", preventDefault);
    }, []);

    const headerStyle: React.CSSProperties = {
        position: "relative",
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        minHeight: 46,
        paddingLeft: 20,
        paddingRight: 8,
        backgroundColor: oklch(0.22, 0, 0),
        borderBottom: "1px solid #FFFFFF20",
        zIndex: 3,
    };

    const titleStyle: React.CSSProperties = {
        position: "absolute",
        left: "50%",
        transform: "translateX(-50%)",
        color: oklch(0.9, 0, 0),
        fontFamily: "TASA Explorer",
        fontSize: 18,
        fontWeight: 700,
    };

    const bodyStyle: React.CSSProperties = {
        display: "flex",
        flexDirection: "column",
        flexGrow: 1,
        minHeight: 0,
        overflowY: "auto",
    };

    return (
        <div
            style={{ display: "flex", flexDirection: "column", height: "100vh" }}
        >
            <AnimatePresence>
                {modal.modals.length !== 0 && (
                    <Modal
                        key={modal.modals[0].id}
                        title={modal.modals[0].title}
                        text={modal.modals[0].text}
                        progress={modal.modals[0].progress}
                        progressText={modal.modals[0].progressText}
                        isIndeterminate={modal.modals[0].isIndeterminate}
                    >
                        {modal.modals[0].buttons.map((button) => (
                            <ModalButton
                                key={button.text}
                                icon={button.icon}
                                onClick={button.onClick}
                            >
                                {button.text}
                            </ModalButton>
                        ))}
                    </Modal>
                )}
            </AnimatePresence>
            <header style={headerStyle} data-tauri-drag-region>
                <TrafficLight
                    color="red"
                    onClick={() => getCurrentWebviewWindow().close()}
                />
                <span style={titleStyle} data-tauri-drag-region>
                    Autoexec / Workspace
                </span>
            </header>
            <div style={bodyStyle}>
                <WorkspaceTools />
            </div>
        </div>
    );
}
