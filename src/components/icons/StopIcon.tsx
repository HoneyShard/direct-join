interface Props {
    children?: React.ReactNode;
    size?: number;
    color?: React.CSSProperties["color"];
}

export default function StopIcon(props: Props) {
    const style: React.CSSProperties = {
        width: props.size ?? 18,
        height: props.size ?? 18,
        color: props.color ?? "oklch(0.9 0 0)",
    };

    return (
        <svg
            style={style}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label="Stop Icon"
        >
            <title>Stop Icon</title>
            <path
                fillRule="evenodd"
                d="M4.5 7.5a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-9a3 3 0 0 1-3-3v-9Z"
                clipRule="evenodd"
            />
        </svg>
    );
}
