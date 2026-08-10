"use client"

import { Logout01Icon, Settings01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { TextureButton } from "@/components/ui/texture-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type ProfileDropdownProps = {
  name?: string
  picture?: string
  email?: string
  onSettings: () => void
  onLogout: () => void
}

export default function ProfileDropdown({
  name,
  picture,
  email,
  onSettings,
  onLogout,
}: ProfileDropdownProps) {
  const initials = name
    ? name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <TextureButton variant="icon" size="icon" className="touch-target h-10 w-10 rounded-full">
          <Avatar className="h-9 w-9">
            {picture && <AvatarImage src={picture} alt={name ?? ""} />}
            <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
          </Avatar>
        </TextureButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              {picture && <AvatarImage src={picture} alt={name ?? ""} />}
              <AvatarFallback className="text-xs font-medium">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col space-y-1">
              {name && <p className="text-sm leading-none font-medium">{name}</p>}
              {email && (
                <p className="text-xs leading-none text-muted-foreground">{email}</p>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSettings}>
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.5} />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={onLogout}>
          <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.5} />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
