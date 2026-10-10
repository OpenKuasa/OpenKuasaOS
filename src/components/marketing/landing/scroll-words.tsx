'use client';

import { useEffect, useRef } from 'react';
import { animate, createScope, onScroll, splitText, stagger } from 'animejs';

/**
 * Text whose words light up one after another as it scrolls up the viewport.
 * Static (fully lit) under reduced motion.
 */
export function ScrollWords({
  as: Tag = 'p',
  className,
  children,
}: {
  as?: 'h2' | 'p';
  className?: string;
  children: string;
}) {
  const ref = useRef<HTMLHeadingElement & HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const scope = createScope({
      mediaQueries: { reduceMotion: '(prefers-reduced-motion: reduce)' },
    }).add((self) => {
      if (self?.matches.reduceMotion) return;

      const { words } = splitText(el, { words: true });
      animate(words, {
        opacity: [0.12, 1],
        y: [14, 0],
        ease: 'linear',
        delay: stagger(60),
        autoplay: onScroll({
          target: el,
          enter: 'bottom-=8% top',
          leave: 'center+=5% bottom',
          sync: 0.5,
        }),
      });
    });

    return () => scope.revert();
  }, []);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
