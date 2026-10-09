import Link from 'next/link';
import {
  ArrowRight,
  Check,
  Store,
  Users2,
  Code2,
  Plug,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { GitHubIcon } from '@/components/brand/github-icon';
import { MarketingHeader } from '@/components/marketing/marketing-header';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { PRODUCT_CARDS, REPO_URL } from '@/config/marketing';

const STATS = [
  { value: '6', label: 'products' },
  { value: '83', label: 'screens' },
  { value: '100%', label: 'open source' },
  { value: 'AGPL-3.0', label: 'licensed' },
];

const VALUE_PROPS = [
  { icon: Store, title: 'Marketplace Apps', desc: 'Extend with add-ons' },
  { icon: Users2, title: 'Client Accounts', desc: 'Run books for clients' },
  { icon: Code2, title: 'Open Source', desc: 'AGPL-3.0, yours to change' },
  { icon: Plug, title: 'Integrations', desc: 'WhatsApp, Meta, FPX & more' },
];

const FREE_POINTS = [
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

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-background">
      <MarketingHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#06110d] text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(90% 60% at 50% 115%, oklch(0.55 0.13 164 / 0.55) 0%, transparent 60%)',
          }}
        />
        <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(white_1px,transparent_1px)] [background-size:26px_26px]" />

        <div className="relative mx-auto flex max-w-7xl flex-col items-center px-6 py-24 text-center sm:py-32">
          <Link
            href="/pricing"
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10"
          >
            <span className="size-1.5 rounded-full bg-primary" />
            Free and open source — self-host it yourself
            <ArrowRight className="size-3.5" />
          </Link>

          <h1 className="max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight sm:text-7xl">
            Run the whole business
            <br />
            from one place.
          </h1>
          <p className="mt-6 max-w-xl text-lg text-white/70">
            Marketing, sales, people and finance — six products on one login,
            powered by Taming Sari AI. Start with the one you need most; the rest
            already know your customers and your team.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
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

          <div className="mt-20 grid w-full grid-cols-2 gap-8 border-t border-white/10 pt-12 lg:grid-cols-4">
            {STATS.map((s) => (
              <div key={s.label}>
                <p className="text-3xl font-bold tracking-tight sm:text-4xl">
                  {s.value}
                </p>
                <p className="mt-1 text-sm text-white/50">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product showcase */}
      <section id="products" className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primary">
            One operating system
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Six products. One login.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every tool shares the same contacts, team and AI credits — so the
            work flows from a lead to a hire to a paid invoice without leaving
            OpenKuasa.
          </p>
        </div>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {PRODUCT_CARDS.map((p) => {
            const Icon = p.icon;
            return (
              <Link
                key={p.key}
                href={p.href}
                className="group flex flex-col rounded-2xl border bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="text-lg font-bold leading-tight">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.category}</p>
                  </div>
                </div>
                <p className="mt-4 font-semibold">{p.tagline}</p>
                <p className="mt-1 text-sm text-muted-foreground">{p.blurb}</p>
                <ul className="mt-4 space-y-2">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-center gap-2 text-sm text-muted-foreground"
                    >
                      <Check className="size-4 shrink-0 text-primary" />
                      {f}
                    </li>
                  ))}
                </ul>
                <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                  Explore
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Value band */}
      <section className="border-y bg-muted/40">
        <div className="mx-auto max-w-7xl px-6 py-14">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {VALUE_PROPS.map((v) => {
              const Icon = v.icon;
              return (
                <div key={v.title} className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-background text-primary shadow-sm">
                    <Icon className="size-5" />
                  </span>
                  <div>
                    <p className="font-semibold">{v.title}</p>
                    <p className="text-sm text-muted-foreground">{v.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t pt-8 text-center sm:flex-row sm:text-left">
            <p className="text-lg font-semibold">
              All six products, one login — and one AI that knows your whole
              business.
            </p>
            <Button asChild className="rounded-full">
              <Link href="/onboarding">
                Get started
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Free to self-host */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
        <div className="mx-auto max-w-2xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="size-3.5" />
            Open source · AGPL-3.0
          </p>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Free to self-host
          </h2>
          <p className="mt-4 text-muted-foreground">
            Every product and feature is included, and it runs on
            infrastructure you control. A paid hosted version is coming for
            teams who would rather not run it themselves.
          </p>
        </div>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {FREE_POINTS.map((point) => (
            <div
              key={point.title}
              className="flex flex-col rounded-2xl border bg-card p-7 shadow-sm"
            >
              <h3 className="text-lg font-bold">{point.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{point.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            See your options
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#06110d] text-white">
        <div className="mx-auto max-w-3xl px-6 py-24 text-center">
          <h2 className="text-4xl font-bold tracking-tight sm:text-5xl">
            Run the whole business from one place
          </h2>
          <p className="mt-4 text-lg text-white/70">
            Start with the product you need most. The rest already know your
            customers and your team.
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

      <MarketingFooter />
    </div>
  );
}
