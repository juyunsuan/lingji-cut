/**
 * DouyinClient — UI 使用抖音能力的唯一入口（设计文档第 6 / 12 节）。
 *
 * UI 四个表面都只依赖此接口，不直接访问 chrome.runtime，便于测试与后续替换实现。
 * 具体实现（createDouyinClient）经消息协议把请求送到 Service Worker 路由。
 */
import type {
  Creator,
  CreatorSubscription,
  DownloadTask,
  ProcessingTask,
  TranscriptDocument,
  Video,
  VideoAnalysis,
  WorkflowItem,
} from '@/domain/models';
import type {
  AddWorkflowItemInput,
  AiSettingsView,
  DownloadOptions,
  ExportTask,
  FollowCreatorInput,
  ListVideoOptions,
  MarkdownExportInput,
  MonitorResult,
  PageDetectionResult,
  ProcessVideoOptions,
  ProviderTestResult,
  ResolveVideoInput,
  ResolvedVideo,
  TestAiProviderInput,
  UpdateAiSettingsInput,
  UpdateWorkflowItemInput,
  VideoPage,
} from '@/domain/api-types';
import type { MethodName } from '@/protocol/methods';
import { createRequest } from '@/protocol/messages';
import { SonarException } from '@/domain/errors';
import type { BridgeSettingsView, UpdateBridgeSettingsInput } from '@/bridge/bridge-settings';
import type { ProbeResult } from '@/bridge/bridge-client';
import type { PushResult } from '@/bridge/push-on-processed';
import type { Transport } from './transport';

export interface DouyinClient {
  detectCurrentPage(): Promise<PageDetectionResult>;

  getCreator(creatorId: string): Promise<Creator>;
  /** 按页面 secUid 反查已采集的博主（未采集到返回 null）。 */
  getCreatorBySecUid(secUid: string): Promise<Creator | null>;
  listCreatorVideos(creatorId: string, options?: ListVideoOptions): Promise<VideoPage>;
  /** 全部已采集视频（视频库 / 动态流）。 */
  listRecentVideos(limit?: number): Promise<Video[]>;

  resolveVideo(input: ResolveVideoInput): Promise<ResolvedVideo>;
  downloadVideo(videoId: string, options?: DownloadOptions): Promise<DownloadTask>;
  getDownloadTask(taskId: string): Promise<DownloadTask>;
  cancelDownload(taskId: string): Promise<void>;

  followCreator(input: FollowCreatorInput): Promise<void>;
  unfollowCreator(creatorId: string): Promise<void>;
  listFollowedCreators(): Promise<CreatorSubscription[]>;
  runMonitorOnce(creatorId?: string): Promise<MonitorResult>;

  processVideo(videoId: string, options?: ProcessVideoOptions): Promise<ProcessingTask>;
  getProcessingTask(taskId: string): Promise<ProcessingTask>;
  cancelProcessingTask(taskId: string): Promise<void>;

  getTranscript(videoId: string): Promise<TranscriptDocument | null>;
  regenerateTranscript(videoId: string): Promise<ProcessingTask>;
  getAnalysis(videoId: string): Promise<VideoAnalysis | null>;
  regenerateAnalysis(videoId: string): Promise<ProcessingTask>;

  exportMarkdown(input: MarkdownExportInput): Promise<ExportTask>;
  addToWorkflow(input: AddWorkflowItemInput): Promise<WorkflowItem>;
  listWorkflowItems(): Promise<WorkflowItem[]>;
  updateWorkflowItem(input: UpdateWorkflowItemInput): Promise<WorkflowItem>;

  getAiSettings(): Promise<AiSettingsView>;
  updateAiSettings(input: UpdateAiSettingsInput): Promise<void>;
  testAiProvider(input: TestAiProviderInput): Promise<ProviderTestResult>;

  // 灵机剪影联动（桥）
  getBridgeSettings(): Promise<BridgeSettingsView>;
  updateBridgeSettings(input: UpdateBridgeSettingsInput): Promise<void>;
  testBridge(): Promise<ProbeResult>;
  /** 手动把某视频（须已转录）推送到灵机剪影待创作箱，命中已有则刷新为待创作。 */
  pushVideoToBridge(videoId: string): Promise<PushResult>;
}

/**
 * 构造经传输层与 Service Worker 通信的 DouyinClient 实现。
 * 成功响应返回结果；失败响应抛出携带标准化 SonarError 的 SonarException。
 */
export function createDouyinClient(transport: Transport): DouyinClient {
  async function call<T>(method: MethodName, params: unknown): Promise<T> {
    const response = await transport.send(createRequest(method, params));
    if (response.ok) return response.result as T;
    throw new SonarException(response.error);
  }

  return {
    detectCurrentPage: () => call('detectCurrentPage', undefined),
    getCreator: (creatorId) => call('getCreator', { creatorId }),
    getCreatorBySecUid: (secUid) => call('getCreatorBySecUid', { secUid }),
    listCreatorVideos: (creatorId, options) => call('listCreatorVideos', { creatorId, options }),
    listRecentVideos: (limit) => call('listRecentVideos', { limit }),
    resolveVideo: (input) => call('resolveVideo', input),
    downloadVideo: (videoId, options) => call('downloadVideo', { videoId, options }),
    getDownloadTask: (taskId) => call('getDownloadTask', { taskId }),
    cancelDownload: async (taskId) => {
      await call('cancelDownload', { taskId });
    },
    followCreator: async (input) => {
      await call('followCreator', input);
    },
    unfollowCreator: async (creatorId) => {
      await call('unfollowCreator', { creatorId });
    },
    listFollowedCreators: () => call('listFollowedCreators', undefined),
    runMonitorOnce: (creatorId) => call('runMonitorOnce', { creatorId }),
    processVideo: (videoId, options) => call('processVideo', { videoId, options }),
    getProcessingTask: (taskId) => call('getProcessingTask', { taskId }),
    cancelProcessingTask: async (taskId) => {
      await call('cancelProcessingTask', { taskId });
    },
    getTranscript: (videoId) => call('getTranscript', { videoId }),
    regenerateTranscript: (videoId) => call('regenerateTranscript', { videoId }),
    getAnalysis: (videoId) => call('getAnalysis', { videoId }),
    regenerateAnalysis: (videoId) => call('regenerateAnalysis', { videoId }),
    exportMarkdown: (input) => call('exportMarkdown', input),
    addToWorkflow: (input) => call('addToWorkflow', input),
    listWorkflowItems: () => call('listWorkflowItems', undefined),
    updateWorkflowItem: (input) => call('updateWorkflowItem', input),
    getAiSettings: () => call('getAiSettings', undefined),
    updateAiSettings: async (input) => {
      await call('updateAiSettings', input);
    },
    testAiProvider: (input) => call('testAiProvider', input),
    getBridgeSettings: () => call('getBridgeSettings', undefined),
    updateBridgeSettings: async (input) => {
      await call('updateBridgeSettings', input);
    },
    testBridge: () => call('testBridge', undefined),
    pushVideoToBridge: (videoId) => call('pushVideoToBridge', { videoId }),
  };
}
