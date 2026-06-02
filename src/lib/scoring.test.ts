import { describe, it, expect } from "vitest";
import { calcPoints, MISSED_PREDICTION_POINTS } from "./scoring";

describe("calcPoints", () => {
  describe("exact match (+5)", () => {
    it("returns 5 for identical scores", () => {
      expect(calcPoints({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(5);
    });
    it("returns 5 for identical 0x0 draw", () => {
      expect(calcPoints({ home: 0, away: 0 }, { home: 0, away: 0 })).toBe(5);
    });
    it("returns 5 for identical away win", () => {
      expect(calcPoints({ home: 0, away: 3 }, { home: 0, away: 3 })).toBe(5);
    });
  });

  describe("inverse match (-1)", () => {
    it("returns -1 for mirrored result (2x1 vs 1x2)", () => {
      expect(calcPoints({ home: 2, away: 1 }, { home: 1, away: 2 })).toBe(-1);
    });
    it("returns -1 for mirrored 3x0 vs 0x3", () => {
      expect(calcPoints({ home: 3, away: 0 }, { home: 0, away: 3 })).toBe(-1);
    });
    it("does NOT return -1 for a draw mirror (draw is exact)", () => {
      // 1x1 vs 1x1 is exact, not inverse
      expect(calcPoints({ home: 1, away: 1 }, { home: 1, away: 1 })).toBe(5);
    });
  });

  describe("trend match (+2)", () => {
    it("returns 2 for same winner home (2x0 vs 3x1)", () => {
      expect(calcPoints({ home: 2, away: 0 }, { home: 3, away: 1 })).toBe(2);
    });
    it("returns 2 for same winner away (1x2 vs 0x3)", () => {
      expect(calcPoints({ home: 1, away: 2 }, { home: 0, away: 3 })).toBe(2);
    });
    it("returns 2 for draw on different score (1x1 vs 2x2)", () => {
      expect(calcPoints({ home: 1, away: 1 }, { home: 2, away: 2 })).toBe(2);
    });
  });

  describe("miss (0)", () => {
    it("returns 0 when predicted draw but home won", () => {
      expect(calcPoints({ home: 1, away: 1 }, { home: 2, away: 0 })).toBe(0);
    });
    it("returns 0 when predicted home win but draw happened", () => {
      expect(calcPoints({ home: 2, away: 1 }, { home: 1, away: 1 })).toBe(0);
    });
    it("returns 0 when predicted away win but home won (non-mirror)", () => {
      expect(calcPoints({ home: 0, away: 2 }, { home: 3, away: 1 })).toBe(0);
    });
  });

  describe("priority order", () => {
    it("exact takes priority over trend (2x1 vs 2x1 → +5, not +2)", () => {
      expect(calcPoints({ home: 2, away: 1 }, { home: 2, away: 1 })).toBe(5);
    });
    it("inverse takes priority over miss (2x1 vs 1x2 → -1, not 0)", () => {
      expect(calcPoints({ home: 2, away: 1 }, { home: 1, away: 2 })).toBe(-1);
    });
  });

  it("exports -2 as the missed-prediction penalty constant", () => {
    expect(MISSED_PREDICTION_POINTS).toBe(-2);
  });
});
