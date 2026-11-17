/**
 * The engine's refusal as an info panel shows it (ABT #2277): its first sentence inline, the whole
 * message in the tooltip. MKF's messages run to several sentences (what failed, why, what to do), and
 * long text around the panels hides the numbers (Alf, 2026-11-05).
 */
export function engineMessageInFull(message) {
    return String(message ?? '').replace(/^(Error:\s*)?(Exception:\s*)?/, '').replace(/^\[[A-Z_]+\]\s*/, '').trim();
}

export function engineMessageFirstSentence(message) {
    const full = engineMessageInFull(message);
    const end = full.search(/[.:](\s|$)/);
    return end > 0 ? full.slice(0, end) + '.' : full;
}
