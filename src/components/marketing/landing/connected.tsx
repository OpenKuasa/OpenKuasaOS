'use client';

import { useEffect, useRef } from 'react';
import { animate, createScope, onScroll, stagger, svg } from 'animejs';
import { PRODUCT_CARDS } from '@/config/marketing';

const CENTER = { x: 400, y: 250 };
const RX = 300;
const RY = 185;

// Six products evenly spaced on an ellipse around the shared core.
const NODES = PRODUCT_CARDS.map((p, i) => {
  const angle = (-90 + i * 60) * (Math.PI / 180);
  return {
    key: p.key,
    name: p.name,
    category: p.category,
    x: Math.round(CENTER.x + RX * Math.cos(angle)),
    y: Math.round(CENTER.y + RY * Math.sin(angle)),
  };
});

export function Connected() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const scope = createScope({
      root,
      mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;

      // Lines draw out from the core as the diagram scrolls through the viewport.
      animate(svg.createDrawable('[data-link]'), {
        draw: ['0 0', '0 1'],
        ease: 'inOutQuad',
        delay: stagger(80),
        autoplay: onScroll({
          target: '[data-diagram]',
          enter: 'bottom top+=15%',
          leave: 'center center',
          sync: 0.4,
        }),
      });

      animate('[data-node]', {
        scale: [0, 1],
        opacity: [0, 1],
        ease: 'outBack(2)',
        delay: stagger(80),
        autoplay: onScroll({
          target: '[data-diagram]',
          enter: 'bottom top+=15%',
          leave: 'center center',
          sync: 0.4,
        }),
      });

      // The core keeps a slow pulse.
      animate('[data-core-ring]', {
        scale: [1, 1.9],
        opacity: [0.5, 0],
        duration: 2200,
        ease: 'outQuad',
        loop: true,
        delay: stagger(700),
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <section ref={root} className="bg-[#050807] text-white">
      <div className="mx-auto max-w-7xl px-6 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-emerald-400">
            one shared core
          </p>
          <h2 className="mt-4 text-4xl font-bold tracking-tight sm:text-6xl">
            Every product knows the rest.
          </h2>
          <p className="mt-5 text-lg text-white/60">
            The same contacts, team and AI sit under all six. Work flows from
            a lead to a hire to a paid invoice without leaving OpenKuasa.
          </p>
        </div>

        <svg
          data-diagram
          viewBox="0 0 800 500"
          role="img"
          aria-label="Six products — Tuah, Jebat, Kasturi, Lekiu, Lekir and Bendahara — all connected to Taming Sari AI at the centre"
          className="mx-auto mt-14 w-full max-w-4xl overflow-visible"
        >
          <g fill="none" stroke="rgb(52 211 153)" strokeWidth="1.5" strokeLinecap="round">
            {NODES.map((n) => (
              <path
                key={n.key}
                data-link
                d={`M${CENTER.x} ${CENTER.y} Q${(CENTER.x + n.x) / 2} ${n.y} ${n.x} ${n.y}`}
                opacity="0.55"
              />
            ))}
          </g>

          <g className="[transform-box:fill-box] [&_circle]:origin-center">
            <circle data-core-ring cx={CENTER.x} cy={CENTER.y} r="46" fill="rgb(16 185 129)" opacity="0" />
            <circle data-core-ring cx={CENTER.x} cy={CENTER.y} r="46" fill="rgb(16 185 129)" opacity="0" />
            <circle cx={CENTER.x} cy={CENTER.y} r="46" fill="rgb(5 150 105)" />
            <text
              x={CENTER.x}
              y={CENTER.y - 3}
              textAnchor="middle"
              className="fill-white text-[13px] font-bold"
            >
              Taming Sari
            </text>
            <text
              x={CENTER.x}
              y={CENTER.y + 14}
              textAnchor="middle"
              className="fill-white/70 font-mono text-[10px]"
            >
              AI
            </text>
          </g>

          {NODES.map((n) => (
            <g
              key={n.key}
              data-node
              className="[transform-box:fill-box] origin-center"
            >
              <rect
                x={n.x - 62}
                y={n.y - 26}
                width="124"
                height="52"
                rx="12"
                fill="#0d1412"
                stroke="rgb(255 255 255 / 0.14)"
              />
              <text
                x={n.x}
                y={n.y - 2}
                textAnchor="middle"
                className="fill-white text-[15px] font-bold"
              >
                {n.name}
              </text>
              <text
                x={n.x}
                y={n.y + 15}
                textAnchor="middle"
                className="fill-white/50 font-mono text-[10px]"
              >
                {n.category}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  );
}
