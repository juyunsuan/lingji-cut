import { describe, expect, it } from 'vitest';
import {
  appendCacheBuster,
  DEFAULT_WEB_CARD_BACKGROUND,
  normalizeWebCardSrcDoc,
} from '../src/lib/web-card';

describe('normalizeWebCardSrcDoc', () => {
  it('injects viewport normalization markup once for iframe rendering', () => {
    const normalized = normalizeWebCardSrcDoc(
      '<!doctype html><html><head><title>Card</title></head><body><div>hello</div></body></html>',
    );

    expect(normalized).toContain('data-web-card-normalized="true"');
    expect(normalized).toContain('name="viewport"');
    expect(normalized).toContain(`background: ${DEFAULT_WEB_CARD_BACKGROUND}`);
  });

  it('does not inject duplicate normalization wrappers', () => {
    const source =
      '<!doctype html><html><head><style data-web-card-normalized="true"></style></head><body>ok</body></html>';

    expect(normalizeWebCardSrcDoc(source)).toBe(source);
  });

  it('appends a cache-busting query when the preview html is regenerated', () => {
    expect(appendCacheBuster('file:///tmp/card.html', 123)).toBe('file:///tmp/card.html?t=123');
    expect(appendCacheBuster('file:///tmp/card.html?mode=preview', 456)).toBe(
      'file:///tmp/card.html?mode=preview&t=456',
    );
  });

  it('does not stretch only the first top-level node when the body has multiple sections', () => {
    const normalized = normalizeWebCardSrcDoc(
      '<!doctype html><html><body><header>head</header><main>body</main><footer>foot</footer></body></html>',
    );

    expect(normalized).toContain("return body.querySelector('[data-web-card-stage]')||body;");
    expect(normalized).not.toContain('body.firstElementChild');
  });
});
