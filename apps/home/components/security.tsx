import {
  RefreshCcw,
  ShieldCheck,
  FileLock2,
  BadgeCheck,
  ExternalLink,
  RadioTower,
} from "lucide-react"
import { Reveal } from "./reveal"

const FEATURES = [
  {
    icon: FileLock2,
    title: "Master key, client-side",
    description:
      "The server stores only an Argon2id-wrapped blob. Without your password on your device, there is nothing to exfiltrate from the database.",
  },
  {
    icon: RefreshCcw,
    title: "Refresh-token families",
    description:
      "Sessions rotate on every refresh. Reuse or replay of an old token revokes the whole family instantly.",
  },
  {
    icon: BadgeCheck,
    title: "PKCE on every flow",
    description:
      "All OIDC authorizations use PKCE S256 with validated nonce and state — authorization codes can't be swapped in transit.",
  },
  {
    icon: ShieldCheck,
    title: "Hash-only audit logs",
    description:
      "IPs and user agents are hashed before they're stored. Verifiers, tokens, and key material are never logged, ever.",
  },
  {
    icon: RadioTower,
    title: "Recovery without a backdoor",
    description:
      "Recovery uses a separate, device-bound SRP verifier and its own encrypted key — not a password-reset shortcut into your data.",
  },
  {
    icon: ExternalLink,
    title: "Open, auditable source",
    description:
      "A single public monorepo. Full reproducibility of the crypto model means you can verify the threat model, not trust it.",
  },
]

export function Security() {
  return (
    <section id="security" className="relative py-24 md:py-32">
      <div className="glow-core bottom-0 -left-40 h-[320px] w-[320px] bg-brand-bright/20" />
      <div className="relative mx-auto w-full max-w-6xl px-6">
        <Reveal>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">
            Security model
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Defaults that make compromise pointless.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            We treat every server as potentially hostile. The architecture is
            built so that even a total breach yields nothing but encrypted,
            verifier tokens.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => (
            <Reveal key={feature.title} delay={(i % 3) * 0.07}>
              <div className="group h-full rounded-2xl border border-border bg-surface p-7 transition-all duration-300 hover:border-brand/30 hover:bg-surface-2">
                <div className="flex size-10 items-center justify-center rounded-lg bg-white/5 transition-colors group-hover:bg-brand/15">
                  <feature.icon className="size-4.5 text-brand" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {feature.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
