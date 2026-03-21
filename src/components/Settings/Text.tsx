interface Props {
    children?: React.ReactNode;
}

export default function Text({ children }: Props) {
    const style: React.CSSProperties = {
        color: "#DEDEDE",
        fontFamily: "TASA Explorer",
        fontSize: 18,
        fontWeight: 700,
        textAlign: "center",
    };

    return <span style={style}>{children}</span>;
}
