import "./globals.css"
import { MasterKeyProvider } from "@/components/master-key-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthenticatorProvider } from "@/components/authenticator-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { PWARegister } from "@/components/pwa-register"
import { cn } from "@/lib/utils"
import type { Viewport, Metadata } from "next"

export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
  icons: [
    { rel: "apple-touch-icon", url: "/icon.svg" },
  ],
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Relay Auth",
  },
}

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", "font-sans")}>
      <body>
        <PWARegister />
        <ThemeProvider>
          <TooltipProvider>
            <MasterKeyProvider>
              <AuthenticatorProvider>{children}</AuthenticatorProvider>
            </MasterKeyProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
