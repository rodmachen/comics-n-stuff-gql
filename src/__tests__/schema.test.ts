import { describe, it, expect } from "vitest";
import { buildSchema, printSchema } from "graphql";
import { typeDefs } from "../graphql/typeDefs/index.js";

describe("GraphQL Schema", () => {
  it("builds without errors", () => {
    expect(() => buildSchema(typeDefs)).not.toThrow();
  });

  it("has all expected query fields", () => {
    const schema = buildSchema(typeDefs);
    const queryType = schema.getQueryType()!;
    const fields = Object.keys(queryType.getFields());

    expect(fields).toContain("publishers");
    expect(fields).toContain("publisher");
    expect(fields).toContain("allSeries");
    expect(fields).toContain("series");
    expect(fields).toContain("issues");
    expect(fields).toContain("issue");
    expect(fields).toContain("stories");
    expect(fields).toContain("story");
    expect(fields).toContain("creators");
    expect(fields).toContain("creator");
    expect(fields).toContain("countries");
    expect(fields).toContain("languages");
    expect(fields).toContain("storyTypes");
    expect(fields).toContain("creditTypes");
    expect(fields).toContain("seriesPublicationTypes");
  });

  it("has all expected types", () => {
    const schema = buildSchema(typeDefs);
    const typeMap = schema.getTypeMap();

    const expectedTypes = [
      "Publisher",
      "Series",
      "Issue",
      "Story",
      "StoryCredit",
      "Creator",
      "CreatorNameDetail",
      "Country",
      "Language",
      "StoryType",
      "CreditType",
      "SeriesPublicationType",
      "PublisherConnection",
      "SeriesConnection",
      "IssueConnection",
      "StoryConnection",
      "CreatorConnection",
    ];

    for (const typeName of expectedTypes) {
      expect(typeMap[typeName], `missing type: ${typeName}`).toBeDefined();
    }
  });

  it("connection types have items and totalCount", () => {
    const schema = buildSchema(typeDefs);
    const connectionTypes = [
      "PublisherConnection",
      "SeriesConnection",
      "IssueConnection",
      "StoryConnection",
      "CreatorConnection",
    ];

    for (const name of connectionTypes) {
      const type = schema.getType(name);
      expect(type, `${name} should exist`).toBeDefined();
      if (type && "getFields" in type) {
        const fields = (type as { getFields: () => Record<string, unknown> }).getFields();
        expect(fields).toHaveProperty("items");
        expect(fields).toHaveProperty("totalCount");
      }
    }
  });

  it("generates consistent SDL output", () => {
    const schema = buildSchema(typeDefs);
    const sdl = printSchema(schema);

    // Should contain key type definitions
    expect(sdl).toContain("type Publisher");
    expect(sdl).toContain("type Issue");
    expect(sdl).toContain("type Query");
    expect(sdl).toContain("totalCount: Int!");
  });
});
