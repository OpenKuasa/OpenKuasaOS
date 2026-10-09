import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { GitHubIcon } from '@/components/brand/github-icon';
import { REPO_URL } from '@/config/marketing';

type Col = {
  title: string;
  links: { label: string; href: string; external?: boolean }[];
};

const COLUMNS: Col[] = [
  {
    title: 'Platforms',
    links: [
      { label: 'Tuah — Command', href: '/command' },
      { label: 'Jebat — Ads', href: '/reach/assistant' },
      { label: 'Kasturi — CRM', href: '/crm/assistant' },
      { label: 'Lekiu — Team', href: '/people/assistant' },
      { label: 'Lekir — Recruit', href: '/hire/assistant' },
      { label: 'Bendahara — Finance', href: '/finance/assistant' },
    ],
  },
  {
    title: 'Apps',
    links: [
      { label: 'Ad Studio', href: '/reach/ad-studio' },
      { label: 'Payroll', href: '/people/payroll' },
      { label: 'e-Invoice LHDN', href: '/finance/e-invoice' },
      { label: 'Ask Sari', href: '/command' },
      { label: 'Marketplace Apps', href: '#marketplace' },
    ],
  },
  {
    title: 'Resources',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'Help Center', href: '/account/docs' },
      { label: 'Changelog', href: '/account/changelog' },
      { label: 'Feature Requests', href: '/account/feedback' },
      { label: 'GitHub', href: REPO_URL, external: true },
      {
        label: 'Contributing',
        href: `${REPO_URL}/blob/main/CONTRIBUTING.md`,
        external: true,
      },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About OpenKuasa', href: '#about' },
      { label: 'Contact Support', href: '/account/support' },
      { label: 'Terms & Conditions', href: '#terms' },
      { label: 'Privacy Policy', href: '/privacy' },
      { label: 'GDPR', href: '#gdpr' },
    ],
  },
];

const SOCIALS: { label: string; path: string }[] = [
  {
    label: 'Facebook',
    path: 'M14 9h2V6h-2c-1.7 0-3 1.3-3 3v2H9v3h2v6h3v-6h2.2l.8-3H14v-2c0-.6.4-1 1-1z',
  },
  {
    label: 'Instagram',
    path: 'M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5zm0 2A1.5 1.5 0 1 1 12 13.5 1.5 1.5 0 0 1 12 10.5zM16 6.8a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8zM7.5 4h9A3.5 3.5 0 0 1 20 7.5v9a3.5 3.5 0 0 1-3.5 3.5h-9A3.5 3.5 0 0 1 4 16.5v-9A3.5 3.5 0 0 1 7.5 4zm0 2A1.5 1.5 0 0 0 6 7.5v9A1.5 1.5 0 0 0 7.5 18h9a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 16.5 6h-9z',
  },
  {
    label: 'TikTok',
    path: 'M16 4c.3 1.8 1.4 3.2 3 3.6v2.5a6 6 0 0 1-3-.9v4.9a5 5 0 1 1-5-5c.2 0 .4 0 .5.1v2.6a2.4 2.4 0 1 0 2 2.3V4h2.5z',
  },
  {
    label: 'Threads',
    path: 'M12 3c4.4 0 7 2.9 7 9s-2.6 9-7 9-7-2.9-7-9 2.6-9 7-9zm.3 5c-1.9 0-3 1-3.2 2.1l1.7.4c.1-.6.6-.9 1.4-.9 1 0 1.5.5 1.6 1.5-.5-.1-1-.2-1.6-.2-1.8 0-3 .9-3 2.4 0 1.3 1.1 2.2 2.6 2.2 1.1 0 1.9-.5 2.3-1.1.2.5.3.9.3 1l1.6-.3c-.2-.6-.3-1.3-.3-2.1v-1.6c0-2-1.2-3.3-3.4-3.3zm.1 4.3c.5 0 1 .1 1.4.2 0 1-.7 1.6-1.6 1.6-.6 0-1.1-.3-1.1-.9 0-.6.6-.9 1.3-.9z',
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-[#0a0a0a] text-white">
      <div className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo wordmarkClassName="text-white text-2xl" />
            <p className="mt-4 max-w-xs text-sm text-white/55">
              The community-built, open-source operating system for growing businesses.
            </p>
            <div className="mt-5 flex gap-2.5">
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="GitHub"
                className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
              >
                <GitHubIcon className="size-[18px]" />
              </a>
              {SOCIALS.map((s) => (
                <Link
                  key={s.label}
                  href="#"
                  aria-label={s.label}
                  className="grid size-9 place-items-center rounded-full bg-white/10 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
                    <path d={s.path} />
                  </svg>
                </Link>
              ))}
            </div>
            <div className="mt-6 text-sm text-white/55">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                Malaysia
              </p>
              <p className="mt-2 leading-relaxed">
                The Strand, 2, Jalan PJU 5/20b, Kota Damansara
                <br />
                47810 Petaling Jaya, Selangor, Malaysia
              </p>
            </div>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-widest text-white/40">
                {col.title}
              </p>
              <ul className="mt-4 space-y-3 text-sm">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-white/70 transition-colors hover:text-white"
                      >
                        {l.label}
                      </a>
                    ) : (
                      <Link
                        href={l.href}
                        className="text-white/70 transition-colors hover:text-white"
                      >
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-white/10 pt-6 text-sm text-white/45 sm:flex-row sm:items-center">
          <p>© 2026 OpenKuasa contributors · Independent open-source project, not affiliated with any other company or product.</p>
          <span className="inline-flex items-center gap-2">
            <span className="size-2 rounded-full bg-primary" />
            All systems operational
          </span>
        </div>
      </div>
    </footer>
  );
}
