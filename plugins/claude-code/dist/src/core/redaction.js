const SECRET_ASSIGNMENT = /\b([A-Z0-9_]*(?:API|TOKEN|SECRET|KEY|PASSWORD|PASS|AUTH)[A-Z0-9_]*)\s*=\s*([^\s"'`]+)/gi;
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/g;
const HIGH_ENTROPY = /\b[A-Za-z0-9_-]{32,}\b/g;
export function redactText(input) {
    const markers = [];
    let text = input.replace(SECRET_ASSIGNMENT, (_match, key) => {
        markers.push(`[redacted: ${key}]`);
        return `${key}=[redacted: secret-like assignment]`;
    });
    text = text.replace(BEARER_TOKEN, () => {
        markers.push("[redacted: bearer token]");
        return "Bearer [redacted: bearer token]";
    });
    text = text.replace(HIGH_ENTROPY, (match) => {
        if (looksLikePathOrHash(match)) {
            return match;
        }
        markers.push("[redacted: high-entropy token]");
        return "[redacted: high-entropy token]";
    });
    return { text, markers: unique(markers) };
}
export function truncateTail(input, maxChars, label) {
    if (input.length <= maxChars) {
        return { text: input, markers: [] };
    }
    const elided = input.length - maxChars;
    return {
        text: `[${label} truncated, ${elided} chars elided]\n${input.slice(-maxChars)}`,
        markers: [`[${label} truncated, ${elided} chars elided]`],
    };
}
export function redactAndTruncate(input, maxChars, label) {
    if (input === undefined) {
        return undefined;
    }
    const truncated = truncateTail(input, maxChars, label);
    const redacted = redactText(truncated.text);
    return {
        text: redacted.text,
        markers: unique([...truncated.markers, ...redacted.markers]),
    };
}
function unique(values) {
    return [...new Set(values)];
}
function looksLikePathOrHash(value) {
    return /^[a-f0-9]{32,}$/i.test(value);
}
//# sourceMappingURL=redaction.js.map