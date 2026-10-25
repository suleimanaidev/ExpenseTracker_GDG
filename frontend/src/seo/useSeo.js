import { useEffect } from 'react';

const INDEXABLE = 'index, follow, max-image-preview:large, max-snippet:-1';
const PRIVATE = 'noindex, nofollow';

const findMeta = (attribute, key) => document.head.querySelector(`meta[${attribute}="${key}"]`);

/**
 * Sets one meta tag and returns a function that puts the previous value back.
 * The tag is reused when `index.html` already has it, so the page never ends up
 * with two competing descriptions.
 */
function setMeta(attribute, key, content) {
  let tag = findMeta(attribute, key);
  const created = !tag;

  if (!tag) {
    tag = document.createElement('meta');
    tag.setAttribute(attribute, key);
    document.head.appendChild(tag);
  }

  const previous = tag.getAttribute('content');
  tag.setAttribute('content', content);

  return () => {
    if (created) tag.remove();
    else if (previous !== null) tag.setAttribute('content', previous);
  };
}

/**
 * Per-route metadata for the single-page app.
 *
 * The static tags in `index.html` describe the landing page, which is the only
 * indexable page. Signed-in screens and the sign-in form are marked `noindex` and
 * their canonical link is dropped while they are open, so a crawler that does run
 * JavaScript is never told those URLs are copies of the home page.
 */
export function useSeo({ title, description, noindex = false }) {
  useEffect(() => {
    const undo = [];
    const previousTitle = document.title;
    if (title) document.title = title;

    undo.push(setMeta('name', 'robots', noindex ? PRIVATE : INDEXABLE));

    if (title) {
      undo.push(setMeta('property', 'og:title', title));
      undo.push(setMeta('name', 'twitter:title', title));
    }
    if (description) {
      undo.push(setMeta('name', 'description', description));
      undo.push(setMeta('property', 'og:description', description));
      undo.push(setMeta('name', 'twitter:description', description));
    }

    const canonical = document.head.querySelector('link[rel="canonical"]');
    const canonicalHref = canonical?.getAttribute('href');
    if (noindex && canonical) canonical.remove();

    return () => {
      undo.reverse().forEach((restore) => restore());
      document.title = previousTitle;
      if (noindex && canonical && canonicalHref) document.head.appendChild(canonical);
    };
  }, [title, description, noindex]);
}

/**
 * Adds JSON-LD blocks for the lifetime of the component. Used for structured data
 * that must only exist on the page whose visible content it describes (the FAQ).
 */
export function useJsonLd(documents) {
  useEffect(() => {
    const tags = documents.map((data) => {
      const tag = document.createElement('script');
      tag.type = 'application/ld+json';
      tag.dataset.seo = 'page';
      // `<` is escaped so text inside the data can never close the script tag.
      tag.text = JSON.stringify(data).replace(/</g, '\\u003c');
      document.head.appendChild(tag);
      return tag;
    });

    return () => tags.forEach((tag) => tag.remove());
    // The documents are static module-level data; running once is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
