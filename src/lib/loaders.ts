import DataLoader from "dataloader";
import { prisma } from "./prisma.js";

// Generic batch function for single-record lookups by ID
function createByIdLoader<T extends { id: number }>(
  findMany: (ids: number[]) => Promise<T[]>
) {
  return new DataLoader<number, T | null>(async (ids) => {
    const items = await findMany([...ids]);
    const map = new Map(items.map((item) => [item.id, item]));
    return ids.map((id) => map.get(id) ?? null);
  });
}

export function createLoaders() {
  return {
    // ─── Single-record loaders (by ID) ────────────────────────────────────
    publisher: createByIdLoader((ids) =>
      prisma.publisher.findMany({ where: { id: { in: ids } } })
    ),
    series: createByIdLoader((ids) =>
      prisma.series.findMany({ where: { id: { in: ids } } })
    ),
    issue: createByIdLoader((ids) =>
      prisma.issue.findMany({ where: { id: { in: ids } } })
    ),
    story: createByIdLoader((ids) =>
      prisma.story.findMany({ where: { id: { in: ids } } })
    ),
    country: createByIdLoader((ids) =>
      prisma.country.findMany({ where: { id: { in: ids } } })
    ),
    language: createByIdLoader((ids) =>
      prisma.language.findMany({ where: { id: { in: ids } } })
    ),
    storyType: createByIdLoader((ids) =>
      prisma.storyType.findMany({ where: { id: { in: ids } } })
    ),
    creditType: createByIdLoader((ids) =>
      prisma.creditType.findMany({ where: { id: { in: ids } } })
    ),
    creator: createByIdLoader((ids) =>
      prisma.creator.findMany({ where: { id: { in: ids } } })
    ),
    creatorNameDetail: createByIdLoader((ids) =>
      prisma.creatorNameDetail.findMany({ where: { id: { in: ids } } })
    ),
    seriesPublicationType: createByIdLoader((ids) =>
      prisma.seriesPublicationType.findMany({ where: { id: { in: ids } } })
    ),

    // ─── One-to-many loaders (by parent ID) ───────────────────────────────
    storiesByIssueId: new DataLoader<number, Array<{ id: number; [key: string]: unknown }>>(
      async (issueIds) => {
        const stories = await prisma.story.findMany({
          where: { issueId: { in: [...issueIds] }, deleted: 0 },
          orderBy: { sequenceNumber: "asc" },
        });
        const map = new Map<number, typeof stories>();
        for (const story of stories) {
          const list = map.get(story.issueId) ?? [];
          list.push(story);
          map.set(story.issueId, list);
        }
        return issueIds.map((id) => map.get(id) ?? []);
      }
    ),

    creditsByStoryId: new DataLoader<number, Array<{ id: number; [key: string]: unknown }>>(
      async (storyIds) => {
        const credits = await prisma.storyCredit.findMany({
          where: { storyId: { in: [...storyIds] }, deleted: 0 },
        });
        const map = new Map<number, typeof credits>();
        for (const credit of credits) {
          const list = map.get(credit.storyId) ?? [];
          list.push(credit);
          map.set(credit.storyId, list);
        }
        return storyIds.map((id) => map.get(id) ?? []);
      }
    ),

    nameDetailsByCreatorId: new DataLoader<number, Array<{ id: number; [key: string]: unknown }>>(
      async (creatorIds) => {
        const details = await prisma.creatorNameDetail.findMany({
          where: { creatorId: { in: [...creatorIds] }, deleted: 0 },
        });
        const map = new Map<number, typeof details>();
        for (const detail of details) {
          const list = map.get(detail.creatorId) ?? [];
          list.push(detail);
          map.set(detail.creatorId, list);
        }
        return creatorIds.map((id) => map.get(id) ?? []);
      }
    ),

  };
}

export type Loaders = ReturnType<typeof createLoaders>;
