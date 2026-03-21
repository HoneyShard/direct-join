export const UI_STYLES = {
    COLORS: {
        BACKGROUND_DARK: "#1F1F1F",
        BACKGROUND_MEDIUM: "#1B1B1B",
        BACKGROUND_LIGHT: "#484848",
        TEXT_BRIGHT: "#DEDEDE",
        TEXT_MEDIUM: "#808080",
        BORDER: "#FFFFFF20",
        RED: "red",
        GREEN: "green",
        BLUE: "blue",
    },

    TYPOGRAPHY: {
        FONT_FAMILY_AVENIR: "TASA Explorer",
        FONT_SIZE_SMALL: 12,
        FONT_SIZE_NORMAL: 14,
        FONT_SIZE_LARGE: 20,
        FONT_WEIGHT_NORMAL: 500,
        FONT_WEIGHT_MEDIUM: 600,
        FONT_WEIGHT_BOLD: 700,
    },

    SPACING: {
        TINY: 4,
        SMALL: 6,
        MEDIUM: 8,
        LARGE: 10,
        XLARGE: 12,
    },

    DIMENSIONS: {
        BUTTON_HEIGHT: 30,
        INPUT_HEIGHT: 30,
        MODAL_MIN_WIDTH: 240,
        MODAL_BORDER_RADIUS: 12,
    },
} as const;

export const BUTTON_COLOR_THEMES = {
    default: {
        background: UI_STYLES.COLORS.BACKGROUND_MEDIUM,
        text: UI_STYLES.COLORS.TEXT_BRIGHT,
    },
    modal: {
        black: "#1B1B1B",
    } as const,
    header: {
        background: (active: boolean) =>
            active ? UI_STYLES.COLORS.BACKGROUND_DARK : "#1F1F1F",
        text: UI_STYLES.COLORS.TEXT_BRIGHT,
    },
    main: {
        red: "#FF4F3B",
        green: "#0B4",
        darkgreen: "#009733",
    } as const,
    settings: {
        red: "#E55745",
        green: "#00AA67",
        blue: "#4588F7",
    } as const,
    status: {
        red: "#E55745",
        green: "#00A94B",
        orange: "#D46C00",
    } as const,
};

export const STATUS_COLORS = {
    red: "#E55745",
    green: "#00A94B",
    orange: "#D46C00",
    gray: "#484848",
} as const;
