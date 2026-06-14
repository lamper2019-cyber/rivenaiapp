import { prisma } from "@/lib/prisma";

/**
 * "The Circle" — one community room everyone is in. Author names + colors are
 * denormalized onto posts/replies so the feed reads with no User joins.
 */

export const POST_KINDS = ["walk", "meal", "win", "heavy", "note"] as const;
export type PostKind = (typeof POST_KINDS)[number];

const AVATAR_COLORS = [
  "#7C9A7E", "#C9A961", "#C76B5C", "#9A8FB0", "#6F8FA3", "#B08968",
];

/** Stable color from a name so each member keeps the same avatar tint. */
export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

export type FeedReply = { id: string; authorName: string; text: string; you: boolean };
export type FeedPost = {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  kind: PostKind;
  text: string;
  createdAt: string;
  hearts: number;
  youHearted: boolean;
  isYou: boolean;
  replies: FeedReply[];
};

/**
 * The visible feed for one viewer: newest 40 posts (chronological, oldest→newest
 * for the chat-style scroll), with hidden posts and blocked authors filtered out.
 */
export async function getCircleFeed(
  viewerUserId: string,
  limit = 40,
): Promise<FeedPost[]> {
  const blocks = await prisma.communityBlock.findMany({
    where: { blockerId: viewerUserId },
    select: { blockedId: true },
  });
  const blockedIds = blocks.map((b) => b.blockedId);

  const posts = await prisma.communityPost.findMany({
    where: {
      hiddenAt: null,
      ...(blockedIds.length ? { authorId: { notIn: blockedIds } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      hearts: { select: { userId: true } },
      replies: {
        orderBy: { createdAt: "asc" },
        select: { id: true, authorId: true, authorName: true, text: true },
      },
    },
  });

  // Newest-first from the DB → reverse so the freshest post is at the bottom,
  // next to the composer (chat-style).
  return posts
    .map((p): FeedPost => ({
      id: p.id,
      authorId: p.authorId,
      authorName: p.authorName,
      authorColor: p.authorColor,
      kind: (POST_KINDS as readonly string[]).includes(p.kind)
        ? (p.kind as PostKind)
        : "note",
      text: p.text,
      createdAt: p.createdAt.toISOString(),
      hearts: p.hearts.length,
      youHearted: p.hearts.some((h) => h.userId === viewerUserId),
      isYou: p.authorId === viewerUserId,
      replies: p.replies.map((r) => ({
        id: r.id,
        authorName: r.authorName,
        text: r.text,
        you: r.authorId === viewerUserId,
      })),
    }))
    .reverse();
}

/** Count of members who've moved/posted today — the header "X today" pulse. */
export async function getCircleMovedToday(): Promise<number> {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const rows = await prisma.communityPost.groupBy({
    by: ["authorId"],
    where: { createdAt: { gte: since }, hiddenAt: null },
  });
  return rows.length;
}
