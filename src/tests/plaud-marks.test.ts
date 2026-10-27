import { describe, expect, it } from "vitest";
import { buildMarksContext, formatClock } from "@/lib/ai/marks-context";
import {
    parseMarks,
    readStoredMarks,
    selectMarkItem,
} from "@/lib/plaud/marks";

// Shape of Plaud's `mark_memo` payload for a recording where the highlight
// button was pressed (text only appears after Plaud transcribes it).
const rawMark = (timestamp: number, overrides: Record<string, unknown> = {}) => ({
    timestamp,
    mark_type: 4,
    mark_content: "Highlighted. Available after transcription.",
    content: null,
    title: null,
    expanded_content: null,
    is_user_deleted: false,
    ...overrides,
});

describe("selectMarkItem", () => {
    it("finds the mark_memo item and ignores others", () => {
        const item = { data_id: "source:1", data_type: "mark_memo" };
        const detail = {
            status: 0,
            data: {
                content_list: [{ data_type: "outline" }, item],
            },
        };
        expect(selectMarkItem(detail)).toBe(item);
        expect(selectMarkItem({ status: 0, data: { content_list: [] } })).toBe(
            undefined,
        );
        expect(selectMarkItem({ status: 0 })).toBe(undefined);
    });
});

describe("parseMarks", () => {
    it("sorts marks, drops deleted/invalid ones and the placeholder text", () => {
        const marks = parseMarks([
            rawMark(3_959_000),
            rawMark(1_777_300),
            rawMark(2_171_000, { is_user_deleted: true }),
            rawMark(-5),
            rawMark(Number.NaN),
            "junk",
            rawMark(1_777_300), // duplicate time
        ]);
        expect(marks).toEqual([
            { timestampMs: 1_777_300, type: 4, text: null },
            { timestampMs: 3_959_000, type: 4, text: null },
        ]);
    });

    it("keeps real text and accepts a JSON string payload", () => {
        const marks = parseMarks(
            JSON.stringify([rawMark(1000, { content: "  Call the vendor " })]),
        );
        expect(marks).toEqual([
            { timestampMs: 1000, type: 4, text: "Call the vendor" },
        ]);
    });

    it("returns [] for unknown shapes", () => {
        expect(parseMarks(undefined)).toEqual([]);
        expect(parseMarks("not json")).toEqual([]);
        expect(parseMarks({ marks: [] })).toEqual([]);
    });
});

describe("readStoredMarks", () => {
    it("tolerates anything in the jsonb column", () => {
        expect(readStoredMarks(null)).toEqual([]);
        expect(readStoredMarks([{ timestampMs: 5 }, { nope: 1 }, null])).toEqual([
            { timestampMs: 5, type: null, text: null },
        ]);
    });
});

describe("buildMarksContext", () => {
    const transcript = [
        "[27:00] earlier talk",
        "[29:20] about the clinical pilot",
        "[29:37] the key decision is to simplify the therapist view",
        "[30:05] and we ship it in March",
        "[40:00] unrelated",
    ].join("\n");

    it("is empty without marks", () => {
        expect(buildMarksContext([], transcript)).toBe("");
    });

    it("includes the transcript lines around each mark", () => {
        const out = buildMarksContext(
            [{ timestampMs: 1_777_300, type: 4, text: null }],
            transcript,
        );
        expect(out).toContain("highlight button");
        expect(out).toContain("- 29:37");
        expect(out).toContain("    [29:20] about the clinical pilot");
        expect(out).toContain("    [30:05] and we ship it in March");
        expect(out).not.toContain("[40:00]");
        expect(out).not.toContain("earlier talk"); // 37s before = outside the window
    });

    it("lists only times when the transcript has no timestamps", () => {
        const out = buildMarksContext(
            [{ timestampMs: 65_000, type: 4, text: "note" }],
            "plain text without times",
        );
        expect(out).toContain("- 01:05 (note: note)");
        expect(out).toContain("no timestamps");
    });
});

describe("formatClock", () => {
    it("formats minutes and hours", () => {
        expect(formatClock(0)).toBe("00:00");
        expect(formatClock(1_777_300)).toBe("29:37");
        expect(formatClock(3_959_000)).toBe("1:05:59");
    });
});
