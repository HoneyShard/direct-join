import { motion } from "motion/react";
import type { CSSProperties } from "react";
import { useRef, useState } from "react";
import { UI_STYLES } from "../../constants/ui";
import type { IEditProfileModalProps } from "../../types/editProfileModal";
import { DEFAULT_AUTO_RELAUNCH } from "../../types/profile";
import { updateProfile } from "../../utils";
import { showErrorModal } from "../../utils/modal";
import Input from "../EditProfileModal/Input";
import Text from "../EditProfileModal/Text";
import Title from "../EditProfileModal/Title";
import Button from "../Shared/Button";

export default function RelaunchModal({
    profile,
    destruct,
}: IEditProfileModalProps) {
    const placeIdRef =
        useRef<[string, React.Dispatch<React.SetStateAction<string>>]>(null);
    const jobIdRef =
        useRef<[string, React.Dispatch<React.SetStateAction<string>>]>(null);
    const minutesRef =
        useRef<[string, React.Dispatch<React.SetStateAction<string>>]>(null);
    const initial = profile.autoRelaunch ?? DEFAULT_AUTO_RELAUNCH;
    const [onCrash, setOnCrash] = useState(initial.onCrash);
    const [onOffline, setOnOffline] = useState(initial.onOffline);

    async function save() {
        const placeIdText = placeIdRef.current?.[0].trim() ?? "";
        const minutesText = minutesRef.current?.[0].trim() ?? "";
        if (placeIdText && !/^\d+$/.test(placeIdText)) {
            showErrorModal("Invalid Place ID", "Place ID must be a number.");
            return;
        }
        if (minutesText && !/^\d+$/.test(minutesText)) {
            showErrorModal(
                "Invalid restart interval",
                "Force restart interval must be a whole number of minutes.",
            );
            return;
        }

        await updateProfile({
            ...profile,
            placeId: placeIdText ? Number(placeIdText) : null,
            jobId: jobIdRef.current?.[0].trim() || null,
            autoRelaunch: {
                onCrash,
                onOffline,
                forceRestartMinutes: minutesText ? Number(minutesText) : 0,
            },
        });
        destruct();
    }

    const style: CSSProperties = {
        position: "fixed",
        top: "50%",
        left: "50%",
        display: "flex",
        flexDirection: "column",
        minWidth: UI_STYLES.DIMENSIONS.MODAL_MIN_WIDTH,
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        padding: UI_STYLES.SPACING.XLARGE,
        backgroundColor: UI_STYLES.COLORS.BACKGROUND_DARK,
        border: `1px solid ${UI_STYLES.COLORS.BORDER}`,
        borderRadius: UI_STYLES.DIMENSIONS.MODAL_BORDER_RADIUS,
        zIndex: 1,
    };

    const checkStyle: CSSProperties = {
        display: "flex",
        alignItems: "center",
        gap: UI_STYLES.SPACING.MEDIUM,
        padding: `${UI_STYLES.SPACING.TINY}px ${UI_STYLES.SPACING.XLARGE}px`,
        color: UI_STYLES.COLORS.TEXT_BRIGHT,
        fontFamily: UI_STYLES.TYPOGRAPHY.FONT_FAMILY_AVENIR,
        fontSize: UI_STYLES.TYPOGRAPHY.FONT_SIZE_NORMAL,
    };

    const buttonContainerStyle: CSSProperties = {
        display: "flex",
        gap: UI_STYLES.SPACING.MEDIUM,
        marginTop: UI_STYLES.SPACING.TINY,
    };

    const blurStyle: CSSProperties = {
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        backdropFilter: "blur(4px)",
        zIndex: 0,
    };

    return (
        <>
            <motion.div
                initial={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                animate={{ opacity: 1, scale: 1, x: "-50%", y: "-50%" }}
                exit={{ opacity: 0, scale: 0.95, x: "-50%", y: "-50%" }}
                transition={{ duration: 0.2 }}
                style={style}
            >
                <Title>Relaunch Settings</Title>
                <Text>Place ID to join on launch. (optional)</Text>
                <Input
                    ref={placeIdRef}
                    placeholder="e.g. 920587237"
                    defaultValue={profile.placeId?.toString() ?? ""}
                />
                <Text>Server Job ID. (optional)</Text>
                <Input
                    ref={jobIdRef}
                    placeholder="Leave empty for any server"
                    defaultValue={profile.jobId ?? ""}
                />
                <Text>Force restart every N minutes. (0 = off)</Text>
                <Input
                    ref={minutesRef}
                    placeholder="0"
                    defaultValue={initial.forceRestartMinutes.toString()}
                />
                <label style={checkStyle}>
                    <input
                        type="checkbox"
                        checked={onCrash}
                        onChange={(e) => setOnCrash(e.target.checked)}
                    />
                    Relaunch on crash
                </label>
                <label style={checkStyle}>
                    <input
                        type="checkbox"
                        checked={onOffline}
                        onChange={(e) => setOnOffline(e.target.checked)}
                    />
                    Relaunch when offline
                </label>
                <div style={buttonContainerStyle}>
                    <Button variant="modal" onClick={destruct}>
                        Cancel
                    </Button>
                    <Button variant="modal" onClick={save}>
                        Save
                    </Button>
                </div>
            </motion.div>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={blurStyle}
            />
        </>
    );
}
