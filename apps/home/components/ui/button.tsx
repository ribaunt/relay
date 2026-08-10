import * as React from "react"
import { Root as Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "./cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-all duration-200 select-none focus-visible:ring-2 focus-visible:ring-brand/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary:
          "bg-foreground text-background hover:opacity-85 active:scale-[0.98]",
        brand:
          "bg-brand text-white shadow-[0_0_24px_rgba(139,123,255,0.35)] hover:bg-brand/90 active:scale-[0.98]",
        outline:
          "border border-border text-foreground/85 hover:border-foreground/25 hover:bg-white/5 active:scale-[0.98]",
        ghost: "text-foreground/70 hover:bg-white/5 hover:text-foreground",
      },
      size: {
        md: "h-10 px-5",
        lg: "h-12 px-7 text-cta",
        sm: "h-9 px-4 text-eyebrow",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return (
    <Comp
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
