import type { Metadata, Viewport } from "next"
import "./globals.css"

export const metadata: Metadata = {
  metadataBase: new URL("https://relay.re"),
  title: {
    default: "Relay — Zero-knowledge identity & crypto",
    template: "%s — Relay",
  },
  description:
    "Relay is a zero-knowledge identity and encryption ecosystem. Your password and keys never touch our servers — SRP-6a, Argon2id, and client-side master keys, all open source.",
  keywords: [
    "zero-knowledge",
    "identity",
    "SRP-6a",
    "end-to-end encryption",
    "open source",
  ],
  openGraph: {
    title: "Relay — Zero-knowledge identity & crypto",
    description:
      "Your identity, encrypted to the core. No plaintext passwords, ever.",
    url: "https://relay.re",
    siteName: "Relay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Relay — Zero-knowledge identity & crypto",
    description:
      "Your identity, encrypted to the core. No plaintext passwords, ever.",
  },
}

export const viewport: Viewport = {
  themeColor: "#08090c",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-foreground focus:px-5 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  )
}
