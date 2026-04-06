import { useState } from 'react';
import { ArrowLeft, Bot, FileText, MessageSquare, Volume2 } from 'lucide-react';
import { AIConfigTab } from '../components/settings/AIConfigTab';
import { TemplateManagerTab } from '../components/settings/TemplateManagerTab';
import { ReviewCriteriaTab } from '../components/settings/ReviewCriteriaTab';
import { TTSConfigTab } from '../components/settings/TTSConfigTab';
import styles from './Settings.module.css';

type SettingsTab = 'ai-config' | 'templates' | 'review' | 'tts';

const TABS: { id: SettingsTab; label: string; icon: typeof Bot }[] = [
  { id: 'ai-config', label: 'AI 基础配置', icon: Bot },
  { id: 'templates', label: '口播模板管理', icon: FileText },
  { id: 'review', label: '审查规范配置', icon: MessageSquare },
  { id: 'tts', label: 'TTS 语音合成', icon: Volume2 },
];

interface SettingsProps {
  onBack: () => void;
}

export function Settings({ onBack }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai-config');

  const renderTab = () => {
    switch (activeTab) {
      case 'ai-config': return <AIConfigTab />;
      case 'templates': return <TemplateManagerTab />;
      case 'review': return <ReviewCriteriaTab />;
      case 'tts': return <TTSConfigTab />;
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <button
            type="button"
            onClick={onBack}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EBEBF599', padding: 0 }}
          >
            <ArrowLeft size={18} />
          </button>
          <span className={styles.sidebarTitle}>系统设置</span>
        </div>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabButtonActive : ''}`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className={styles.content}>
        {renderTab()}
      </div>
    </div>
  );
}
