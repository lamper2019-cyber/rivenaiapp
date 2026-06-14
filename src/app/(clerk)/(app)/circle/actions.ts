"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { colorForName, POST_KINDS } from "@/lib/community";

/** Auto-hide a post once this many distinct members report it. */
const AUTO_HIDE_AT = 2;

type Viewer = { id: string; firstName: string };

async function viewer(): Promise<Viewer | null> {
  const { userId } = auth();
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, profile: { select: { name: true } } },
  });
  if (!user?.profile) return null;
  return { id: user.id, firstName: user.profile.name.split(/\s+/)[0] || "Member" };
}

export type CircleResult = { ok: true } | { ok: false; error: string };

const PostSchema = z.object({
  kind: z.enum(POST_KINDS),
  text: z.string().trim().min(1).max(600),
});

export async function createCirclePost(input: z.infer<typeof PostSchema>): Promise<CircleResult> {
  const parsed = PostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Say a little something first." };
  const v = await viewer();
  if (!v) return { ok: false, error: "Finish onboarding to join the circle." };

  await prisma.communityPost.create({
    data: {
      authorId: v.id,
      authorName: v.firstName,
      authorColor: colorForName(v.firstName),
      kind: parsed.data.kind,
      text: parsed.data.text,
    },
  });
  revalidatePath("/circle");
  return { ok: true };
}

export async function toggleCircleHeart(postId: string): Promise<CircleResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Not signed in." };
  const existing = await prisma.communityHeart.findUnique({
    where: { postId_userId: { postId, userId: v.id } },
    select: { id: true },
  });
  if (existing) {
    await prisma.communityHeart.delete({ where: { id: existing.id } });
  } else {
    await prisma.communityHeart.create({ data: { postId, userId: v.id } }).catch(() => {});
  }
  revalidatePath("/circle");
  return { ok: true };
}

const ReplySchema = z.object({
  postId: z.string().min(1),
  text: z.string().trim().min(1).max(400),
});

export async function addCircleReply(input: z.infer<typeof ReplySchema>): Promise<CircleResult> {
  const parsed = ReplySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Write a short note first." };
  const v = await viewer();
  if (!v) return { ok: false, error: "Not signed in." };

  await prisma.communityReply.create({
    data: {
      postId: parsed.data.postId,
      authorId: v.id,
      authorName: v.firstName,
      text: parsed.data.text,
    },
  });
  revalidatePath("/circle");
  return { ok: true };
}

/** Report a post. Distinct reporters accumulate; at AUTO_HIDE_AT it hides. */
export async function reportCirclePost(postId: string, reason = "reported"): Promise<CircleResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Not signed in." };

  // Unique per (post, reporter) — a duplicate report is a no-op.
  await prisma.communityReport
    .create({ data: { postId, reporterId: v.id, reason: reason.slice(0, 200) } })
    .catch(() => {});

  const count = await prisma.communityReport.count({ where: { postId } });
  await prisma.communityPost.update({
    where: { id: postId },
    data: { reportCount: count, ...(count >= AUTO_HIDE_AT ? { hiddenAt: new Date() } : {}) },
  }).catch(() => {});

  revalidatePath("/circle");
  return { ok: true };
}

/** Delete your OWN post. Scoped to authorId so a leaked id can't delete
 *  anyone else's. Cascades to its hearts + replies (schema onDelete). */
export async function deleteCirclePost(postId: string): Promise<CircleResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Not signed in." };
  const res = await prisma.communityPost.deleteMany({
    where: { id: postId, authorId: v.id },
  });
  if (res.count === 0) return { ok: false, error: "That's not yours to delete." };
  revalidatePath("/circle");
  return { ok: true };
}

/** Delete your OWN reply (posted twice, or thought better of it). */
export async function deleteCircleReply(replyId: string): Promise<CircleResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Not signed in." };
  const res = await prisma.communityReply.deleteMany({
    where: { id: replyId, authorId: v.id },
  });
  if (res.count === 0) return { ok: false, error: "That's not yours to delete." };
  revalidatePath("/circle");
  return { ok: true };
}

/** Block an author — their posts vanish from this viewer's feed. */
export async function blockCircleAuthor(authorId: string): Promise<CircleResult> {
  const v = await viewer();
  if (!v) return { ok: false, error: "Not signed in." };
  if (authorId === v.id) return { ok: false, error: "You can't block yourself." };
  await prisma.communityBlock
    .create({ data: { blockerId: v.id, blockedId: authorId } })
    .catch(() => {});
  revalidatePath("/circle");
  return { ok: true };
}
