import { Header } from "@/components/header"
import { Hero } from "@/components/hero"
import { Products } from "@/components/products"
import { HowItWorks } from "@/components/how-it-works"
import { Security } from "@/components/security"
import { Cta } from "@/components/cta"
import { Footer } from "@/components/footer"

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main id="main" className="relative">
        <Hero />
        <Products />
        <HowItWorks />
        <Security />
        <Cta />
      </main>
      <Footer />
    </div>
  )
}
