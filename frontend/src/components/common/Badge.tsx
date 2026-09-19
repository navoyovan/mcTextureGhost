import React from 'react';
import styles from './Badge.module.css';

export type BadgeVariant =
  | 'ghost'
  | 'ok'
  | 'added'
  | 'fallback'
  | 'orphan'
  | 'override'
  | 'anim'
  | 'mers'
  | 'atlas'
  | 'category-block'
  | 'category-item'
  | 'category-entity'
  | 'category-attachable'
  | 'neutral'
  | 'mono'
  | 'counter'
  | 'dirty';

export type BadgeSize = 'sm' | 'normal' | 'lg' | 'counter';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  icon?: React.ReactNode;
  active?: boolean;
  title?: string;
  children?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  variant = 'neutral',
  size = 'normal',
  icon,
  active = false,
  title,
  children,
  className = '',
  ...rest
}) => {
  const variantClass = styles[`variant_${variant.replace('-', '_')}`] || styles.variant_neutral;
  const sizeClass = styles[`size_${size}`] || styles.size_normal;
  const activeClass = active ? styles.isActive : '';

  return (
    <span
      className={`${styles.badge} ${sizeClass} ${variantClass} ${activeClass} ${className}`.trim()}
      title={title}
      {...rest}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {children}
    </span>
  );
};

export default Badge;
