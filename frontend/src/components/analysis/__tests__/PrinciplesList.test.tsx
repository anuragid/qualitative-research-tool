import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { PrinciplesList } from "../PrinciplesList";
import type { DesignPrinciple } from "../../../types";

/**
 * Regression test for Sentry JAVASCRIPT-REACT-6.
 *
 * The crash manifested as
 *   TypeError: Cannot read properties of undefined (reading 'length')
 * thrown from Array.map inside PrinciplesList. Root cause was that
 * `principle.how_might_we` sometimes arrived as `null` from the jsonb
 * column, and the render path called `.length` + `.map()` on it without
 * a guard. The surrounding `principles` array could also be null when
 * the parent "not_started" sentinel was in play.
 *
 * Fix C patched PrinciplesList and its sibling components
 * surgically. PR #21 generalises the fix by:
 *  - adding zod schemas at the API boundary so the shape is validated,
 *  - adding `principles ?? []` guards at every list entry point,
 *  - verifying it here with these regression cases.
 */

describe("PrinciplesList — defensive rendering (regression for JAVASCRIPT-REACT-6)", () => {
  afterEach(cleanup);

  it("renders without crash when principle.how_might_we is null", () => {
    const principles: DesignPrinciple[] = [
      {
        principle_id: "p1",
        insight_id: "i1",
        principle: "Do a thing",
        rationale: "because",
        how_might_we: null,
        priority: "high",
      },
    ];
    expect(() =>
      render(<PrinciplesList principles={principles} />),
    ).not.toThrow();
  });

  it("renders without crash when principles is empty array", () => {
    expect(() => render(<PrinciplesList principles={[]} />)).not.toThrow();
  });

  it("renders without crash when principles is null (sentinel case)", () => {
    // Deliberately cast — at runtime a "not_started" payload can set
    // the field to null even though the prop type narrows it away.
    expect(() =>
      render(<PrinciplesList principles={null as unknown as DesignPrinciple[]} />),
    ).not.toThrow();
  });

  it("renders without crash when principles is undefined", () => {
    expect(() =>
      render(
        <PrinciplesList principles={undefined as unknown as DesignPrinciple[]} />,
      ),
    ).not.toThrow();
  });

  it("renders in grid view without crashing on null how_might_we", () => {
    const principles: DesignPrinciple[] = [
      {
        principle_id: "p1",
        insight_id: "i1",
        principle: "Do a thing",
        rationale: "because",
        how_might_we: null,
        priority: "high",
      },
    ];
    expect(() =>
      render(<PrinciplesList principles={principles} viewMode="grid" />),
    ).not.toThrow();
  });

  it("renders in table view without crashing on null how_might_we", () => {
    const principles: DesignPrinciple[] = [
      {
        principle_id: "p1",
        insight_id: "i1",
        principle: "Do a thing",
        rationale: "because",
        how_might_we: null,
        priority: "high",
      },
    ];
    expect(() =>
      render(<PrinciplesList principles={principles} viewMode="table" />),
    ).not.toThrow();
  });

  it("renders in table view when principles itself is null", () => {
    expect(() =>
      render(
        <PrinciplesList
          principles={null as unknown as DesignPrinciple[]}
          viewMode="table"
        />,
      ),
    ).not.toThrow();
  });
});
