const DEFAULT_EXPORT = /export\s+default\b/;

export function stripCodeFences(src: string): string {
  return src
    .trim()
    .replace(/^```(?:tsx|jsx|ts|js)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

export interface CardValidation {
  ok: boolean;
  error?: string;
}

/**
 * 对 LLM 产出的 Remotion 卡片 TSX 做轻量结构校验。
 * 真正的 esbuild 编译发生在主进程（electron/remotion/compile-card-node.ts），
 * 这里只做去围栏 + 必要约定检查，便于纯函数单测。
 */
export function validateCardTsx(src: string): CardValidation {
  const code = stripCodeFences(src);
  if (!code) return { ok: false, error: 'Motion Card TSX 不能为空' };
  if (!DEFAULT_EXPORT.test(code)) {
    return { ok: false, error: 'Motion Card 必须有 default export 的 Remotion 组件' };
  }
  return { ok: true };
}
