'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { animate, createScope, onScroll, splitText, stagger, utils } from 'animejs';
import { Button } from '@/components/ui/button';
import { GitHubIcon } from '@/components/brand/github-icon';
import { REPO_URL } from '@/config/marketing';
import { ScrollWords } from './scroll-words';

const STATS = [
  { value: 6, suffix: '', label: 'products' },
  { value: 83, suffix: '', label: 'screens' },
  { value: 100, suffix: '%', label: 'open source' },
  { value: 0, suffix: '', prefix: 'RM ', label: 'to self-host' },
];

const POINTS = [
  {
    title: 'RM 0, forever',
    desc: 'All six products with no limits on contacts, team members or client accounts.',
  },
  {
    title: 'Hosted option coming',
    desc: 'Prefer not to run servers? A paid hosted version is planned, built on the same open-source code.',
  },
  {
    title: 'Community-built',
    desc: 'Written by volunteer contributors, in the open. Read the code and help shape it.',
  },
];

export function OpenSource() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const scope = createScope({
      root,
      mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;

      // Numbers count up when the row enters the viewport.
      utils.$('[data-count]').forEach((el) => {
        const target = Number((el as HTMLElement).dataset.count);
        const counter = { n: 0 };
        animate(counter, {
          n: target,
          duration: 1400,
          ease: 'outExpo',
          onUpdate: () => {
            el.textContent = String(Math.round(counter.n));
          },
          autoplay: onScroll({ target: el, enter: 'bottom-=10% top' }),
        });
      });

      // The clone command types itself out.
      const { chars } = splitText('[data-typed]', { chars: true });
      animate(chars, {
        opacity: [0, 1],
        duration: 1,
        delay: stagger(28),
        autoplay: onScroll({ target: '[data-terminal]', enter: 'bottom-=20% top' }),
      });

      animate('[data-terminal]', {
        x: [120, 0],
        opacity: [0, 1],
        rotateY: [-18, 0],
        ease: 'linear',
        autoplay: onScroll({
          target: '[data-terminal]',
          enter: 'bottom top',
          leave: 'center+=10% center',
          sync: 0.5,
        }),
      });

      animate('[data-point]', {
        y: [40, 0],
        opacity: [0, 1],
        duration: 900,
        ease: 'outExpo',
        delay: stagger(120),
        autoplay: onScroll({ target: '[data-points]', enter: 'bottom-=10% top' }),
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <section
      ref={root}
      id="pricing"
      className="overflow-hidden bg-[#050807] text-white"
    >
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
        <div className="grid grid-cols-2 gap-y-10 border-y border-white/10 py-12 lg:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-5xl font-bold tracking-tight tabular-nums sm:text-6xl">
                {s.prefix}
                <span data-count={s.value}>{s.value}</span>
                {s.suffix}
              </p>
              <p className="mt-2 font-mono text-xs uppercase tracking-[0.2em] text-white/45">
                {s.label}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-24 grid items-center gap-12 [perspective:1400px] lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
              open source · AGPL-3.0
            </p>
            <ScrollWords
              as="h2"
              className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl"
            >
              Free to self-host.
            </ScrollWords>
            <p className="mt-5 max-w-lg text-lg text-white/60">
              Every product and feature is included, and it runs on
              infrastructure you control.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="rounded-full">
                <a href={REPO_URL} target="_blank" rel="noreferrer">
                  <GitHubIcon />
                  View on GitHub
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/pricing">
                  See your options
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div
            data-terminal
            className="overflow-hidden rounded-xl border border-white/10 bg-[#0d1412] font-mono text-sm"
          >
            <div className="flex h-9 items-center gap-2 border-b border-white/10 px-3.5">
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
              <span className="size-2.5 rounded-full bg-white/15" />
            </div>
            <div className="space-y-2 overflow-x-auto p-5 text-white/80">
              <p className="whitespace-nowrap">
                <span className="text-emerald-400">$ </span>
                <span data-typed>git clone {REPO_URL}.git</span>
              </p>
              <p className="whitespace-nowrap">
                <span className="text-emerald-400">$ </span>
                <span data-typed>pnpm install &amp;&amp; pnpm dev</span>
              </p>
              <p className="text-white/40"># six products, running on your machine</p>
            </div>
          </div>
        </div>

        <div data-points className="mt-16 grid gap-5 lg:grid-cols-3">
          {POINTS.map((point) => (
            <div
              key={point.title}
              data-point
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-7"
            >
              <h3 className="text-lg font-bold">{point.title}</h3>
              <p className="mt-2 text-sm text-white/55">{point.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
