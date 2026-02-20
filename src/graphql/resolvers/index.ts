import { GraphQLError } from "graphql";
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

// Wrap any async resolver to catch unhandled errors
function withErrorHandling<TParent, TArgs, TResult>(
  fn: (parent: TParent, args: TArgs) => Promise<TResult>
): (parent: TParent, args: TArgs) => Promise<TResult> {
  return async (parent, args) => {
    try {
      return await fn(parent, args);
    } catch (err) {
      if (err instanceof GraphQLError) throw err;
      console.error(err);
      throw new GraphQLError("An internal error occurred.", {
        extensions: { code: "INTERNAL_SERVER_ERROR" },
      });
    }
  };
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
    publishers: withErrorHandling(async (
      _,
      { limit, offset, search }: SearchArgs
    ) => {
      const where = {
        deleted: 0,
        ...(search && {
          name: { contains: search, mode: "insensitive" as const },
        }),
      };
      const [items, totalCount] = await prisma.$transaction([
        prisma.publisher.findMany({
          take: clampLimit(limit),
          skip: clampOffset(offset),
          where,
          orderBy: { name: "asc" },
        }),
        prisma.publisher.count({ where }),
      ]);
      return { items, totalCount };
    }),

    publisher: withErrorHandling(async (_, { id }: { id: number }) => {
      return prisma.publisher.findUnique({ where: { id } });
    }),

    // Series
    allSeries: withErrorHandling(async (
      _,
      { limit, offset, search, publisherId }: SearchArgs & { publisherId?: number }
    ) => {
      const where = {
        deleted: 0,
        ...(search && {
          name: { contains: search, mode: "insensitive" as const },
        }),
        ...(publisherId && { publisherId }),
      };
      const [items, totalCount] = await prisma.$transaction([
        prisma.series.findMany({
          take: clampLimit(limit),
          skip: clampOffset(offset),
          where,
          orderBy: { sortName: "asc" },
        }),
        prisma.series.count({ where }),
      ]);
      return { items, totalCount };
    }),

    series: withErrorHandling(async (_, { id }: { id: number }) => {
      return prisma.series.findUnique({ where: { id } });
    }),

    // Issues
    issues: withErrorHandling(async (
      _,
      { limit, offset, seriesId, keyDate, onSaleDate }: PaginationArgs & {
        seriesId?: number;
        keyDate?: string;
        onSaleDate?: string;
      }
    ) => {
      const where = {
        deleted: 0,
        variantOfId: null as null,
        ...(seriesId && { seriesId }),
        ...(keyDate && { keyDate }),
        ...(onSaleDate && { onSaleDate }),
      };
      const [items, totalCount] = await prisma.$transaction([
        prisma.issue.findMany({
          take: clampLimit(limit),
          skip: clampOffset(offset),
          where,
          orderBy: { sortCode: "asc" },
        }),
        prisma.issue.count({ where }),
      ]);
      return { items, totalCount };
    }),

    issue: withErrorHandling(async (_, { id }: { id: number }) => {
      return prisma.issue.findUnique({ where: { id } });
    }),

    // Stories
    stories: withErrorHandling(async (
      _,
      { limit, offset, issueId }: PaginationArgs & { issueId?: number }
    ) => {
      const where = {
        deleted: 0,
        ...(issueId && { issueId }),
      };
      const [items, totalCount] = await prisma.$transaction([
        prisma.story.findMany({
          take: clampLimit(limit),
          skip: clampOffset(offset),
          where,
          orderBy: { sequenceNumber: "asc" },
        }),
        prisma.story.count({ where }),
      ]);
      return { items, totalCount };
    }),

    story: withErrorHandling(async (_, { id }: { id: number }) => {
      return prisma.story.findUnique({ where: { id } });
    }),

    // Creators
    creators: withErrorHandling(async (_, { limit, offset, search }: SearchArgs) => {
      const where = {
        deleted: 0,
        ...(search && {
          gcdOfficialName: {
            contains: search,
            mode: "insensitive" as const,
          },
        }),
      };
      const [items, totalCount] = await prisma.$transaction([
        prisma.creator.findMany({
          take: clampLimit(limit),
          skip: clampOffset(offset),
          where,
          orderBy: { sortName: "asc" },
        }),
        prisma.creator.count({ where }),
      ]);
      return { items, totalCount };
    }),

    creator: withErrorHandling(async (_, { id }: { id: number }) => {
      return prisma.creator.findUnique({ where: { id } });
    }),

    // Reference types
    countries: withErrorHandling(async () => {
      return prisma.country.findMany({ orderBy: { name: "asc" } });
    }),

    languages: withErrorHandling(async () => {
      return prisma.language.findMany({ orderBy: { name: "asc" } });
    }),

    storyTypes: withErrorHandling(async () => {
      return prisma.storyType.findMany({ orderBy: { sortCode: "asc" } });
    }),

    creditTypes: withErrorHandling(async () => {
      return prisma.creditType.findMany({ orderBy: { sortCode: "asc" } });
    }),

    seriesPublicationTypes: withErrorHandling(async () => {
      return prisma.seriesPublicationType.findMany({
        orderBy: { name: "asc" },
      });
    }),
  },

  // ─── Relationship Resolvers ───────────────────────────────────────────────

  Publisher: {
    country: withErrorHandling(async (parent: { id: number }) => {
      const result = await prisma.publisher.findUnique({
        where: { id: parent.id },
        include: { country: true },
      });
      if (!result?.country) {
        throw new GraphQLError(`Country not found for publisher ${parent.id}`, {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return result.country;
    }),
    series: withErrorHandling(async (
      parent: { id: number },
      { limit, offset }: PaginationArgs
    ) => {
      return prisma.series.findMany({
        where: { publisherId: parent.id, deleted: 0 },
        take: clampLimit(limit),
        skip: clampOffset(offset),
        orderBy: { sortName: "asc" },
      });
    }),
  },

  Series: {
    publisher: withErrorHandling(async (parent: { publisherId: number }) => {
      return prisma.publisher.findUnique({
        where: { id: parent.publisherId },
      });
    }),
    country: withErrorHandling(async (parent: { countryId: number }) => {
      return prisma.country.findUnique({ where: { id: parent.countryId } });
    }),
    language: withErrorHandling(async (parent: { languageId: number }) => {
      return prisma.language.findUnique({ where: { id: parent.languageId } });
    }),
    publicationType: withErrorHandling(async (parent: { publicationTypeId: number | null }) => {
      if (!parent.publicationTypeId) return null;
      return prisma.seriesPublicationType.findUnique({
        where: { id: parent.publicationTypeId },
      });
    }),
    issues: withErrorHandling(async (
      parent: { id: number },
      { limit, offset }: PaginationArgs
    ) => {
      return prisma.issue.findMany({
        where: { seriesId: parent.id, deleted: 0, variantOfId: null },
        take: clampLimit(limit),
        skip: clampOffset(offset),
        orderBy: { sortCode: "asc" },
      });
    }),
  },

  Issue: {
    series: withErrorHandling(async (parent: { seriesId: number }) => {
      return prisma.series.findUnique({ where: { id: parent.seriesId } });
    }),
    variantOf: withErrorHandling(async (parent: { variantOfId: number | null }) => {
      if (!parent.variantOfId) return null;
      return prisma.issue.findUnique({ where: { id: parent.variantOfId } });
    }),
    variants: withErrorHandling(async (parent: { id: number }) => {
      return prisma.issue.findMany({
        where: { variantOfId: parent.id, deleted: 0 },
      });
    }),
    stories: withErrorHandling(async (
      parent: { id: number },
      { limit, offset }: PaginationArgs
    ) => {
      return prisma.story.findMany({
        where: { issueId: parent.id, deleted: 0 },
        take: clampLimit(limit),
        skip: clampOffset(offset),
        orderBy: { sequenceNumber: "asc" },
      });
    }),
  },

  Story: {
    issue: withErrorHandling(async (parent: { issueId: number }) => {
      return prisma.issue.findUnique({ where: { id: parent.issueId } });
    }),
    type: withErrorHandling(async (parent: { typeId: number }) => {
      return prisma.storyType.findUnique({ where: { id: parent.typeId } });
    }),
    credits: withErrorHandling(async (parent: { id: number }) => {
      return prisma.storyCredit.findMany({
        where: { storyId: parent.id, deleted: 0 },
      });
    }),
  },

  StoryCredit: {
    isCredited: (parent: { isCredited: number }) =>
      intToBool(parent.isCredited),
    isSigned: (parent: { isSigned: number }) => intToBool(parent.isSigned),
    uncertain: (parent: { uncertain: number }) => intToBool(parent.uncertain),
    creatorNameDetail: withErrorHandling(async (parent: { creatorId: number }) => {
      return prisma.creatorNameDetail.findUnique({
        where: { id: parent.creatorId },
      });
    }),
    creditType: withErrorHandling(async (parent: { creditTypeId: number }) => {
      return prisma.creditType.findUnique({
        where: { id: parent.creditTypeId },
      });
    }),
    story: withErrorHandling(async (parent: { storyId: number }) => {
      return prisma.story.findUnique({ where: { id: parent.storyId } });
    }),
  },

  Creator: {
    birthCountry: withErrorHandling(async (parent: { birthCountryId: number | null }) => {
      if (!parent.birthCountryId) return null;
      return prisma.country.findUnique({
        where: { id: parent.birthCountryId },
      });
    }),
    deathCountry: withErrorHandling(async (parent: { deathCountryId: number | null }) => {
      if (!parent.deathCountryId) return null;
      return prisma.country.findUnique({
        where: { id: parent.deathCountryId },
      });
    }),
    nameDetails: withErrorHandling(async (parent: { id: number }) => {
      return prisma.creatorNameDetail.findMany({
        where: { creatorId: parent.id, deleted: 0 },
      });
    }),
  },

  CreatorNameDetail: {
    isOfficialName: (parent: { isOfficialName: number }) =>
      intToBool(parent.isOfficialName),
    creator: withErrorHandling(async (parent: { creatorId: number }) => {
      return prisma.creator.findUnique({ where: { id: parent.creatorId } });
    }),
  },

  Country: {
    publishers: withErrorHandling(async (parent: { id: number }) => {
      return prisma.publisher.findMany({
        where: { countryId: parent.id, deleted: 0 },
        orderBy: { name: "asc" },
      });
    }),
    series: withErrorHandling(async (parent: { id: number }) => {
      return prisma.series.findMany({
        where: { countryId: parent.id, deleted: 0 },
        take: DEFAULT_LIMIT,
        orderBy: { sortName: "asc" },
      });
    }),
  },

  Language: {
    series: withErrorHandling(async (parent: { id: number }) => {
      return prisma.language.findUnique({
        where: { id: parent.id },
        include: { series: { where: { deleted: 0 }, take: DEFAULT_LIMIT } },
      }).then(result => result?.series ?? []);
    }),
  },
};
