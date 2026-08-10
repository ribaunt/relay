import Link from "next/link"

const COLUMNS = [
  {
    title: "Products",
    links: [
      { label: "Identity", href: "https://id.relay.re" },
      { label: "Auth SDK", href: "https://auth.relay.re" },
      { label: "Crypto Core", href: "https://relay.re" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "How it works", href: "#how-it-works" },
      { label: "Security model", href: "#security" },
      { label: "Open source", href: "#open-source" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "Overview", href: "#top" },
      { label: "Ecosystem", href: "#products" },
      { label: "Get started", href: "#cta" },
    ],
  },
]

export function Footer() {
  return (
    <footer id="open-source" className="border-t border-border py-16">
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="grid gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
          <div>
            <a href="#top" className="flex items-center gap-2.5">
              <span className="flex size-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand to-brand-bright text-eyebrow font-bold text-background">
                R
              </span>
              <span className="text-wordmark font-semibold tracking-tight">
                Relay
              </span>
            </a>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">
              Zero-knowledge identity and crypto. Open source, end-to-end
              encrypted, and built to make compromise pointless.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <div className="text-sm font-medium text-foreground">
                {column.title}
              </div>
              <ul className="mt-4 space-y-3">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      target={
                        link.href.startsWith("http") ? "_blank" : undefined
                      }
                      rel="noreferrer"
                      className="text-sm text-muted transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 text-sm text-faint md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Relay. MIT licensed.</p>
          <div className="flex items-center gap-6">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand" />
              No plaintext passwords ever
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-brand-bright" />
              100% client-side keys
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
