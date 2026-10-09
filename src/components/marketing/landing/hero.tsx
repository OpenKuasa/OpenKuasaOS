'use client';

import { useEffect, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { animate, createScope, onScroll, splitText, stagger } from 'animejs';
import { Button } from '@/components/ui/button';
import { GitHubIcon } from '@/components/brand/github-icon';
import { REPO_URL } from '@/config/marketing';
import { BrowserFrame } from './browser-frame';
import { GridField } from './grid-field';

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const scope = createScope({
      root,
      mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;

      // Headline: letters rise in one by one.
      const { chars } = splitText('[data-hero-title]', {
        words: true,
        chars: true,
      });
      animate(chars, {
        y: ['110%', '0%'],
        opacity: [0, 1],
        rotate: [8, 0],
        duration: 900,
        ease: 'outExpo',
        delay: stagger(22),
      });

      animate('[data-hero-fade]', {
        y: [24, 0],
        opacity: [0, 1],
        duration: 900,
        ease: 'outExpo',
        delay: stagger(110, { start: 520 }),
      });

      // Screenshot: tilted back at rest, lies flat as it scrolls into view.
      animate('[data-hero-shot]', {
        rotateX: [32, 0],
        scale: [0.84, 1],
        y: [40, 0],
        ease: 'linear',
        autoplay: onScroll({
          target: '[data-hero-stage]',
          enter: 'bottom top',
          leave: 'center center',
          sync: 0.35,
        }),
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <section ref={root} className="relative overflow-hidden bg-[#050807] text-white">
      <GridField
        cols={28}
        rows={14}
        className="absolute inset-x-0 top-0 mx-auto max-w-[1600px] opacity-60 [mask-image:radial-gradient(70%_70%_at_50%_30%,black,transparent)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[38%] h-[60%] bg-[radial-gradient(50%_60%_at_50%_50%,rgba(16,185,129,0.22),transparent)]"
      />

      <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 pt-24 text-center sm:pt-32">
        <Link
          href="/pricing"
          data-hero-fade
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 font-mono text-xs text-white/75 transition-colors hover:bg-white/10"
        >
          <span className="size-1.5 rounded-full bg-emerald-400" />
          free and open source · AGPL-3.0
          <ArrowRight className="size-3.5" />
        </Link>

        <h1
          data-hero-title
          className="max-w-5xl text-5xl font-bold leading-[1.02] tracking-tight [&_span]:inline-block sm:text-7xl lg:text-8xl"
        >
          Run the whole business from one place.
        </h1>

        <p data-hero-fade className="mt-7 max-w-xl text-lg text-white/65">
          Marketing, sales, people and finance — six products on one login,
          powered by Taming Sari AI.
        </p>

        <div data-hero-fade className="mt-9 flex flex-col gap-3 sm:flex-row">
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

        <div
          data-hero-stage
          className="mt-16 w-full max-w-6xl pb-24 [perspective:1600px] sm:mt-20 sm:pb-32"
        >
          <div data-hero-shot className="origin-top will-change-transform">
            <BrowserFrame>
              <Image
                src="/landing/crm.jpg"
                alt="The Kasturi CRM deals screen: pipeline value, win rate and a deal board"
                width={1440}
                height={900}
                priority
                sizes="(min-width: 1280px) 1152px, 100vw"
                className="h-auto w-full"
              />
            </BrowserFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
