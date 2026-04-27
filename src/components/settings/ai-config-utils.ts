import type { ImageProvider, LLMProvider, VideoProvider } from '../../types/ai';

export interface ProviderDraftErrors {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string;
}

export interface ImageProviderDraftErrors {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string;
}

export interface VideoProviderDraftErrors {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  models?: string;
}

interface AIConfigSnapshotInput {
  providers: LLMProvider[];
  defaultProviderId: string | null;
  defaultModel: string | null;
  jimengApiUrl: string;
  jimengSessionId: string;
  jimengModel: string;
  imageProviders?: ImageProvider[];
  defaultImageProviderId?: string | null;
  defaultImageModel?: string | null;
  videoProviders?: VideoProvider[];
  defaultVideoProviderId?: string | null;
  defaultVideoModel?: string | null;
}

export function normalizeProviderDraft(provider: LLMProvider): LLMProvider {
  return {
    ...provider,
    name: provider.name.trim(),
    baseUrl: provider.baseUrl.trim(),
    apiKey: provider.apiKey.trim(),
    models: provider.models
      .map((model) => model.trim())
      .filter((model, index, list) => model.length > 0 && list.indexOf(model) === index),
    enableThinking: provider.enableThinking ?? true,
  };
}

export function normalizeProviderDrafts(providers: LLMProvider[]): LLMProvider[] {
  return providers.map(normalizeProviderDraft);
}

export function validateProviderDraft(provider: LLMProvider): ProviderDraftErrors {
  const normalized = normalizeProviderDraft(provider);
  const errors: ProviderDraftErrors = {};

  if (!normalized.name) {
    errors.name = '请输入 Provider 名称';
  }

  if (!normalized.baseUrl && normalized.type !== 'gemini' && normalized.type !== 'lmstudio') {
    errors.baseUrl = '请输入 Base URL';
  }

  if (!normalized.apiKey && normalized.type !== 'lmstudio') {
    errors.apiKey = '请输入 API Key';
  }

  if (normalized.models.length === 0) {
    errors.models = '请至少添加一个模型';
  }

  return errors;
}

export function normalizeProviderSelection(
  providers: LLMProvider[],
  preferredDefaultProviderId: string | null,
  preferredDefaultModel: string | null,
): { defaultProviderId: string | null; defaultModel: string | null } {
  if (providers.length === 0) {
    return { defaultProviderId: null, defaultModel: null };
  }

  const normalizedProviders = normalizeProviderDrafts(providers);
  const activeProvider =
    normalizedProviders.find((provider) => provider.id === preferredDefaultProviderId) ??
    normalizedProviders[0];

  const defaultModel =
    activeProvider.models.find((model) => model === preferredDefaultModel) ??
    activeProvider.models[0] ??
    null;

  return {
    defaultProviderId: activeProvider.id,
    defaultModel,
  };
}

export function createAIConfigSnapshot({
  providers,
  defaultProviderId,
  defaultModel,
  jimengApiUrl,
  jimengSessionId,
  jimengModel,
  imageProviders,
  defaultImageProviderId,
  defaultImageModel,
  videoProviders,
  defaultVideoProviderId,
  defaultVideoModel,
}: AIConfigSnapshotInput): string {
  const normalizedProviders = normalizeProviderDrafts(providers);
  const selection = normalizeProviderSelection(
    normalizedProviders,
    defaultProviderId,
    defaultModel,
  );
  const normalizedImageProviders = imageProviders
    ? normalizeImageProviderDrafts(imageProviders)
    : [];
  const normalizedVideoProviders = videoProviders
    ? normalizeVideoProviderDrafts(videoProviders)
    : [];

  return JSON.stringify({
    providers: normalizedProviders,
    defaultProviderId: selection.defaultProviderId,
    defaultModel: selection.defaultModel,
    jimengApiUrl: jimengApiUrl.trim(),
    jimengSessionId: jimengSessionId.trim(),
    jimengModel: jimengModel.trim(),
    imageProviders: normalizedImageProviders,
    defaultImageProviderId: defaultImageProviderId ?? null,
    defaultImageModel: defaultImageModel ?? null,
    videoProviders: normalizedVideoProviders,
    defaultVideoProviderId: defaultVideoProviderId ?? null,
    defaultVideoModel: defaultVideoModel ?? null,
  });
}

export function hasUnsavedAIConfigChanges(
  lastSavedSnapshot: string,
  currentSnapshot: string,
): boolean {
  return lastSavedSnapshot !== currentSnapshot;
}

// ─── Image Provider 校验与归一化 ─────────────────────────────────────────

export function normalizeImageProviderDraft(provider: ImageProvider): ImageProvider {
  return {
    ...provider,
    name: provider.name.trim(),
    baseUrl: provider.baseUrl.trim(),
    apiKey: provider.apiKey.trim(),
    models: provider.models
      .map((model) => model.trim())
      .filter((model, index, list) => model.length > 0 && list.indexOf(model) === index),
  };
}

export function normalizeImageProviderDrafts(providers: ImageProvider[]): ImageProvider[] {
  return providers.map(normalizeImageProviderDraft);
}

export function validateImageProviderDraft(provider: ImageProvider): ImageProviderDraftErrors {
  const normalized = normalizeImageProviderDraft(provider);
  const errors: ImageProviderDraftErrors = {};

  if (!normalized.name) {
    errors.name = '请输入 Provider 名称';
  }

  if (!normalized.baseUrl) {
    errors.baseUrl = '请输入 Base URL';
  }

  if (!normalized.apiKey) {
    errors.apiKey = normalized.type === 'jimeng' ? '请输入 Session ID' : '请输入 API Key';
  }

  if (normalized.models.length === 0) {
    errors.models = '请至少添加一个模型';
  }

  return errors;
}

// ─── Video Provider 校验与归一化 ─────────────────────────────────────────

export function normalizeVideoProviderDraft(provider: VideoProvider): VideoProvider {
  return {
    ...provider,
    name: provider.name.trim(),
    baseUrl: provider.baseUrl.trim(),
    apiKey: provider.apiKey.trim(),
    models: provider.models
      .map((model) => model.trim())
      .filter((model, index, list) => model.length > 0 && list.indexOf(model) === index),
  };
}

export function normalizeVideoProviderDrafts(providers: VideoProvider[]): VideoProvider[] {
  return providers.map(normalizeVideoProviderDraft);
}

export function validateVideoProviderDraft(provider: VideoProvider): VideoProviderDraftErrors {
  const normalized = normalizeVideoProviderDraft(provider);
  const errors: VideoProviderDraftErrors = {};

  if (!normalized.name) errors.name = '请输入 Provider 名称';
  if (!normalized.baseUrl) errors.baseUrl = '请输入 Base URL';
  if (!normalized.apiKey) errors.apiKey = '请输入 API Key';
  if (normalized.models.length === 0) errors.models = '请至少添加一个模型';

  return errors;
}
