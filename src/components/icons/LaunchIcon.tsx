import { oklch } from "../../utils/colors";

interface Props {
    children?: React.ReactNode;
    size?: number;
    color?: React.CSSProperties["color"];
}

export default function LaunchIcon(props: Props) {
    const style: React.CSSProperties = {
        width: props.size ?? 18,
        height: props.size ?? 18,
        color: props.color ?? oklch(0.9, 0, 0),
    };

    return (
        <svg
            style={style}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            role="img"
            aria-label="Launch Icon"
        >
            <title>Launch Icon</title>
            <path
                fillRule="evenodd"
                d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653Z"
                clipRule="evenodd"
            />
        </svg>
    );
}
