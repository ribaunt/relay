"use client"

import type { Tag } from "@/lib/authenticator/types"
import TagBadge from "./tag-badge"

type TagFilterBarProps = {
  tags: Tag[]
  selectedTagIds: string[]
  onToggleTag: (tagId: string) => void
}

export default function TagFilterBar({
  tags,
  selectedTagIds,
  onToggleTag,
}: TagFilterBarProps) {
  if (tags.length === 0) return null

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
      {tags.map((tag) => {
        const isSelected = selectedTagIds.includes(tag.id)
        return (
          <TagBadge
            key={tag.id}
            name={tag.name}
            color={tag.color}
            selected={isSelected}
            dimmed={selectedTagIds.length > 0 && !isSelected}
            onClick={() => onToggleTag(tag.id)}
          />
        )
      })}
    </div>
  )
}
