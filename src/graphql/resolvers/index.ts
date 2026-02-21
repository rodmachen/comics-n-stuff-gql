import { GraphQLError } from "graphql";
import { prisma } from "../../lib/prisma.js";
import { logger } from "../../lib/logger.js";
import type { Context } from "../../lib/context.js";

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

const MAX_SEARCH_LENGTH = 200;
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

// Wrap any async resolver to catch unhandled errors
function withErrorHandling<TParent, TArgs, TResult>(
  fn: (parent: TParent, args: TArgs, context: Context) => Promise<TResult>
): (parent: TParent, args: TArgs, context: Context) => Promise<TResult> {
  return async (parent, args, context) => {
    try {
      return await fn(parent, args, context);
    } catch (err) {
      if (err instanceof GraphQLError) throw err;
      logger.error({ err }, "Unhandled resolver error");
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
      validatePagination(limit, offset);
      validateSearch(search);
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
      validatePagination(limit, offset);
      validateSearch(search);
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
    searchIssues: withErrorHandling(async (
      _,
      { search, issueNumber, limit, offset }: SearchArgs & { issueNumber: string }
    ) => {
      validatePagination(limit, offset);
      validateSearch(search);
      const where = {
        deleted: 0,
        variantOfId: null as null,
        number: issueNumber,
        series: {
          name: { contains: search, mode: "insensitive" as const },
          deleted: 0,
        },
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

    issues: withErrorHandling(async (
      _,
      { limit, offset, seriesId, issueNumber, keyDate, onSaleDate }: PaginationArgs & {
        seriesId?: number;
        issueNumber?: string;
        keyDate?: string;
        onSaleDate?: string;
      }
    ) => {
      validatePagination(limit, offset);
      validateDate(keyDate, "keyDate");
      validateDate(onSaleDate, "onSaleDate");
      const where = {
        deleted: 0,
        variantOfId: null as null,
        ...(seriesId && { seriesId }),
        ...(issueNumber && { number: issueNumber }),
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
      validatePagination(limit, offset);
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
      validatePagination(limit, offset);
      validateSearch(search);
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
    country: withErrorHandling(async (parent: { countryId: number }, _args, { loaders }) => {
      const country = await loaders.country.load(parent.countryId);
      if (!country) {
        throw new GraphQLError(`Country not found for publisher`, {
          extensions: { code: "NOT_FOUND" },
        });
      }
      return country;
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
    publisher: withErrorHandling(async (parent: { publisherId: number }, _args, { loaders }) => {
      return loaders.publisher.load(parent.publisherId);
    }),
    country: withErrorHandling(async (parent: { countryId: number }, _args, { loaders }) => {
      return loaders.country.load(parent.countryId);
    }),
    language: withErrorHandling(async (parent: { languageId: number }, _args, { loaders }) => {
      return loaders.language.load(parent.languageId);
    }),
    publicationType: withErrorHandling(async (parent: { publicationTypeId: number | null }, _args, { loaders }) => {
      if (!parent.publicationTypeId) return null;
      return loaders.seriesPublicationType.load(parent.publicationTypeId);
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
    series: withErrorHandling(async (parent: { seriesId: number }, _args, { loaders }) => {
      return loaders.series.load(parent.seriesId);
    }),
    variantOf: withErrorHandling(async (parent: { variantOfId: number | null }, _args, { loaders }) => {
      if (!parent.variantOfId) return null;
      return loaders.issue.load(parent.variantOfId);
    }),
    stories: withErrorHandling(async (parent: { id: number }, _args, { loaders }) => {
      return loaders.storiesByIssueId.load(parent.id);
    }),
  },

  Story: {
    issue: withErrorHandling(async (parent: { issueId: number }, _args, { loaders }) => {
      return loaders.issue.load(parent.issueId);
    }),
    type: withErrorHandling(async (parent: { typeId: number }, _args, { loaders }) => {
      return loaders.storyType.load(parent.typeId);
    }),
    credits: withErrorHandling(async (parent: { id: number }, _args, { loaders }) => {
      return loaders.creditsByStoryId.load(parent.id);
    }),
  },

  StoryCredit: {
    isCredited: (parent: { isCredited: number }) =>
      intToBool(parent.isCredited),
    isSigned: (parent: { isSigned: number }) => intToBool(parent.isSigned),
    uncertain: (parent: { uncertain: number }) => intToBool(parent.uncertain),
    creatorNameDetail: withErrorHandling(async (parent: { creatorId: number }, _args, { loaders }) => {
      return loaders.creatorNameDetail.load(parent.creatorId);
    }),
    creditType: withErrorHandling(async (parent: { creditTypeId: number }, _args, { loaders }) => {
      return loaders.creditType.load(parent.creditTypeId);
    }),
    story: withErrorHandling(async (parent: { storyId: number }, _args, { loaders }) => {
      return loaders.story.load(parent.storyId);
    }),
  },

  Creator: {
    birthCountry: withErrorHandling(async (parent: { birthCountryId: number | null }, _args, { loaders }) => {
      if (!parent.birthCountryId) return null;
      return loaders.country.load(parent.birthCountryId);
    }),
    deathCountry: withErrorHandling(async (parent: { deathCountryId: number | null }, _args, { loaders }) => {
      if (!parent.deathCountryId) return null;
      return loaders.country.load(parent.deathCountryId);
    }),
    nameDetails: withErrorHandling(async (parent: { id: number }, _args, { loaders }) => {
      return loaders.nameDetailsByCreatorId.load(parent.id);
    }),
  },

  CreatorNameDetail: {
    isOfficialName: (parent: { isOfficialName: number }) =>
      intToBool(parent.isOfficialName),
    creator: withErrorHandling(async (parent: { creatorId: number }, _args, { loaders }) => {
      return loaders.creator.load(parent.creatorId);
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
