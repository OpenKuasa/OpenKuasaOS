import type { Metadata } from "next";
import { Lexend, Geist_Mono } from "next/font/google";
import { ThemeSync } from "@/components/theme/theme-sync";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const lexend = Lexend({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

const title = 'OpenKuasa OS';
const description = 'The community-built, open-source operating system for your business.';

// The share image comes from the opengraph-image file convention, so no `images` here.
export const metadata: Metadata = {
  metadataBase: new URL('https://openkuasa.com'),
  title,
  description,
  openGraph: {
    title,
    description,
    siteName: 'OpenKuasa',
    type: 'website',
    url: '/',
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${lexend.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        {/*
          Applies the saved theme before anything in <body> paints. It sits at
          the top of <body>, not in <head>: rendering our own <head> makes React
          check that element's children on hydration, and hosts that inject
          markup there (Netlify adds a comment) then fail the whole page.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}
