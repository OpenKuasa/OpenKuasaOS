'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { animate, createScope, onScroll } from 'animejs';
import { Button } from '@/components/ui/button';
import { GitHubIcon } from '@/components/brand/github-icon';
import { REPO_URL } from '@/config/marketing';
import { ScrollWords } from './scroll-words';

export function FinalCta() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const scope = createScope({
      root,
      mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;

      // The artwork opens up toward the viewer as the band scrolls in.
      animate('[data-cta-art]', {
        scale: [0.6, 1.15],
        opacity: [0, 0.75],
        rotate: [-25, 0],
        ease: 'linear',
        autoplay: onScroll({
          target: root.current!,
          enter: 'bottom top',
          leave: 'bottom bottom',
          sync: 0.5,
        }),
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <section
      ref={root}
      className="relative overflow-hidden border-t border-white/10 bg-[#050807] text-white"
    >
      <Image
        data-cta-art
        src="/landing/cta-pamor.jpg"
        alt=""
        width={2200}
        height={933}
        sizes="100vw"
        className="pointer-events-none absolute inset-0 size-full object-cover opacity-75 will-change-transform [mask-image:radial-gradient(70%_80%_at_50%_50%,black,transparent)]"
      />
      <div className="relative mx-auto max-w-3xl px-6 py-32 text-center sm:py-44">
        <ScrollWords
          as="h2"
          className="text-4xl font-bold tracking-tight sm:text-6xl"
        >
          Start with one product.
        </ScrollWords>
        <p className="mt-5 text-lg text-white/75">
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
            className="rounded-full border-white/20 bg-black/40 text-white backdrop-blur hover:bg-white/10 hover:text-white"
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
