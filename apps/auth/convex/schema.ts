import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

export default defineSchema({
  entries: defineTable({
    user_id: v.string(),
    entry_id: v.string(),
    version: v.number(),
    ciphertext: v.string(),
    iv: v.string(),
    updated_at: v.number(),
  })
    .index("by_user", ["user_id"])
    .index("by_user_entry", ["user_id", "entry_id"]),
})
