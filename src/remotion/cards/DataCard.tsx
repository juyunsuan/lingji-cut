import type { CardStyle, DataContent } from '../../types/ai';
import { CardEyebrow, CardFrame } from './CardFrame';

interface DataCardProps {
  title: string;
  content: DataContent;
  style: CardStyle;
}

export function DataCard({ title, content, style }: DataCardProps) {
  const numericValues = content.items
    .map((item) => (typeof item.value === 'number' ? item.value : 0))
    .filter((value) => value > 0);
  const maxValue = Math.max(...numericValues, 1);

  return (
    <CardFrame cardStyle={style}>
      <CardEyebrow accentColor={style.primaryColor}>DATA</CardEyebrow>
      <div style={titleStyle(style.fontSize - 4)}>{title}</div>
      <div style={barsStyle}>
        {content.items.map((item) => {
          const numericValue = typeof item.value === 'number' ? item.value : 0;
          const height = Math.max(20, (numericValue / maxValue) * 280);
          return (
            <div key={`${item.label}-${item.value}`} style={itemStyle}>
              <div style={valueStyle}>{String(item.value)}</div>
              <div
                style={{
                  width: 84,
                  height,
                  borderRadius: '10px 10px 0 0',
                  background: item.highlight ? style.primaryColor : `${style.primaryColor}99`,
                }}
              />
              <div style={labelStyle}>{item.label}</div>
            </div>
          );
        })}
      </div>
    </CardFrame>
  );
}

function titleStyle(fontSize: number) {
  return {
    fontSize,
    fontWeight: 700,
    marginBottom: 54,
    textAlign: 'center' as const,
  };
}

const barsStyle = {
  display: 'flex',
  alignItems: 'flex-end',
  gap: 48,
  height: 360,
};

const itemStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  alignItems: 'center',
  gap: 12,
};

const valueStyle = {
  color: '#cbd5e1',
  fontSize: 24,
};

const labelStyle = {
  color: '#94a3b8',
  fontSize: 22,
};
