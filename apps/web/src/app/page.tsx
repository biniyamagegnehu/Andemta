import { Navbar } from '@/components/navbar';
import { Hero } from '@/components/hero';
import { Features } from '@/components/features';
import { HowItWorks } from '@/components/how-it-works';
import { ApiStatus } from '@/components/api-status';
import { Footer } from '@/components/footer';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main id="about" className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <ApiStatus />
      </main>
      <Footer />
    </div>
  );
}

