"use client"

import { ArrowRight } from "lucide-react"

export function Hero() {
  return (
    <section
      id="top"
      className="relative overflow-hidden pt-32 pb-24 md:pt-44 md:pb-36"
    >
      <div className="grid-fade absolute inset-0 -z-10" />
      <div className="glow-core -top-32 left-1/2 -z-10 h-[420px] w-[640px] -translate-x-1/2 bg-brand/40" />
      <div className="glow-core right-[-10%] -bottom-40 -z-10 h-[360px] w-[360px] bg-brand-bright/20" />

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
        <div className="inline-flex animate-fade-up items-center gap-2 rounded-full border border-border bg-white/5 px-4 py-1.5 text-eyebrow text-muted">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
          Zero-knowledge. End-to-end encrypted. Open source.
        </div>

        <h1
          className="mt-8 max-w-4xl animate-fade-up text-5xl leading-[1.05] font-semibold tracking-tight text-balance md:text-7xl"
          style={{ animationDelay: "0.08s" }}
        >
          Your identity,
          <br />
          <span className="text-gradient">encrypted to the core.</span>
        </h1>

        <p
          className="mt-6 max-w-xl animate-fade-up text-lg leading-relaxed text-pretty text-muted"
          style={{ animationDelay: "0.16s" }}
        >
          Relay is a private identity and encryption ecosystem. Your password
          and keys never touch our servers — they stay encrypted in your
          browser, derivation-protected by SRP and Argon2.
        </p>

        <div
          className="mt-10 flex animate-fade-up flex-col items-center gap-3 sm:flex-row"
          style={{ animationDelay: "0.24s" }}
        >
          <a
            href="#cta"
            className="group inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-7 text-cta font-medium text-background transition-all hover:opacity-85 active:scale-[0.98]"
          >
            Get started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </a>
          <a
            href="#how-it-works"
            className="inline-flex h-12 items-center gap-2 rounded-full border border-border px-7 text-cta text-foreground/85 transition-all hover:bg-white/5 active:scale-[0.98]"
          >
            See how it works
          </a>
        </div>

        <div
          className="mt-16 grid w-full max-w-3xl animate-fade-up grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border bg-border/40 text-left sm:grid-cols-3"
          style={{ animationDelay: "0.32s" }}
        >
          {[
            { value: "0", label: "plaintext keys on our servers" },
            { value: "E2EE", label: "encryption everywhere by default" },
            { value: "Open", label: "auditable source, no closed obfuscation" },
          ].map((stat) => (
            <div key={stat.label} className="bg-surface p-7">
              <div className="text-3xl font-semibold tracking-tight text-foreground">
                {stat.value}
              </div>
              <div className="mt-2 text-sm leading-snug text-muted">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
