import { useLayoutEffect } from 'react';
import { prefersReducedMotion } from './motion';

/**
 * Fades elements marked `data-reveal` in as they scroll into view.
 *
 * The hidden starting state is only applied once this hook has run
 * (`reveal-ready` on the container), so without JavaScript, or with reduced
 * motion, nothing is ever hidden and the content is always readable.
 */
export function useReveal(containerRef) {
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const nodes = [...container.querySelectorAll('[data-reveal]')];

    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      nodes.forEach((node) => node.classList.add('is-visible'));
      return undefined;
    }

    container.classList.add('reveal-ready');

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' }
    );

    nodes.forEach((node) => observer.observe(node));

    return () => {
      observer.disconnect();
      container.classList.remove('reveal-ready');
    };
  }, [containerRef]);
}
