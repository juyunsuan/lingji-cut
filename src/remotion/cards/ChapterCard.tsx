import type { CardStyle } from '../../types/ai';
import { CardEyebrow, CardFrame } from './CardFrame';

interface ChapterCardProps {
  title: string;
  chapterIndex: number;
  timeRange: string;
  style: CardStyle;
}

export function ChapterCard({ title, chapterIndex, timeRange, style }: ChapterCardProps) {
  return (
    <CardFrame cardStyle={style}>
      <CardEyebrow accentColor={style.primaryColor}>
        CHAPTER {String(chapterIndex).padStart(2, '0')}
      </CardEyebrow>
      <div style={lineStyle(style.primaryColor)} />
      <div style={titleStyle}>{title}</div>
      <div style={timeStyle}>{timeRange}</div>
    </CardFrame>
  );
}

function lineStyle(color: string) {
  return {
    width: 84,
    height: 3,
    background: color,
    marginBottom: 36,
  };
}

const titleStyle = {
  fontSize: 56,
  fontWeight: 700,
  textAlign: 'center' as const,
};

const timeStyle = {
  color: '#94a3b8',
  fontSize: 24,
  marginTop: 20,
};
