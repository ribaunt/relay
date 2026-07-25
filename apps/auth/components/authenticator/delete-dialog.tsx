"use client"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAuthenticator } from "@/components/authenticator-provider"
import type { OtpEntry } from "@/lib/authenticator/types"

type DeleteDialogProps = {
  entry: OtpEntry | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export default function DeleteDialog({ entry, open, onOpenChange }: DeleteDialogProps) {
  const { deleteEntry } = useAuthenticator()

  const handleDelete = async () => {
    if (!entry) return
    try {
      await deleteEntry(entry.id)
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to delete entry:", error)
    }
  }

  if (!entry) return null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {entry.plaintext.issuer}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove this authenticator entry. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
