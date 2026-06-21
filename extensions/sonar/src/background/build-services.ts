/**
 * 装配运行时 Services（设计文档总体架构）。
 *
 * - download：chrome.downloads 真实实现。
 * - export：Markdown 导出真实实现。
 * - aiTester：Provider 连通性测试真实实现。
 * - processing：按当前设置构建 ASR/Summary Provider 的编排器；取流用 SW fetch（DNR 注入
 *   Referer），音频经 OPFS 交给 Offscreen Web Audio 下混、重采样并编码为 WAV。
 * - monitor：inactive 标签页捕获新作品；发现的新作品经串行处理队列自动做字幕解析
 *   （+ 配置了 Provider 时生成摘要）。
 */
import type { ProcessingTask } from '@/domain/models';
import type { ProcessVideoOptions } from '@/domain/api-types';
import { SonarException, makeError } from '@/domain/errors';
import { ensureVideoSources, createFetchPage } from './resolve-sources';
import { createBcutAsrProvider } from '@/processing/bcut-asr-provider';
import { createSummaryProvider } from '@/processing/summary-provider';
import { createProcessingService } from '@/processing/processing-service';
import { createProcessingQueue } from './processing-queue';
import type { AudioExtractor } from '@/processing/audio-extractor';
import { createChromeOffscreenAudioExtractor } from '@/processing/offscreen-audio-extractor';
import type { Repository } from './repository';
import { resolveDefaultProvider, type SettingsStore } from './settings-store';
import type { ProcessingService, Services } from './services';
import { createStubServices } from './services';
import { createChromeDownloadService, type AttachableDownloadService } from './download/chrome-download-service';
import { createMarkdownExportService } from './export/markdown-export-service';
import { createAiProviderTester } from './ai-provider-tester';
import { createMonitorService } from '@/monitor/monitor-service';
import { createTabCreatorFetcher, createChromeNotifier } from './monitor-tab';
import { createBridgeClient, type BridgeClient } from '@/bridge/bridge-client';
import { createPushOnProcessed } from '@/bridge/push-on-processed';
import type { BridgeSettingsStore } from '@/bridge/bridge-settings';
import { createMemoryBridgeSettingsStore } from '@/bridge/bridge-settings';
import type { BridgePendingStore } from '@/bridge/bridge-client';
import type { BridgeContext } from './handlers';

export interface BuildServicesDeps {
  repo: Repository;
  settings: SettingsStore;
  now: () => number;
  newId: () => string;
  fetchImpl?: typeof fetch;
  audioExtractor?: AudioExtractor;
  /** 桥设置存储（默认内存；运行时注入 chrome 实现）。 */
  bridgeSettings?: BridgeSettingsStore;
  /** 桥 pending 队列存储（默认内存；运行时注入 chrome 实现）。 */
  bridgePending?: BridgePendingStore;
}

function createConfiguredProcessingService(deps: BuildServicesDeps): ProcessingService {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const fetchPage = createFetchPage(fetchImpl);
  const extractor = deps.audioExtractor ?? createChromeOffscreenAudioExtractor();
  // 取流前现解析新鲜源：CDN 签名地址会过期，复用缓存会取到 403 html（与下载同因）。
  const resolveSources = async (videoId: string) =>
    (await ensureVideoSources({ repo: deps.repo, fetchPage, now: deps.now }, { awemeId: videoId, preferFresh: true }))
      .sources;

  const fetchMedia = async (url: string): Promise<Blob> => {
    const res = await fetchImpl(url);
    if (!res.ok) {
      throw new SonarException(makeError('MEDIA_FETCH_FAILED', `获取媒体失败（HTTP ${res.status}）`));
    }
    return res.blob();
  };

  // 每次调用按当前设置重建编排器（拾取最新 LLM Provider / 温度）。
  async function buildInner(): Promise<ProcessingService> {
    const s = await deps.settings.getAiSettings();
    // 转录固定走 bcut（零配置）。
    const asr = createBcutAsrProvider({ fetchImpl });

    const provider = resolveDefaultProvider(s.llm);
    const model = s.llm.defaultModel || provider?.models[0];
    const summary =
      provider && provider.baseUrl && model
        ? createSummaryProvider({
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey ?? '',
            model,
            protocol: provider.protocol,
            ...(s.llm.temperature !== undefined ? { temperature: s.llm.temperature } : {}),
          })
        : null;

    return createProcessingService({
      repo: deps.repo,
      resolveSources: (id) => resolveSources(id),
      fetchMedia,
      extractAudio: (video) => extractor.extract(video),
      asr,
      summary,
      now: deps.now,
      newId: deps.newId,
    });
  }

  return {
    async process(videoId: string, options?: ProcessVideoOptions): Promise<ProcessingTask> {
      return (await buildInner()).process(videoId, options);
    },

    async start(videoId: string, options?: ProcessVideoOptions): Promise<ProcessingTask> {
      return (await buildInner()).start(videoId, options);
    },

    async cancel(taskId: string): Promise<void> {
      const existing = await deps.repo.getProcessingTask(taskId);
      if (existing) await deps.repo.putProcessingTask({ ...existing, stage: 'cancelled', progress: 1 });
    },
  };
}

export interface BuiltServices {
  services: Services;
  downloadService: AttachableDownloadService;
  /** 桥依赖（HandlerContext 用）。 */
  bridge: BridgeContext;
  /** 补推暂存的 pending 负载（startup / 每次 alarm 调用）。 */
  flushBridgePending(): Promise<void>;
}

export function buildServices(deps: BuildServicesDeps): BuiltServices {
  const downloadService = createChromeDownloadService({ repo: deps.repo, newId: deps.newId });
  const processing = createConfiguredProcessingService(deps);
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  // 桥：发现并转录后把转录稿+元数据推到灵机剪影「待创作箱」。
  const bridgeSettings = deps.bridgeSettings ?? createMemoryBridgeSettingsStore();
  const bridgeClient: BridgeClient = createBridgeClient({
    fetchImpl,
    pending: deps.bridgePending ?? { async read() { return []; }, async write() {} },
  });
  const pushOnProcessed = createPushOnProcessed({ repo: deps.repo, bridgeSettings, bridgeClient });

  // 自动监控发现的新作品，逐条串行做字幕解析（单飞、去重、跳过已转录），转录后推桥。
  const autoQueue = createProcessingQueue({
    processing,
    repo: deps.repo,
    onError: (videoId, error) => console.warn('[Sonar] 自动处理失败', videoId, error),
    onProcessed: async (videoId) => {
      await pushOnProcessed(videoId);
    },
  });
  const services: Services = {
    ...createStubServices(),
    download: downloadService,
    export: createMarkdownExportService({ repo: deps.repo, now: deps.now, newId: deps.newId }),
    processing,
    aiTester: createAiProviderTester({ settings: deps.settings }),
    monitor: createMonitorService({
      repo: deps.repo,
      fetchCreatorVideos: createTabCreatorFetcher(deps.repo),
      notify: createChromeNotifier(),
      onNewVideo: (video) => void autoQueue.enqueue(video.id),
      now: deps.now,
    }),
  };
  return {
    services,
    downloadService,
    bridge: { settings: bridgeSettings, client: bridgeClient, push: pushOnProcessed },
    async flushBridgePending() {
      await bridgeClient.flushPending(await bridgeSettings.get());
    },
  };
}
