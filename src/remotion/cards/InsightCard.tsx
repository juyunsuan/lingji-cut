import type { CardStyle } from '../../types/ai';
import { CardEyebrow, CardFrame } from './CardFrame';

interface InsightCardProps {
  title: string;
  content: string;
  style: CardStyle;
}

export function InsightCard({ title, content, style }: InsightCardProps) {
  return (
    <CardFrame cardStyle={style}>
      <CardEyebrow accentColor={style.primaryColor} marginBottom={16}>
        INSIGHT
      </CardEyebrow>
      <div style={quoteStyle(style.primaryColor)}>"</div>
      <div style={bodyStyle}>{content}</div>
      <div style={authorStyle}>{title}</div>
    </CardFrame>
  );
}

function quoteStyle(color: string) {
  return {
    color,
    fontSize: 72,
    lineHeight: 0.8,
    marginBottom: 24,
  };
}

const bodyStyle = {
  maxWidth: 1_260,
  fontSize: 36,
  lineHeight: 1.8,
  textAlign: 'center' as const,
  fontStyle: 'italic' as const,
};

const authorStyle = {
  color: '#94a3b8',
  fontSize: 24,
  marginTop: 32,
};
