import { DEFAULT_JIMENG_MODEL, type AISettings, type ImageProvider } from '../../types/ai';

export function migrateImageProviders(settings: AISettings): AISettings {
  if (settings.imageProviders?.length) return settings;

  const hasJimengConfig = Boolean(
    settings.jimengApiUrl?.trim() || settings.jimengSessionId?.trim(),
  );

  if (!hasJimengConfig) {
    return {
      ...settings,
      imageProviders: [],
      defaultImageProviderId: null,
      defaultImageModel: null,
    };
  }

  const model = settings.jimengModel?.trim() || DEFAULT_JIMENG_MODEL;
  const jimeng: ImageProvider = {
    id: 'jimeng-default',
    name: '即梦',
    type: 'jimeng',
    baseUrl: settings.jimengApiUrl ?? '',
    apiKey: settings.jimengSessionId ?? '',
    models: [model],
  };

  return {
    ...settings,
    imageProviders: [jimeng],
    defaultImageProviderId: jimeng.id,
    defaultImageModel: model,
    jimengApiUrl: '',
    jimengSessionId: '',
    jimengModel: '',
  };
}
