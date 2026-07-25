import "./globals.css"
import { MasterKeyProvider } from "@/components/master-key-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { AuthenticatorProvider } from "@/components/authenticator-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn("antialiased", "font-sans")}>
      <body>
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
