import type { CardStyle } from '../../types/ai';
import { CardEyebrow, CardFrame } from './CardFrame';

interface QuoteCardProps {
  content: string;
  style: CardStyle;
}

export function QuoteCard({ content, style }: QuoteCardProps) {
  return (
    <CardFrame cardStyle={style}>
      <CardEyebrow accentColor={style.primaryColor} marginBottom={36}>
        HIGHLIGHT
      </CardEyebrow>
      <div
        style={{
          maxWidth: 1_320,
          fontSize: 52,
          fontWeight: 800,
          lineHeight: 1.5,
          textAlign: 'center',
          background: `linear-gradient(135deg, ${style.primaryColor}, #f472b6)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}
      >
        {content}
      </div>
    </CardFrame>
  );
}
