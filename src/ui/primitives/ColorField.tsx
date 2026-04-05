import { useId } from 'react';
import styles from './ColorField.module.css';

export interface ColorFieldProps {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function ColorField({ label, value, onChange, disabled = false }: ColorFieldProps) {
  const fieldId = useId();

  return (
    <div className={styles.root}>
      {label ? (
        <label htmlFor={fieldId} className={styles.label}>
          {label}
        </label>
      ) : null}
      <div className={styles.swatch} style={{ background: value }}>
        <input
          id={fieldId}
          type="color"
          className={styles.input}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      </div>
    </div>
  );
}
