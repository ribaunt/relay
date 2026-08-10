import { GitCompareArrows, Lock, KeyRound, Layers } from "lucide-react"
import { Reveal } from "./reveal"

const STEPS = [
  {
    step: "01",
    icon: KeyRound,
    title: "Derive your master key",
    description:
      "Your password runs through Argon2id on your device to produce a KEK — the server only ever sees a verifier, never the password.",
  },
  {
    step: "02",
    icon: GitCompareArrows,
    title: "Authenticate with SRP",
    description:
      "An SRP-6a handshake proves you know your verifier without ever sending it. Sessions begin only after that proof clears.",
  },
  {
    step: "03",
    icon: Lock,
    title: "Unlock only in your browser",
    description:
      "Your encrypted master key returns to the client, decrypted locally, then derived into per-feature subkeys — scoped, revocable, compartmentalized.",
  },
  {
    step: "04",
    icon: Layers,
    title: "Extend to any app",
    description:
      "Session cookies, refresh tokens, and encrypted handoff let the apps you trust ride on the same key without ever seeing it.",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="relative py-24 md:py-32">
      <div className="glow-core top-1/3 -left-40 h-[360px] w-[360px] bg-brand/20" />
      <div className="relative mx-auto w-full max-w-6xl px-6">
        <Reveal>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">
            How it works
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            A crypto pipeline you can trace, end to end.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            Every step is a documented primitive from an audited open-source
            core. No black boxes, no exceptions.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-border bg-border/40 md:grid-cols-2">
          {STEPS.map((item, i) => (
            <div key={item.step} className="bg-background p-8 md:p-10">
              <Reveal delay={i * 0.06}>
                <div className="flex items-center gap-4">
                  <span className="font-mono text-sm tracking-widest text-faint">
                    {item.step}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                  <item.icon className="size-5 text-brand" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">
                  {item.title}
                </h3>
                <p className="mt-2.5 max-w-sm text-sm leading-relaxed text-muted">
                  {item.description}
                </p>
              </Reveal>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
