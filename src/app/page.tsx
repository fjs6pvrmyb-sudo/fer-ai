import { Header } from "@/components/marketing/header";
import { Hero } from "@/components/marketing/hero";
import { ProductDemo } from "@/components/marketing/product-demo";
import {
  EarlyAccess,
  FAQ,
  Features,
  Footer,
  HowItWorks,
  Industries,
  ProblemSection,
  Security,
} from "@/components/marketing/sections";
import "./marketing.css";

export default function LandingPage() {
  return (
    <div className="marketing">
      <Header />
      <main id="contenido" tabIndex={-1}>
        <Hero />
        <ProblemSection />
        <Features />
        <ProductDemo />
        <HowItWorks />
        <Industries />
        <Security />
        <FAQ />
        <EarlyAccess />
      </main>
      <Footer />
    </div>
  );
}
