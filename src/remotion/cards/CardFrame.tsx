import type { CSSProperties, ReactNode } from 'react';
import type { CardStyle } from '../../types/ai';

interface CardFrameProps {
  cardStyle: CardStyle;
  children: ReactNode;
}

interface CardEyebrowProps {
  accentColor: string;
  children: ReactNode;
  marginBottom?: number;
}

export function CardFrame({ cardStyle, children }: CardFrameProps) {
  return <div style={frameStyle(cardStyle)}>{children}</div>;
}

export function CardEyebrow({
  accentColor,
  children,
  marginBottom = 24,
}: CardEyebrowProps) {
  return <div style={eyebrowStyle(accentColor, marginBottom)}>{children}</div>;
}

function frameStyle(cardStyle: CardStyle): CSSProperties {
  return {
    width: 1_920,
    height: 1_080,
    background: cardStyle.backgroundColor,
    color: '#e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 120,
    boxSizing: 'border-box',
  };
}

function eyebrowStyle(color: string, marginBottom: number): CSSProperties {
  return {
    color,
    fontSize: 20,
    letterSpacing: 6,
    marginBottom,
  };
}
