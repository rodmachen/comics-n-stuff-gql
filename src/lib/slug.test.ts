import { describe, it, expect } from "vitest";
import { seriesSlug } from "./slug.js";

describe("seriesSlug", () => {
  it("produces kebab-case with year", () => {
    expect(seriesSlug({ name: "Crisis on Infinite Earths", yearBegan: 1985 }))
      .toBe("crisis-on-infinite-earths-1985");
  });

  it("lowercases the name", () => {
    expect(seriesSlug({ name: "ACTION COMICS", yearBegan: 1938 }))
      .toBe("action-comics-1938");
  });

  it("strips colon and adjacent space", () => {
    expect(seriesSlug({ name: "Batman: Shadow of the Bat", yearBegan: 1992 }))
      .toBe("batman-shadow-of-the-bat-1992");
  });

  it("strips ampersand", () => {
    expect(seriesSlug({ name: "Batman & Robin", yearBegan: 1997 }))
      .toBe("batman-robin-1997");
  });

  it("drops diacritics", () => {
    expect(seriesSlug({ name: "Résistance", yearBegan: 1944 }))
      .toBe("resistance-1944");
  });

  it("collapses multiple spaces/hyphens", () => {
    expect(seriesSlug({ name: "The  Flash", yearBegan: 1959 }))
      .toBe("the-flash-1959");
  });

  it("Batman 1940 and Batman 2011 produce distinct slugs", () => {
    const a = seriesSlug({ name: "Batman", yearBegan: 1940 });
    const b = seriesSlug({ name: "Batman", yearBegan: 2011 });
    expect(a).toBe("batman-1940");
    expect(b).toBe("batman-2011");
    expect(a).not.toBe(b);
  });

  it("appends id when provided as tiebreaker", () => {
    expect(seriesSlug({ name: "Showcase", yearBegan: 1956, id: 99 }))
      .toBe("showcase-1956-99");
  });

  it("same name and year with different ids produce distinct slugs", () => {
    const a = seriesSlug({ name: "Detective Comics", yearBegan: 1937, id: 1 });
    const b = seriesSlug({ name: "Detective Comics", yearBegan: 1937, id: 2 });
    expect(a).not.toBe(b);
  });

  it("trims leading and trailing whitespace", () => {
    expect(seriesSlug({ name: "  Superman  ", yearBegan: 1939 }))
      .toBe("superman-1939");
  });

  it("handles numbers in the name", () => {
    expect(seriesSlug({ name: "52", yearBegan: 2006 }))
      .toBe("52-2006");
  });
});
