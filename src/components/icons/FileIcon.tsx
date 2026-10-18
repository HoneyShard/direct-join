import { oklch } from "../../utils/colors";

interface Props {
    children?: React.ReactNode;
}

export default function FileIcon(_props: Props) {
    const style: React.CSSProperties = {
        width: 22,
        height: 22,
        color: oklch(0.9, 0, 0),
    };

    return (
        <svg
            style={style}
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="3.5 1.25 17 21.5"
            strokeWidth={2}
            stroke="currentColor"
            role="img"
            aria-label="File Icon"
        >
            <title>File Icon</title>
            <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
        </svg>
    );
}
