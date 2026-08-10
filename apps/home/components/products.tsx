import {
  Fingerprint,
  KeyRound,
  ShieldCheck,
  Wallet,
  Boxes,
  LockKeyhole,
} from "lucide-react"
import { Reveal } from "./reveal"

const PRODUCTS = [
  {
    icon: Fingerprint,
    title: "Identity",
    href: "https://id.relay.re",
    description:
      "A zero-knowledge OIDC identity provider. SRP-6a password auth with device-bound recovery — no plaintext passwords, no password reset backdoors.",
    tags: ["SRP-6a", "Passkeys", "2FA"],
  },
  {
    icon: KeyRound,
    title: "Auth SDK",
    href: "https://auth.relay.re",
    description:
      "Plug into Relay with a portable client. Manage sessions, refresh tokens, and encrypted master-key handoff across any app you build.",
    tags: ["OIDC", "PKCE", "Session sync"],
  },
  {
    icon: Wallet,
    title: "Crypto Core",
    href: "https://relay.re",
    description:
      "Argon2id, secretbox, and a derivation tree that lets one master key unlock every feature — signatures, keys, and storage — with separate contexts.",
    tags: ["Argon2id", "XSalsa20", "Subkeys"],
  },
]

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "Trust nothing you can't verify",
    description:
      "Every cryptographic primitive is standard, open, and auditable. No roll-your-own, no hidden rounds.",
  },
  {
    icon: LockKeyhole,
    title: "Keys never leave the client",
    description:
      "Master keys are derived and decrypted only in the browser. The server stores wrapped blobs it cannot read.",
  },
  {
    icon: Boxes,
    title: "One ecosystem, many apps",
    description:
      "Identity, sessions, and crypto compose through shared packages — consistent security across every surface.",
  },
]

export function Products() {
  return (
    <section id="products" className="relative py-24 md:py-32">
      <div className="mx-auto w-full max-w-6xl px-6">
        <Reveal>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">
            The ecosystem
          </p>
          <h2 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-balance md:text-5xl">
            Everything you need to build on zero-knowledge.
          </h2>
          <p className="mt-4 max-w-xl text-lg leading-relaxed text-muted">
            Three surfaces, one security model. Built from shared, audited
            primitives in a single open-source monorepo.
          </p>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-3">
          {PRODUCTS.map((product, i) => (
            <Reveal key={product.title} delay={i * 0.08}>
              <a
                href={product.href}
                target={product.href.startsWith("http") ? "_blank" : undefined}
                rel="noreferrer"
                className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-7 transition-all duration-300 hover:-translate-y-1 hover:border-brand/30 hover:bg-surface-2"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-white/5 transition-colors group-hover:bg-brand/15">
                  <product.icon className="size-5 text-brand" />
                </div>
                <h3 className="mt-5 text-xl font-semibold tracking-tight">
                  {product.title}
                </h3>
                <p className="mt-2.5 flex-1 text-sm leading-relaxed text-muted">
                  {product.description}
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {product.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-border bg-white/[0.03] px-2.5 py-1 text-xs text-muted"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </a>
            </Reveal>
          ))}
        </div>

        <div className="mt-20 grid gap-10 md:grid-cols-3">
          {PRINCIPLES.map((principle, i) => (
            <Reveal key={principle.title} delay={i * 0.08}>
              <div className="flex flex-col gap-3">
                <principle.icon className="size-5 text-brand-bright" />
                <h3 className="text-lg font-semibold tracking-tight">
                  {principle.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {principle.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}
