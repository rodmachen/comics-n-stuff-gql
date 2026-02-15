import { prisma } from "../../lib/prisma.js";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(limit?: number): number {
  if (!limit || limit < 1) return DEFAULT_LIMIT;
  return Math.min(limit, MAX_LIMIT);
}

function clampOffset(offset?: number): number {
  return offset && offset > 0 ? offset : 0;
}

// Convert SmallInt (0/1) to boolean for GraphQL Boolean fields
function intToBool(val: number): boolean {
  return val === 1;
}

interface PaginationArgs {
  limit?: number;
  offset?: number;
}

interface SearchArgs extends PaginationArgs {
  search?: string;
}

export const resolvers = {
  // ─── Query Resolvers ──────────────────────────────────────────────────────

  Query: {
    // Publishers
    publishers: async (
      _: unknown,
      { limit, offset, search }: SearchArgs
    ) => {
      return prisma.publisher.findMany({
        take: clampLimit(limit),
        skip: clampOffset(offset),
        where: {
          deleted: 0,
          ...(search && {
            name: { contains: search, mode: "insensitive" as const },
          }),
        },
        orderBy: { name: "asc" },
      });
    },

    publisher: async (_: unknown, { id }: { id: number }) => {
      return prisma.publisher.findUnique({ where: { id } });
    },

    // Series
    allSeries: async (
      _: unknown,
      {
        limit,
        offset,
        search,
        publisherId,
      }: SearchArgs & { publisherId?: number }
    ) => {
      return prisma.series.findMany({
        take: clampLimit(limit),
        skip: clampOffset(offset),
        where: {
          deleted: 0,
          ...(search && {
            name: { contains: search, mode: "insensitive" as const },
          }),
          ...(publisherId && { publisherId }),
        },
        orderBy: { sortName: "asc" },
      });
    },

    series: async (_: unknown, { id }: { id: number }) => {
      return prisma.series.findUnique({ where: { id } });
    },

    // Issues
    issues: async (
      _: unknown,
      { limit, offset, seriesId }: PaginationArgs & { seriesId?: number }
    ) => {
      return prisma.issue.findMany({
        take: clampLimit(limit),
        skip: clampOffset(offset),
        where: {
          deleted: 0,
          ...(seriesId && { seriesId }),
        },
        orderBy: { sortCode: "asc" },
      });
    },

    issue: async (_: unknown, { id }: { id: number }) => {
      return prisma.issue.findUnique({ where: { id } });
    },

    // Stories
    stories: async (
      _: unknown,
      { limit, offset, issueId }: PaginationArgs & { issueId?: number }
    ) => {
      return prisma.story.findMany({
        take: clampLimit(limit),
        skip: clampOffset(offset),
        where: {
          deleted: 0,
          ...(issueId && { issueId }),
        },
        orderBy: { sequenceNumber: "asc" },
      });
    },

    story: async (_: unknown, { id }: { id: number }) => {
      return prisma.story.findUnique({ where: { id } });
    },

    // Creators
    creators: async (_: unknown, { limit, offset, search }: SearchArgs) => {
      return prisma.creator.findMany({
        take: clampLimit(limit),
        skip: clampOffset(offset),
        where: {
          deleted: 0,
          ...(search && {
            gcdOfficialName: {
              contains: search,
              mode: "insensitive" as const,
            },
          }),
        },
        orderBy: { sortName: "asc" },
      });
    },

    creator: async (_: unknown, { id }: { id: number }) => {
      return prisma.creator.findUnique({ where: { id } });
    },

    // Reference types
    countries: async () => {
      return prisma.country.findMany({ orderBy: { name: "asc" } });
    },

    languages: async () => {
      return prisma.language.findMany({ orderBy: { name: "asc" } });
    },

    storyTypes: async () => {
      return prisma.storyType.findMany({ orderBy: { sortCode: "asc" } });
    },

    creditTypes: async () => {
      return prisma.creditType.findMany({ orderBy: { sortCode: "asc" } });
    },

    seriesPublicationTypes: async () => {
      return prisma.seriesPublicationType.findMany({
        orderBy: { name: "asc" },
      });
    },
  },

  // ─── Relationship Resolvers ───────────────────────────────────────────────

  Publisher: {
    country: async (parent: { id: number }) => {
      const result = await prisma.publisher.findUnique({
        where: { id: parent.id },
        include: { country: true },
      });
      return result!.country;
    },
    series: async (
      parent: { id: number },
      { limit, offset }: PaginationArgs
    ) => {
      return prisma.series.findMany({
        where: { publisherId: parent.id, deleted: 0 },
        take: clampLimit(limit),
        skip: clampOffset(offset),
        orderBy: { sortName: "asc" },
      });
    },
  },

  Series: {
    publisher: async (parent: { publisherId: number }) => {
      return prisma.publisher.findUnique({
        where: { id: parent.publisherId },
      });
    },
    country: async (parent: { countryId: number }) => {
      return prisma.country.findUnique({ where: { id: parent.countryId } });
    },
    language: async (parent: { languageId: number }) => {
      return prisma.language.findUnique({ where: { id: parent.languageId } });
    },
    publicationType: async (parent: { publicationTypeId: number | null }) => {
      if (!parent.publicationTypeId) return null;
      return prisma.seriesPublicationType.findUnique({
        where: { id: parent.publicationTypeId },
      });
    },
    issues: async (
      parent: { id: number },
      { limit, offset }: PaginationArgs
    ) => {
      return prisma.issue.findMany({
        where: { seriesId: parent.id, deleted: 0 },
        take: clampLimit(limit),
        skip: clampOffset(offset),
        orderBy: { sortCode: "asc" },
      });
    },
  },

  Issue: {
    series: async (parent: { seriesId: number }) => {
      return prisma.series.findUnique({ where: { id: parent.seriesId } });
    },
    variantOf: async (parent: { variantOfId: number | null }) => {
      if (!parent.variantOfId) return null;
      return prisma.issue.findUnique({ where: { id: parent.variantOfId } });
    },
    variants: async (parent: { id: number }) => {
      return prisma.issue.findMany({
        where: { variantOfId: parent.id, deleted: 0 },
      });
    },
    stories: async (
      parent: { id: number },
      { limit, offset }: PaginationArgs
    ) => {
      return prisma.story.findMany({
        where: { issueId: parent.id, deleted: 0 },
        take: clampLimit(limit),
        skip: clampOffset(offset),
        orderBy: { sequenceNumber: "asc" },
      });
    },
  },

  Story: {
    issue: async (parent: { issueId: number }) => {
      return prisma.issue.findUnique({ where: { id: parent.issueId } });
    },
    type: async (parent: { typeId: number }) => {
      return prisma.storyType.findUnique({ where: { id: parent.typeId } });
    },
    credits: async (parent: { id: number }) => {
      return prisma.storyCredit.findMany({
        where: { storyId: parent.id, deleted: 0 },
      });
    },
  },

  StoryCredit: {
    isCredited: (parent: { isCredited: number }) =>
      intToBool(parent.isCredited),
    isSigned: (parent: { isSigned: number }) => intToBool(parent.isSigned),
    uncertain: (parent: { uncertain: number }) => intToBool(parent.uncertain),
    creatorNameDetail: async (parent: { creatorId: number }) => {
      return prisma.creatorNameDetail.findUnique({
        where: { id: parent.creatorId },
      });
    },
    creditType: async (parent: { creditTypeId: number }) => {
      return prisma.creditType.findUnique({
        where: { id: parent.creditTypeId },
      });
    },
    story: async (parent: { storyId: number }) => {
      return prisma.story.findUnique({ where: { id: parent.storyId } });
    },
  },

  Creator: {
    birthCountry: async (parent: { birthCountryId: number | null }) => {
      if (!parent.birthCountryId) return null;
      return prisma.country.findUnique({
        where: { id: parent.birthCountryId },
      });
    },
    deathCountry: async (parent: { deathCountryId: number | null }) => {
      if (!parent.deathCountryId) return null;
      return prisma.country.findUnique({
        where: { id: parent.deathCountryId },
      });
    },
    nameDetails: async (parent: { id: number }) => {
      return prisma.creatorNameDetail.findMany({
        where: { creatorId: parent.id, deleted: 0 },
      });
    },
  },

  CreatorNameDetail: {
    isOfficialName: (parent: { isOfficialName: number }) =>
      intToBool(parent.isOfficialName),
    creator: async (parent: { creatorId: number }) => {
      return prisma.creator.findUnique({ where: { id: parent.creatorId } });
    },
  },

  Country: {
    publishers: async (parent: { id: number }) => {
      return prisma.publisher.findMany({
        where: { countryId: parent.id, deleted: 0 },
        orderBy: { name: "asc" },
      });
    },
    series: async (parent: { id: number }) => {
      return prisma.series.findMany({
        where: { countryId: parent.id, deleted: 0 },
        take: DEFAULT_LIMIT,
        orderBy: { sortName: "asc" },
      });
    },
  },

  Language: {
    series: async (parent: { id: number }) => {
      return prisma.language.findUnique({
        where: { id: parent.id },
        include: { series: { where: { deleted: 0 }, take: DEFAULT_LIMIT } },
      }).then(result => result?.series ?? []);
    },
  },
};
