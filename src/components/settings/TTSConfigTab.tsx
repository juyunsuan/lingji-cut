import { useState, useEffect } from 'react';
import { loadAISettings, saveAISettings } from '../../store/ai';
import { Field, Input, Slider } from '../../ui';

const MINIMAX_MODELS = [
  'speech-2.8-hd',
  'speech-2.8-turbo',
  'speech-2.6-hd',
  'speech-2.6-turbo',
  'speech-02-hd',
  'speech-02-turbo',
  'speech-01-hd',
  'speech-01-turbo',
];

const EMOTIONS = [
  { value: '', label: '自动（模型判断）' },
  { value: 'happy', label: '高兴' },
  { value: 'sad', label: '悲伤' },
  { value: 'angry', label: '愤怒' },
  { value: 'fearful', label: '害怕' },
  { value: 'disgusted', label: '厌恶' },
  { value: 'surprised', label: '惊讶' },
  { value: 'calm', label: '中性' },
  { value: 'fluent', label: '生动（2.6 系列）' },
];

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid rgba(255,255,255,0.12)',
  background: '#1c1c1e',
  color: '#fff',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
};

export function TTSConfigTab() {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('speech-2.8-hd');
  const [voiceId, setVoiceId] = useState('male-qn-qingse');
  const [speed, setSpeed] = useState(1.0);
  const [vol, setVol] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [emotion, setEmotion] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadAISettings().then((s) => {
      if (!s) return;
      setApiKey(s.minimaxApiKey ?? '');
      setModel(s.minimaxModel ?? 'speech-2.8-hd');
      setVoiceId(s.minimaxVoiceId ?? 'male-qn-qingse');
      setSpeed(s.minimaxSpeed ?? 1.0);
      setVol(s.minimaxVol ?? 1.0);
      setPitch(s.minimaxPitch ?? 0);
      setEmotion(s.minimaxEmotion ?? '');
    });
  }, []);

  const handleSave = () => {
    void loadAISettings().then((current) => {
      void saveAISettings({
        ...(current ?? {
          llmBaseUrl: '',
          llmApiKey: '',
          llmModel: '',
          jimengApiUrl: '',
          jimengSessionId: '',
        }),
        minimaxApiKey: apiKey,
        minimaxModel: model,
        minimaxVoiceId: voiceId,
        minimaxSpeed: speed,
        minimaxVol: vol,
        minimaxPitch: pitch,
        minimaxEmotion: emotion,
      }).then(() => {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      });
    });
  };

  return (
    <>
      <div>
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>TTS 语音合成配置</h2>
        <p style={{ fontSize: 13, color: '#EBEBF599', margin: '8px 0 0' }}>
          MiniMax T2A v2 接口配置，用于 AI 一键剪辑的语音生成
        </p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="MiniMax API Key">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="your-api-key"
          />
        </Field>

        <Field label="模型">
          <select value={model} onChange={(e) => setModel(e.target.value)} style={selectStyle}>
            {MINIMAX_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <Field label="音色 ID" hint="系统音色 ID 或克隆音色 ID，参考 MiniMax 音色列表">
          <Input
            value={voiceId}
            onChange={(e) => setVoiceId(e.target.value)}
            placeholder="例如：male-qn-qingse"
          />
        </Field>

        <Field label={`语速：${speed.toFixed(1)}x`} hint="范围 0.5–2.0，默认 1.0">
          <Slider min={0.5} max={2.0} step={0.1} value={speed} onChange={setSpeed} size="md" />
        </Field>

        <Field label={`音量：${vol.toFixed(1)}`} hint="范围 0.1–10，默认 1.0">
          <Slider min={0.1} max={10} step={0.1} value={vol} onChange={setVol} size="md" />
        </Field>

        <Field label={`音调：${pitch > 0 ? '+' : ''}${pitch}`} hint="范围 -12–12，0 为原音色">
          <Slider min={-12} max={12} step={1} value={pitch} onChange={setPitch} size="md" />
        </Field>

        <Field
          label="情绪"
          hint="speech-2.8 系列不支持 whisper；fluent 仅 2.6 系列生效"
        >
          <select
            value={emotion}
            onChange={(e) => setEmotion(e.target.value)}
            style={selectStyle}
          >
            {EMOTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
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
