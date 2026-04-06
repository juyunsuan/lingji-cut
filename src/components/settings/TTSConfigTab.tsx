import { useState, useEffect } from 'react';
import { loadTTSSettings, saveTTSSettings } from '../../lib/settings-storage';
import { Field, Input } from '../../ui';

const VOICE_OPTIONS = [
  { id: 'male-qn-qingse', label: '男声 · 青涩' },
  { id: 'female-tianmei', label: '女声 · 甜美' },
  { id: 'boke_male', label: '播客男声' },
];

export function TTSConfigTab() {
  const [apiKey, setApiKey] = useState('');
  const [voiceId, setVoiceId] = useState('male-qn-qingse');
  const [speed, setSpeed] = useState(1.0);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const settings = loadTTSSettings();
    setApiKey(settings.apiKey);
    setVoiceId(settings.voiceId);
    setSpeed(settings.speed);
  }, []);

  const handleSave = () => {
    saveTTSSettings({ apiKey, voiceId, speed });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>TTS 语音合成配置</h2>
        <p style={{ fontSize: 13, color: '#EBEBF599', margin: '8px 0 0' }}>
          配置 MiniMax TTS 服务参数（第二期功能，当前仅保存配置）
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="MiniMax API Key">
          <Input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="your-api-key" />
        </Field>

        <Field label="音色选择">
          <select
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            style={{
              width: '100%', padding: '8px 12px', borderRadius: 8,
              border: '1px solid #48484A',
              background: '#2C2C2E', color: 'inherit',
              fontSize: 13,
            }}
          >
            {VOICE_OPTIONS.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </Field>

        <Field label={`语速：${speed.toFixed(1)}x`}>
          <input
            type="range" min="0.5" max="2.0" step="0.1"
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </Field>
      </div>

      <button
        type="button"
        onClick={handleSave}
        style={{
          alignSelf: 'flex-start',
          padding: '10px 24px',
          borderRadius: 8,
          border: 'none',
          background: saved ? '#32D74B' : '#0A84FF',
          color: '#fff',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {saved ? '已保存 ✓' : '保存 TTS 配置'}
      </button>
    </>
  );
}
