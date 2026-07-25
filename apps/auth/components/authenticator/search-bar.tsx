"use client"

import { Search, Cancel } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type SearchBarProps = {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="relative">
      <HugeiconsIcon
        icon={Search}
        size={18}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="text"
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pl-10 pr-10"
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2"
        >
          <HugeiconsIcon icon={Cancel} size={14} />
        </Button>
      )}
    </div>
  )
}
