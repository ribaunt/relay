"use client"

import { ArrowRight, GitBranch } from "lucide-react"
import { Reveal } from "./reveal"

export function Cta() {
  return (
    <section id="cta" className="relative py-24 md:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface px-6 py-16 text-center md:px-16 md:py-20">
            <div className="grid-fade absolute inset-0 opacity-60" />
            <div className="glow-core -top-24 left-1/2 h-[300px] w-[520px] -translate-x-1/2 bg-brand/30" />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
                Take control of{" "}
                <span className="text-gradient">your identity</span>.
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-pretty text-muted">
                Start your own private instance or use Relay as the
                zero-knowledge layer beneath your next app.
              </p>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="#top"
                  className="group inline-flex h-12 items-center gap-2 rounded-full bg-foreground px-7 text-cta font-medium text-background transition-all hover:opacity-85 active:scale-[0.98]"
                >
                  Create your account
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <a
                  href="#open-source"
                  className="inline-flex h-12 items-center gap-2 rounded-full border border-border px-7 text-cta text-foreground/85 transition-all hover:bg-white/5 active:scale-[0.98]"
                >
                  <GitBranch className="size-4" />
                  Browse the source
                </a>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
