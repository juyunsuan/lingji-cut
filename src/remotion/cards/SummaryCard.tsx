import type { CardStyle } from '../../types/ai';
import { CardEyebrow, CardFrame } from './CardFrame';

interface SummaryCardProps {
  title: string;
  content: string;
  style: CardStyle;
}

export function SummaryCard({ title, content, style }: SummaryCardProps) {
  return (
    <CardFrame cardStyle={style}>
      <CardEyebrow accentColor={style.primaryColor}>SUMMARY</CardEyebrow>
      <div style={titleStyle(style.fontSize)}>{title}</div>
      <div style={bodyStyle}>{content}</div>
    </CardFrame>
  );
}

function titleStyle(fontSize: number) {
  return {
    fontSize,
    fontWeight: 700,
    marginBottom: 36,
    textAlign: 'center' as const,
  };
}

const bodyStyle = {
  maxWidth: 1_400,
  color: '#94a3b8',
  fontSize: 32,
  lineHeight: 1.8,
  textAlign: 'center' as const,
  whiteSpace: 'pre-wrap' as const,
};
