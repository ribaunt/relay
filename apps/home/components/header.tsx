"use client"

import * as React from "react"
import { cn } from "./ui/cn"

const LINKS = [
  { label: "Products", href: "#products" },
  { label: "How it works", href: "#how-it-works" },
  { label: "Security", href: "#security" },
  { label: "Open source", href: "#open-source" },
]

export function Header() {
  const [scrolled, setScrolled] = React.useState(false)
  const [open, setOpen] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-300",
        scrolled
          ? "border-b border-border/60 bg-background/80 backdrop-blur-xl"
          : "bg-transparent"
      )}
    >
      <nav className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <a href="#top" className="flex items-center gap-2.5">
          <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-bright text-eyebrow font-bold text-background">
            R
          </span>
          <span className="text-wordmark font-semibold tracking-tight">
            Relay
          </span>
        </a>

        <div className="hidden items-center gap-8 md:flex">
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-muted transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <a
            href="#cta"
            className="rounded-full border border-border px-4 py-2 text-sm text-foreground/85 transition-colors hover:border-foreground/25 hover:bg-white/5"
          >
            Sign in
          </a>
          <a
            href="#cta"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-85"
          >
            Get Relay
          </a>
        </div>

        <button
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
          className="flex size-9 items-center justify-center rounded-lg md:hidden"
        >
          <div className="flex flex-col gap-1.5">
            <span
              className={cn(
                "h-0.5 w-5 bg-foreground transition-all",
                open && "translate-y-2 rotate-45"
              )}
            />
            <span
              className={cn(
                "h-0.5 w-5 bg-foreground transition-all",
                open && "opacity-0"
              )}
            />
            <span
              className={cn(
                "h-0.5 w-5 bg-foreground transition-all",
                open && "-translate-y-2 -rotate-45"
              )}
            />
          </div>
        </button>
      </nav>

      {open && (
        <div
          id="mobile-nav"
          className="mx-4 mb-4 rounded-2xl border border-border bg-surface p-6 md:hidden"
        >
          <div className="flex flex-col gap-4">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="text-cta text-muted transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#cta"
              onClick={() => setOpen(false)}
              className="mt-2 rounded-full bg-foreground px-4 py-2.5 text-center text-sm font-medium text-background"
            >
              Get Relay
            </a>
          </div>
        </div>
      )}
    </header>
  )
}
