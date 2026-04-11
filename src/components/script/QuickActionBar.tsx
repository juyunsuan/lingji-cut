import { FileUp, Sparkles, Search, Copy, RefreshCw, Square, User } from 'lucide-react';
import { useScriptStore } from '../../store/script';
import { getAllRoles } from '../../lib/script-templates';
import { ModelSelector } from './ModelSelector';
import styles from './QuickActionBar.module.css';

// ─── 组件 ─────────────────────────────────────────────

interface QuickActionBarProps {
  onImportText: () => void;
  onImportDouyin: () => void;
}

/** 内容区顶部快捷操作栏：根据工作流状态展示不同操作按钮 */
export function QuickActionBar({ onImportText, onImportDouyin }: QuickActionBarProps) {
  const currentStep = useScriptStore((s) => s.currentStep);
  const workspaceFiles = useScriptStore((s) => s.workspaceFiles);
  const agentOperation = useScriptStore((s) => s.agentOperation);
  const reviewState = useScriptStore((s) => s.reviewState);
  const scriptText = useScriptStore((s) => s.scriptText);
  const annotations = useScriptStore((s) => s.annotations);
  const selectedRole = useScriptStore((s) => s.selectedRole);
  const setSelectedRole = useScriptStore((s) => s.setSelectedRole);
  const stopAgentOperation = useScriptStore((s) => s.stopAgentOperation);
  const generateScriptCb = useScriptStore((s) => s.workbenchCallbacks.generateScript);
  const regenerateScript = useScriptStore((s) => s.workbenchCallbacks.regenerateScript);
  const reviewScriptCb = useScriptStore((s) => s.workbenchCallbacks.reviewScript);

  const roles = getAllRoles();
  const isOperating = agentOperation.isOperating;
  const hasOriginal = workspaceFiles.hasOriginalFile;
  const hasScript = workspaceFiles.hasScriptFile;
  const shouldPromptGenerate = hasOriginal && currentStep <= 1;
  const hasActionableAnnotations = annotations.some(
    (a) => a.status === 'pending' && !a.stale,
  );

  const handleGenerate = () => {
    if (!generateScriptCb || isOperating) return;
    void generateScriptCb();
  };

  const handleReview = () => {
    if (!reviewScriptCb || isOperating) return;
    void reviewScriptCb();
  };

  const handleRegenerate = () => {
    if (!regenerateScript || isOperating) return;
    void regenerateScript();
  };

  // 角色选择器（显示在有原稿后、生成相关的场景中）
  const roleSelector = (
    <div className={styles.roleSelector}>
      <User size={12} className={styles.roleIcon} />
      <select
        className={styles.roleSelect}
        value={selectedRole}
        onChange={(e) => setSelectedRole(e.target.value)}
        disabled={isOperating}
        title="选择口播角色"
      >
        {roles.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </div>
  );

  const handleCopy = () => {
    if (scriptText) {
      navigator.clipboard.writeText(scriptText).catch(() => {});
    }
  };

  const handleAcceptAll = () => {
    useScriptStore.getState().acceptAllAnnotations();
  };

  const handleStop = () => {
    stopAgentOperation();
  };

  // 操作中 → 只展示停止按钮
  if (isOperating) {
    return (
      <div className={styles.bar}>
        <div className={styles.hint}>AI 处理中...</div>
        <div className={styles.actions}>
          {agentOperation.canInterrupt ? (
            <button className={`${styles.btn} ${styles.dangerBtn}`} onClick={handleStop}>
              <Square size={12} />
              停止
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  // 无原稿 → 导入
  if (!hasOriginal && !hasScript) {
    return (
      <div className={styles.bar}>
        <div className={styles.hint}>开始创作</div>
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.primaryBtn}`} onClick={onImportText}>
            <FileUp size={12} />
            导入原稿
          </button>
          <button className={styles.btn} onClick={onImportDouyin}>
            <FileUp size={12} />
            导入抖音视频
          </button>
        </div>
      </div>
    );
  }

  // 新原稿已导入，优先提示生成口播稿
  if (shouldPromptGenerate || (hasOriginal && !hasScript)) {
    return (
      <div className={styles.bar}>
        <div className={styles.hint}>原稿已就绪</div>
        <div className={styles.actions}>
          {roleSelector}
          <ModelSelector />
          <button
            className={`${styles.btn} ${styles.primaryBtn}`}
            disabled={!generateScriptCb}
            onClick={handleGenerate}
            title="AI 根据原稿生成口播稿"
          >
            <Sparkles size={12} />
            AI 生成口播稿
          </button>
          <button className={styles.btn} onClick={onImportText}>
            <FileUp size={12} />
            重新导入
          </button>
          <button className={styles.btn} onClick={onImportDouyin}>
            <FileUp size={12} />
            抖音导入
          </button>
        </div>
      </div>
    );
  }

  // 有口播稿
  if (hasScript) {
    // 审查发现问题
    if (hasActionableAnnotations && reviewState === 'issues') {
      return (
        <div className={styles.bar}>
          <div className={styles.hint}>审查发现问题</div>
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.primaryBtn}`} onClick={handleAcceptAll}>
              全部接受建议
            </button>
            <button
              className={styles.btn}
              disabled={!reviewScriptCb}
              onClick={handleReview}
            >
              <Search size={12} />
              重新审查
            </button>
          </div>
        </div>
      );
    }

    // 内容已变更 → 提示重新审查
    if (reviewState === 'stale') {
      return (
        <div className={styles.bar}>
          <div className={styles.hint}>内容已变更，建议重新审查</div>
          <div className={styles.actions}>
            {roleSelector}
            <button
              className={`${styles.btn} ${styles.primaryBtn}`}
              disabled={!reviewScriptCb}
              onClick={handleReview}
            >
              <Search size={12} />
              重新审查
            </button>
            <button
              className={styles.btn}
              disabled={!regenerateScript}
              onClick={handleRegenerate}
            >
              <RefreshCw size={12} />
              重新生成
            </button>
          </div>
        </div>
      );
    }

    // 审查通过
    if (reviewState === 'clean') {
      return (
        <div className={styles.bar}>
          <div className={styles.hint}>审查通过</div>
          <div className={styles.actions}>
            <button className={`${styles.btn} ${styles.primaryBtn}`} onClick={handleCopy}>
              <Copy size={12} />
              复制口播稿
            </button>
            <button
              className={styles.btn}
              disabled={!regenerateScript}
              onClick={handleRegenerate}
            >
              <RefreshCw size={12} />
              重新生成
            </button>
          </div>
        </div>
      );
    }

    // 默认：有口播稿，未审查
    return (
      <div className={styles.bar}>
        <div className={styles.hint}>口播稿已生成</div>
        <div className={styles.actions}>
          {roleSelector}
          <button
            className={`${styles.btn} ${styles.primaryBtn}`}
            disabled={!reviewScriptCb}
            onClick={handleReview}
            title="AI 审查口播稿质量"
          >
            <Search size={12} />
            AI 审稿
          </button>
          <button
            className={styles.btn}
            disabled={!regenerateScript}
            onClick={handleRegenerate}
          >
            <RefreshCw size={12} />
            重新生成
          </button>
          <button className={styles.btn} onClick={handleCopy}>
            <Copy size={12} />
            复制口播稿
          </button>
        </div>
      </div>
    );
  }

  return null;
}
