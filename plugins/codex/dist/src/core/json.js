export function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
export function readString(source, key) {
    const value = source[key];
    return typeof value === "string" ? value : undefined;
}
export function readNumber(source, key) {
    const value = source[key];
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
export function readRecord(source, key) {
    const value = source[key];
    return isRecord(value) ? value : undefined;
}
export function toJsonValue(value) {
    if (value === null) {
        return null;
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => toJsonValue(item));
    }
    if (isRecord(value)) {
        const output = {};
        for (const [key, nested] of Object.entries(value)) {
            output[key] = toJsonValue(nested);
        }
        return output;
    }
    return String(value);
}
export function stableStringify(value) {
    if (typeof value === "string") {
        return value;
    }
    try {
        return JSON.stringify(value);
    }
    catch {
        return String(value);
    }
}
export function parseJsonObject(input) {
    const parsed = JSON.parse(input);
    if (!isRecord(parsed)) {
        throw new Error("Expected a JSON object.");
    }
    return parsed;
}
//# sourceMappingURL=json.js.map