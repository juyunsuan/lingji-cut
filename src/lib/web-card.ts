export const DEFAULT_WEB_CARD_STAGE_WIDTH = 1_920;
export const DEFAULT_WEB_CARD_STAGE_HEIGHT = 1_080;
export const DEFAULT_WEB_CARD_BACKGROUND = '#10131a';

export function appendCacheBuster(url: string, cacheKey?: number): string {
  if (!url || !Number.isFinite(cacheKey)) {
    return url;
  }

  return `${url}${url.includes('?') ? '&' : '?'}t=${Number(cacheKey)}`;
}

function injectIntoHead(source: string, injection: string): string {
  if (/<head[^>]*>/i.test(source)) {
    return source.replace(/<head([^>]*)>/i, `<head$1>${injection}`);
  }

  if (/<html[^>]*>/i.test(source)) {
    return source.replace(/<html([^>]*)>/i, `<html$1><head>${injection}</head>`);
  }

  return `<!doctype html><html><head>${injection}</head><body>${source}</body></html>`;
}

function injectBeforeBodyEnd(source: string, injection: string): string {
  if (/<\/body>/i.test(source)) {
    return source.replace(/<\/body>/i, `${injection}</body>`);
  }

  return `${source}${injection}`;
}

/**
 * Self-scaling script injected into the srcDoc.
 * Runs inside the iframe's own context — no cross-frame DOM access needed.
 * Scales the body (designed at stageWidth×stageHeight) to fit the iframe viewport.
 */
function buildAutoScaleScript(
  stageWidth: number,
  stageHeight: number,
): string {
  return `
<script data-web-card-autoscale="true">
(function(){
  var W=${stageWidth},H=${stageHeight};
  function isVisible(el){
    if(!el)return false;
    var style=window.getComputedStyle(el);
    return style.display!=='none'&&style.visibility!=='hidden';
  }
  function getPrimary(body){
    var children=Array.prototype.filter.call(body.children||[],isVisible);
    if(children.length===1)return children[0];
    return body.querySelector('[data-web-card-stage]')||body;
  }
  function expandPrimary(body){
    var primary=getPrimary(body);
    if(!primary)return;
    var rect=primary.getBoundingClientRect();
    if(rect.width < W * 0.72){
      primary.style.width='100%';
      primary.style.maxWidth='none';
    }
    if(rect.height < H * 0.72){
      primary.style.height='100%';
      primary.style.minHeight=H+'px';
    }
    primary.style.boxSizing='border-box';
  }
  function fit(){
    var root=document.documentElement,body=document.body;
    if(!body)return;
    var vw=Math.max(window.innerWidth||root.clientWidth||1,1);
    var vh=Math.max(window.innerHeight||root.clientHeight||1,1);
    var s=Math.min(vw/W,vh/H);
    var ox=Math.max(0,(vw-W*s)/2);
    var oy=Math.max(0,(vh-H*s)/2);
    root.style.margin='0';
    root.style.width='100%';
    root.style.height='100%';
    root.style.overflow='hidden';
    root.style.background=body.style.background||getComputedStyle(body).backgroundColor||'${DEFAULT_WEB_CARD_BACKGROUND}';
    body.style.width=W+'px';
    body.style.height=H+'px';
    body.style.minWidth=W+'px';
    body.style.minHeight=H+'px';
    body.style.margin='0';
    body.style.position='absolute';
    body.style.left=ox+'px';
    body.style.top=oy+'px';
    body.style.transformOrigin='top left';
    body.style.transform='scale('+s+')';
    body.style.overflow='hidden';
    body.style.padding='0';
    body.style.minHeight=H+'px';
    expandPrimary(body);
  }
  fit();
  window.addEventListener('resize',fit);
  window.addEventListener('load',fit);
})();
</script>`;
}

export function normalizeWebCardSrcDoc(
  srcDoc: string,
  stageWidth = DEFAULT_WEB_CARD_STAGE_WIDTH,
  stageHeight = DEFAULT_WEB_CARD_STAGE_HEIGHT,
): string {
  if (!srcDoc.trim()) {
    return srcDoc;
  }

  if (srcDoc.includes('data-web-card-normalized="true"')) {
    return srcDoc;
  }

  const headInjection = `
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<style data-web-card-normalized="true">
html, body {
  margin: 0 !important;
  overflow: hidden !important;
  background: ${DEFAULT_WEB_CARD_BACKGROUND};
  width: 100%;
  height: 100%;
}
</style>`;

  let result = injectIntoHead(srcDoc, headInjection);

  // 注入自缩放脚本（在 body 末尾），不依赖外部 JS 访问 contentDocument
  if (!result.includes('data-web-card-autoscale')) {
    result = injectBeforeBodyEnd(result, buildAutoScaleScript(stageWidth, stageHeight));
  }

  return result;
}

/**
 * Legacy external scaling — kept as fallback for edge cases where the
 * injected script cannot run (e.g. CSP blocks inline scripts).
 */
export function fitWebCardIframe(
  iframe: HTMLIFrameElement,
  stageWidth = DEFAULT_WEB_CARD_STAGE_WIDTH,
  stageHeight = DEFAULT_WEB_CARD_STAGE_HEIGHT,
): void {
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win || !doc.body) {
    return;
  }

  const viewportWidth = Math.max(win.innerWidth || iframe.clientWidth || 0, 1);
  const viewportHeight = Math.max(win.innerHeight || iframe.clientHeight || 0, 1);
  const scale = Math.min(
    viewportWidth / Math.max(1, stageWidth),
    viewportHeight / Math.max(1, stageHeight),
  );
  const offsetX = Math.max(0, (viewportWidth - stageWidth * scale) / 2);
  const offsetY = Math.max(0, (viewportHeight - stageHeight * scale) / 2);
  const root = doc.documentElement;
  const body = doc.body;

  root.style.margin = '0';
  root.style.width = '100%';
  root.style.height = '100%';
  root.style.overflow = 'hidden';
  root.style.background = body.style.background || DEFAULT_WEB_CARD_BACKGROUND;

  body.style.width = `${stageWidth}px`;
  body.style.height = `${stageHeight}px`;
  body.style.minWidth = `${stageWidth}px`;
  body.style.minHeight = `${stageHeight}px`;
  body.style.margin = '0';
  body.style.position = 'absolute';
  body.style.left = `${offsetX}px`;
  body.style.top = `${offsetY}px`;
  body.style.transformOrigin = 'top left';
  body.style.transform = `scale(${scale})`;
  body.style.overflow = 'hidden';
}
