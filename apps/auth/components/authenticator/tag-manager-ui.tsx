"use client"

import { useState } from "react"
import { AddCircleIcon, Delete } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TextureButton } from "@/components/ui/texture-button"
import { useAuthenticator } from "@/components/authenticator-provider"
import TagBadge from "./tag-badge"

const TAG_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#6b7280",
  "#78716c",
]

type TagManagerUiProps = {
  selectedTagIds: string[]
  onChange: (tagIds: string[]) => void
}

export default function TagManagerUi({ selectedTagIds, onChange }: TagManagerUiProps) {
  const { tags, addTag, deleteTag } = useAuthenticator()
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[5]!)
  const [isCreating, setIsCreating] = useState(false)

  const handleToggleTag = (tagId: string) => {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } else {
      onChange([...selectedTagIds, tagId])
    }
  }

  const handleCreateTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    try {
      const tag = await addTag({ name, color: newTagColor })
      onChange([...selectedTagIds, tag.id])
      setNewTagName("")
      setNewTagColor(TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)]!)
      setIsCreating(false)
    } catch (error) {
      console.error("Failed to create tag:", error)
    }
  }

  const handleDeleteTag = async (tagId: string) => {
    try {
      await deleteTag(tagId)
      onChange(selectedTagIds.filter((id) => id !== tagId))
    } catch (error) {
      console.error("Failed to delete tag:", error)
    }
  }

  return (
    <div className="space-y-3">
      <Label>Tags</Label>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <div key={tag.id} className="group relative">
              <TagBadge
                name={tag.name}
                color={tag.color}
                selected={selectedTagIds.includes(tag.id)}
                dimmed={!selectedTagIds.includes(tag.id)}
                onClick={() => handleToggleTag(tag.id)}
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteTag(tag.id)
                }}
                className="tag-delete-badge absolute -right-1 -top-1 hidden rounded-full bg-destructive p-0.5 text-destructive-foreground group-hover:flex"
                aria-label={`Delete tag ${tag.name}`}
              >
                <HugeiconsIcon icon={Delete} size={8} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}

      {isCreating ? (
        <div className="space-y-2 rounded-lg border p-3">
          <Input
            value={newTagName}
            onChange={(e) => setNewTagName(e.target.value)}
            placeholder="Tag name"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleCreateTag()
              }
            }}
            autoFocus
          />
          <div className="flex flex-wrap gap-1.5">
            {TAG_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => setNewTagColor(color)}
                className="h-8 w-8 rounded-full transition-transform hover:scale-110 active:scale-95 sm:h-6 sm:w-6"
                aria-label={`Use color ${color}`}
                style={{
                  backgroundColor: color,
                  outline: newTagColor === color ? `2px solid ${color}` : "2px solid transparent",
                  outlineOffset: 2,
                }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <TextureButton
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className="flex-1"
            >
              Create
            </TextureButton>
            <TextureButton
              variant="secondary"
              onClick={() => {
                setIsCreating(false)
                setNewTagName("")
              }}
            >
              Cancel
            </TextureButton>
          </div>
        </div>
      ) : (
        <TextureButton
          variant="secondary"
          className="w-full"
          onClick={() => setIsCreating(true)}
        >
          <HugeiconsIcon icon={AddCircleIcon} size={16} strokeWidth={1.5} />
          New tag
        </TextureButton>
      )}
    </div>
  )
}
