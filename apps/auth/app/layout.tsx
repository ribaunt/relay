import "./globals.css"
import { MasterKeyProvider } from "@/components/master-key-provider"
import { ThemeProvider } from "@/components/theme-provider"
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
          <MasterKeyProvider>{children}</MasterKeyProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
