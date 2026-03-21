// Thanks ChatGPT!
function toSRGB(x: number) {
    return x <= 0.0031308
        ? 12.92 * x
        : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}

// Converts oklch to rgb if the webview doesn't support oklch
export function oklch(L: number, C: number, h: number, alpha: number = 1) {
    // if the web engine supports oklch
    if (CSS.supports("color", `oklch(${L} ${C} ${h} / ${alpha})`)) {
        return `oklch(${L} ${C} ${h} / ${alpha})`;
    }
    console.log("notsupported");

    // fallback to RGB if it doesn't
    const hr = h * Math.PI / 180;

    const a = C * Math.cos(hr);
    const b = C * Math.sin(hr);

    const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
    const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
    const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

    const l = l_ ** 3;
    const m = m_ ** 3;
    const s = s_ ** 3;

    let r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

    r = toSRGB(r);
    g = toSRGB(g);
    b2 = toSRGB(b2);

    return "#" + [
        Math.round(Math.min(Math.max(0, r), 1) * 255),
        Math.round(Math.min(Math.max(0, g), 1) * 255),
        Math.round(Math.min(Math.max(0, b2), 1) * 255),
        Math.round(Math.min(Math.max(0, alpha), 1) * 255)
    ].join("");
}