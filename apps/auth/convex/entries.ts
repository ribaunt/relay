import { mutation, query } from "./_generated/server"
import { v } from "convex/values"

export const list = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("entries")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .collect()
  },
})

export const get = query({
  args: {
    userId: v.string(),
    entryId: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("entries")
      .withIndex("by_user_entry", (q) =>
        q.eq("user_id", args.userId).eq("entry_id", args.entryId),
      )
      .first()
  },
})

export const put = mutation({
  args: {
    userId: v.string(),
    entryId: v.string(),
    version: v.number(),
    ciphertext: v.string(),
    iv: v.string(),
    updatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entries")
      .withIndex("by_user_entry", (q) =>
        q.eq("user_id", args.userId).eq("entry_id", args.entryId),
      )
      .first()

    if (existing) {
      if (args.updatedAt < existing.updated_at) {
        return
      }
      await ctx.db.patch(existing._id, {
        version: args.version,
        ciphertext: args.ciphertext,
        iv: args.iv,
        updated_at: args.updatedAt,
      })
    } else {
      await ctx.db.insert("entries", {
        user_id: args.userId,
        entry_id: args.entryId,
        version: args.version,
        ciphertext: args.ciphertext,
        iv: args.iv,
        updated_at: args.updatedAt,
      })
    }
  },
})

export const remove = mutation({
  args: {
    userId: v.string(),
    entryId: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("entries")
      .withIndex("by_user_entry", (q) =>
        q.eq("user_id", args.userId).eq("entry_id", args.entryId),
      )
      .first()

    if (existing) {
      await ctx.db.delete(existing._id)
    }
  },
})
