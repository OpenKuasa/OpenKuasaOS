import { MarketingHeader } from '@/components/marketing/marketing-header';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Hero } from '@/components/marketing/landing/hero';
import { ProductTour } from '@/components/marketing/landing/product-tour';
import { Connected } from '@/components/marketing/landing/connected';
import { OpenSource } from '@/components/marketing/landing/open-source';
import { FinalCta } from '@/components/marketing/landing/final-cta';

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-mk-bg">
      <MarketingHeader />
      <Hero />
      <ProductTour />
      <Connected />
      <OpenSource />
      <FinalCta />
      <MarketingFooter />
    </div>
  );
}
