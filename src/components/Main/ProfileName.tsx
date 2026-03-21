interface Props {
    children?: React.ReactNode;
}

export default function ProfileName({ children }: Props) {
    const style: React.CSSProperties = {
        color: "#808080",
        fontFamily: "TASA Explorer",
        fontSize: 9,
        fontWeight: 500,
        textAlign: "start",
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
    };

    return <span style={style}>{children}</span>;
}
