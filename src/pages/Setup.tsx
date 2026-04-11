import { useCallback, useMemo, useState } from 'react';
import { Plus, Sparkles, Music, Video, FolderOpen, FolderSearch, CheckCircle2, AlertCircle, Link, Loader2 } from 'lucide-react';
import { getFileNameFromPath } from '../lib/utils';
import type { RecentProjectEntry } from '../lib/electron-api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
  DialogClose,
} from '../ui';
import { ProjectList } from '../components/ProjectList';
import heroBg from '../assets/hero-bg.png';
import styles from './Setup.module.css';

interface SetupProps {
  busy: boolean;
  errorMessage: string | null;
  projectName: string;
  recentProjects: RecentProjectEntry[];
  onComplete: (audioPath: string, srtPath: string) => Promise<void>;
  onOpenRecentProject: (projectDir: string) => Promise<void>;
  onRemoveRecentProject?: (projectDir: string) => Promise<void> | void;
  onStartScriptWorkbench: () => void;
  onOpenSettings: () => void;
  /** 抖音导入完成回调：传入父目录、标题和原始链接，由 App 层创建项目并自动触发下载转录 */
  onDouyinImport: (parentDir: string, title: string, douyinUrl: string) => Promise<void>;
}

interface ScanResult {
  dir: string;
  audioFiles: string[];
  srtFiles: string[];
}

export function Setup({
  busy,
  errorMessage,
  projectName,
  recentProjects,
  onComplete,
  onOpenRecentProject,
  onRemoveRecentProject,
  onStartScriptWorkbench,
  onOpenSettings,
  onDouyinImport,
}: SetupProps) {
  // ── 音频导入弹窗状态 ──
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<string | null>(null);
  const [selectedSrt, setSelectedSrt] = useState<string | null>(null);

  // ── 抖音导入弹窗状态 ──
  const [douyinDialogOpen, setDouyinDialogOpen] = useState(false);
  const [douyinUrl, setDouyinUrl] = useState('');
  const [douyinResolving, setDouyinResolving] = useState(false);
  const [douyinTitle, setDouyinTitle] = useState<string | null>(null);
  const [douyinParentDir, setDouyinParentDir] = useState<string | null>(null);
  const [douyinError, setDouyinError] = useState<string | null>(null);
  const [douyinCreating, setDouyinCreating] = useState(false);

  const canImport = useMemo(
    () => Boolean(selectedAudio && selectedSrt && !busy),
    [selectedAudio, selectedSrt, busy],
  );

  const handleOpenImportDialog = useCallback(() => {
    setScanResult(null);
    setSelectedAudio(null);
    setSelectedSrt(null);
    setImportDialogOpen(true);
  }, []);

  // ── 抖音导入弹窗操作 ──
  const handleOpenDouyinDialog = useCallback(() => {
    setDouyinUrl('');
    setDouyinTitle(null);
    setDouyinParentDir(null);
    setDouyinError(null);
    setDouyinResolving(false);
    setDouyinCreating(false);
    setDouyinDialogOpen(true);
  }, []);

  /** 解析抖音链接，提取视频标题 */
  const handleResolveDouyinUrl = useCallback(async () => {
    if (!douyinUrl.trim()) return;
    setDouyinResolving(true);
    setDouyinError(null);
    setDouyinTitle(null);

    try {
      const { title } = await window.electronAPI.resolveDouyinUrl(douyinUrl);
      setDouyinTitle(title);
    } catch (err) {
      setDouyinError(err instanceof Error ? err.message : '解析失败，请检查链接是否有效');
    } finally {
      setDouyinResolving(false);
    }
  }, [douyinUrl]);

  /** 选择项目存放的父目录 */
  const handleSelectDouyinDir = useCallback(async () => {
    const dir = await window.electronAPI.selectProjectDirectory();
    if (dir) setDouyinParentDir(dir);
  }, []);

  /** 确认创建项目：在父目录下建立以标题命名的文件夹，携带原始链接自动触发下载转录 */
  const handleDouyinConfirm = useCallback(async () => {
    if (!douyinTitle || !douyinParentDir || !douyinUrl.trim()) return;
    setDouyinCreating(true);
    setDouyinError(null);

    try {
      await onDouyinImport(douyinParentDir, douyinTitle, douyinUrl.trim());
      setDouyinDialogOpen(false);
    } catch (err) {
      setDouyinError(err instanceof Error ? err.message : '创建项目失败');
    } finally {
      setDouyinCreating(false);
    }
  }, [douyinTitle, douyinParentDir, douyinUrl, onDouyinImport]);

  const canCreateDouyinProject = Boolean(douyinTitle && douyinParentDir && !douyinCreating);

  const handleSelectDirectory = useCallback(async () => {
    const dir = await window.electronAPI.selectProjectDirectory();
    if (!dir) return;

    setScanning(true);
    setScanResult(null);
    setSelectedAudio(null);
    setSelectedSrt(null);

    try {
      const result = await window.electronAPI.scanImportDirectory(dir);
      setScanResult({ dir, ...result });
      // 自动选中第一个找到的文件
      if (result.audioFiles.length > 0) setSelectedAudio(result.audioFiles[0]);
      if (result.srtFiles.length > 0) setSelectedSrt(result.srtFiles[0]);
    } finally {
      setScanning(false);
    }
  }, []);

  const handleImportConfirm = useCallback(() => {
    if (!selectedAudio || !selectedSrt) return;
    setImportDialogOpen(false);
    void onComplete(selectedAudio, selectedSrt);
  }, [selectedAudio, selectedSrt, onComplete]);

  return (
    <div className={styles.page}>
      <div className={styles.welcomeContent}>
        {/* ── Hero Banner ── */}
        <div className={styles.heroBanner}>
          <img src={heroBg} alt="" className={styles.heroBannerImage} />
          <div className={styles.heroBannerOverlay} />
          {projectName && (
            <div className={styles.projectBadge}>
              <FolderOpen size={13} strokeWidth={1.8} />
              {projectName}
            </div>
          )}
          <button
            type="button"
            className={styles.createButton}
            onClick={onStartScriptWorkbench}
          >
            <Plus size={18} strokeWidth={2.2} />
            开始创作
          </button>
        </div>

        {/* ── 快捷功能行 ── */}
        <div className={styles.quickBar}>
          <button
            type="button"
            className={styles.quickItem}
            onClick={onStartScriptWorkbench}
          >
            <div className={styles.quickItemIcon}>
              <Sparkles size={22} strokeWidth={1.5} />
            </div>
            <span className={styles.quickItemLabel}>AI写稿</span>
          </button>
          <button
            type="button"
            className={styles.quickItem}
            onClick={handleOpenImportDialog}
          >
            <div className={styles.quickItemIcon}>
              <Music size={22} strokeWidth={1.5} />
            </div>
            <span className={styles.quickItemLabel}>导入音频</span>
          </button>
          {/* 抖音导入入口：解析抖音链接 → 提取标题 → 创建项目 */}
          <button
            type="button"
            className={styles.quickItem}
            onClick={handleOpenDouyinDialog}
          >
            <div className={styles.quickItemIcon}>
              <Video size={22} strokeWidth={1.5} />
            </div>
            <span className={styles.quickItemLabel}>抖音导入</span>
          </button>
        </div>

        {/* ── 本地草稿 ── */}
        <div className={styles.draftsSection}>
          <ProjectList
            projects={recentProjects}
            onOpenProject={onOpenRecentProject}
            onRemoveProject={onRemoveRecentProject}
          />
        </div>
      </div>

      {/* ── 导入弹窗 ── */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent size="md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>导入音频与字幕</DialogTitle>
            <DialogDescription>
              选择一个目录，系统将自动识别其中的音频和 SRT 字幕文件
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {/* 选择目录按钮 */}
            <button
              type="button"
              className={styles.dirPickerButton}
              onClick={handleSelectDirectory}
              disabled={scanning}
            >
              <FolderSearch size={20} strokeWidth={1.5} />
              <span className={styles.dirPickerText}>
                {scanning
                  ? '正在扫描...'
                  : scanResult
                    ? scanResult.dir
                    : '点击选择目录'}
              </span>
            </button>

            {/* 扫描结果 */}
            {scanResult && (
              <div className={styles.scanResults}>
                {/* 音频文件 */}
                <div className={styles.scanGroup}>
                  <div className={styles.scanGroupHeader}>
                    {scanResult.audioFiles.length > 0 ? (
                      <CheckCircle2 size={14} strokeWidth={2} className={styles.scanIconOk} />
                    ) : (
                      <AlertCircle size={14} strokeWidth={2} className={styles.scanIconWarn} />
                    )}
                    <span className={styles.scanGroupTitle}>
                      音频文件
                      <span className={styles.scanGroupCount}>
                        ({scanResult.audioFiles.length})
                      </span>
                    </span>
                  </div>
                  {scanResult.audioFiles.length > 0 ? (
                    <div className={styles.scanFileList}>
                      {scanResult.audioFiles.map((f) => (
                        <label key={f} className={styles.scanFileItem}>
                          <input
                            type="radio"
                            name="audio"
                            checked={selectedAudio === f}
                            onChange={() => setSelectedAudio(f)}
                            className={styles.scanRadio}
                          />
                          <span className={styles.scanFileName}>
                            {getFileNameFromPath(f)}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.scanEmpty}>未找到音频文件</div>
                  )}
                </div>

                {/* SRT 文件 */}
                <div className={styles.scanGroup}>
                  <div className={styles.scanGroupHeader}>
                    {scanResult.srtFiles.length > 0 ? (
                      <CheckCircle2 size={14} strokeWidth={2} className={styles.scanIconOk} />
                    ) : (
                      <AlertCircle size={14} strokeWidth={2} className={styles.scanIconWarn} />
                    )}
                    <span className={styles.scanGroupTitle}>
                      字幕文件
                      <span className={styles.scanGroupCount}>
                        ({scanResult.srtFiles.length})
                      </span>
                    </span>
                  </div>
                  {scanResult.srtFiles.length > 0 ? (
                    <div className={styles.scanFileList}>
                      {scanResult.srtFiles.map((f) => (
                        <label key={f} className={styles.scanFileItem}>
                          <input
                            type="radio"
                            name="srt"
                            checked={selectedSrt === f}
                            onChange={() => setSelectedSrt(f)}
                            className={styles.scanRadio}
                          />
                          <span className={styles.scanFileName}>
                            {getFileNameFromPath(f)}
                          </span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.scanEmpty}>未找到 SRT 字幕文件</div>
                  )}
                </div>
              </div>
            )}

            {errorMessage && (
              <div className={styles.importError}>{errorMessage}</div>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">取消</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={!canImport}
              onClick={handleImportConfirm}
            >
              {busy ? '正在初始化...' : '导入并开始'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 抖音导入弹窗：解析链接 → 选择目录 → 创建项目 ── */}
      <Dialog open={douyinDialogOpen} onOpenChange={setDouyinDialogOpen}>
        <DialogContent size="md">
          <DialogClose />
          <DialogHeader>
            <DialogTitle>抖音视频导入</DialogTitle>
            <DialogDescription>
              粘贴抖音分享链接，自动解析视频标题并创建同名项目文件夹
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {/* 链接输入 + 解析按钮 */}
            <div className={styles.douyinUrlRow}>
              <div className={styles.douyinUrlInputWrap}>
                <Link size={16} strokeWidth={1.5} className={styles.douyinUrlIcon} />
                <input
                  type="text"
                  value={douyinUrl}
                  onChange={(e) => setDouyinUrl(e.target.value)}
                  placeholder="粘贴抖音分享链接，如 https://v.douyin.com/..."
                  className={styles.douyinUrlInput}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && douyinUrl.trim() && !douyinResolving) {
                      void handleResolveDouyinUrl();
                    }
                  }}
                />
              </div>
              <Button
                variant="secondary"
                onClick={() => void handleResolveDouyinUrl()}
                disabled={!douyinUrl.trim() || douyinResolving}
              >
                {douyinResolving ? (
                  <>
                    <Loader2 size={14} className={styles.spinIcon} />
                    解析中
                  </>
                ) : '解析链接'}
              </Button>
            </div>

            {/* 解析成功：显示标题 */}
            {douyinTitle && (
              <div className={styles.douyinResultCard}>
                <CheckCircle2 size={16} strokeWidth={2} className={styles.douyinResultIcon} />
                <div className={styles.douyinResultBody}>
                  <span className={styles.douyinResultLabel}>视频标题</span>
                  <span className={styles.douyinResultTitle}>{douyinTitle}</span>
                </div>
              </div>
            )}

            {/* 选择项目存放目录 */}
            {douyinTitle && (
              <button
                type="button"
                className={styles.dirPickerButton}
                onClick={() => void handleSelectDouyinDir()}
                style={{ marginTop: 12 }}
              >
                <FolderSearch size={20} strokeWidth={1.5} />
                <span className={styles.dirPickerText}>
                  {douyinParentDir
                    ? douyinParentDir
                    : '选择项目存放目录'}
                </span>
              </button>
            )}

            {/* 预览最终项目路径 */}
            {douyinTitle && douyinParentDir && (
              <div className={styles.douyinProjectPath}>
                <FolderOpen size={14} strokeWidth={1.5} />
                <span>项目将创建在：{douyinParentDir}/{douyinTitle}</span>
              </div>
            )}

            {/* 错误提示 */}
            {douyinError && (
              <div className={styles.importError} style={{ marginTop: 12 }}>
                {douyinError}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="ghost">取消</Button>
            </DialogClose>
            <Button
              variant="primary"
              disabled={!canCreateDouyinProject}
              onClick={() => void handleDouyinConfirm()}
            >
              {douyinCreating ? '创建中...' : '创建项目并开始创作'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
