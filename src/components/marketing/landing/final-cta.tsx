import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GitHubIcon } from '@/components/brand/github-icon';
import { REPO_URL } from '@/config/marketing';
import { GridField } from './grid-field';

export function FinalCta() {
  return (
    <section className="relative overflow-hidden border-t border-white/10 bg-[#050807] text-white">
      <GridField
        cols={28}
        rows={8}
        className="absolute inset-0 mx-auto max-w-[1600px] [mask-image:radial-gradient(60%_80%_at_50%_50%,black,transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-28 text-center sm:py-36">
        <h2 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Start with one product.
        </h2>
        <p className="mt-5 text-lg text-white/65">
          The rest already know your customers and your team.
        </p>
        <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="rounded-full">
            <Link href="/onboarding">
              Get started
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              <GitHubIcon />
              View on GitHub
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
