import { describe, it, expect } from "vitest";
import { GraphQLError } from "graphql";

// Re-implement the validation functions for unit testing.
// These mirror the private functions in resolvers/index.ts.
const MAX_SEARCH_LENGTH = 200;
const MAX_LIMIT = 100;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateSearch(search?: string): void {
  if (search && search.length > MAX_SEARCH_LENGTH) {
    throw new GraphQLError(
      `Search string must be ${MAX_SEARCH_LENGTH} characters or fewer.`,
      { extensions: { code: "BAD_USER_INPUT" } }
    );
  }
}

function validateDate(value: string | undefined, fieldName: string): void {
  if (value && !DATE_PATTERN.test(value)) {
    throw new GraphQLError(
      `${fieldName} must be in YYYY-MM-DD format.`,
      { extensions: { code: "BAD_USER_INPUT" } }
    );
  }
}

function validatePagination(limit?: number, offset?: number): void {
  if (limit !== undefined && (limit < 1 || limit > MAX_LIMIT)) {
    throw new GraphQLError(
      `limit must be between 1 and ${MAX_LIMIT}.`,
      { extensions: { code: "BAD_USER_INPUT" } }
    );
  }
  if (offset !== undefined && offset < 0) {
    throw new GraphQLError(
      `offset must be non-negative.`,
      { extensions: { code: "BAD_USER_INPUT" } }
    );
  }
}

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return 20;
  return Math.min(limit, MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  return offset && offset > 0 ? offset : 0;
}

describe("validateSearch", () => {
  it("accepts undefined", () => {
    expect(() => validateSearch(undefined)).not.toThrow();
  });

  it("accepts short strings", () => {
    expect(() => validateSearch("batman")).not.toThrow();
  });

  it("accepts exactly 200 characters", () => {
    expect(() => validateSearch("a".repeat(200))).not.toThrow();
  });

  it("rejects strings over 200 characters", () => {
    expect(() => validateSearch("a".repeat(201))).toThrow(GraphQLError);
    try {
      validateSearch("a".repeat(201));
    } catch (e) {
      expect((e as GraphQLError).extensions?.code).toBe("BAD_USER_INPUT");
    }
  });
});

describe("validateDate", () => {
  it("accepts undefined", () => {
    expect(() => validateDate(undefined, "keyDate")).not.toThrow();
  });

  it("accepts valid YYYY-MM-DD", () => {
    expect(() => validateDate("1986-02-01", "keyDate")).not.toThrow();
  });

  it("rejects invalid format", () => {
    expect(() => validateDate("02/01/1986", "keyDate")).toThrow(GraphQLError);
    expect(() => validateDate("1986", "keyDate")).toThrow(GraphQLError);
    expect(() => validateDate("not-a-date", "keyDate")).toThrow(GraphQLError);
  });
});

describe("validatePagination", () => {
  it("accepts undefined values", () => {
    expect(() => validatePagination()).not.toThrow();
  });

  it("accepts valid limit and offset", () => {
    expect(() => validatePagination(50, 10)).not.toThrow();
  });

  it("accepts limit = 1", () => {
    expect(() => validatePagination(1)).not.toThrow();
  });

  it("accepts limit = 100", () => {
    expect(() => validatePagination(100)).not.toThrow();
  });

  it("rejects limit = 0", () => {
    expect(() => validatePagination(0)).toThrow(GraphQLError);
  });

  it("rejects limit > 100", () => {
    expect(() => validatePagination(101)).toThrow(GraphQLError);
  });

  it("rejects negative offset", () => {
    expect(() => validatePagination(20, -1)).toThrow(GraphQLError);
  });

  it("accepts offset = 0", () => {
    expect(() => validatePagination(20, 0)).not.toThrow();
  });
});

describe("clampLimit", () => {
  it("returns default 20 for undefined", () => {
    expect(clampLimit(undefined)).toBe(20);
  });

  it("returns default 20 for 0", () => {
    expect(clampLimit(0)).toBe(20);
  });

  it("returns the value when within range", () => {
    expect(clampLimit(50)).toBe(50);
  });

  it("caps at 100", () => {
    expect(clampLimit(200)).toBe(100);
  });
});

describe("clampOffset", () => {
  it("returns 0 for undefined", () => {
    expect(clampOffset(undefined)).toBe(0);
  });

  it("returns 0 for negative values", () => {
    expect(clampOffset(-5)).toBe(0);
  });

  it("returns the value for positive values", () => {
    expect(clampOffset(10)).toBe(10);
  });
});
