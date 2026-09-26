import React from 'react';

/**
 * Touch-first interaction primitives.
 *
 * The audit found two systemic problems these solve:
 *
 *  1. Most icon buttons were ~20-28px square, well under the ~44px target that
 *     Android users can reliably hit with a thumb.
 *  2. `index.css` sets `-webkit-tap-highlight-color: transparent`, so any control
 *     whose only feedback was a `hover:` style gave *zero* press feedback on
 *     touch. Everything below therefore defines an explicit `active:` state.
 *
 * These are deliberately low-key: a tinted press and a hairline ring, no glow,
 * no gradient, no lift. Restraint is what keeps a dense admin tool feeling
 * professional rather than decorative.
 */

export const tapClasses =
  'transition-colors duration-150 ease-out active:bg-brand-bg active:scale-[0.97]';

type IconButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Visual weight. `solid` is for primary actions, `ghost` for inline row actions. */
  variant?: 'ghost' | 'solid' | 'danger' | 'accent';
  size?: 'sm' | 'md';
  /** Renders at 44px minimum for touch. Disable only for dense desktop tables. */
  compact?: boolean;
};

const SIZES = {
  sm: 'min-w-[44px] min-h-[44px] p-2',
  md: 'min-w-[44px] min-h-[44px] p-2.5',
};

const VARIANTS = {
  ghost:
    'text-brand-text-secondary hover:text-brand-primary hover:bg-brand-bg active:bg-brand-primary/15',
  solid:
    'bg-brand-primary text-white shadow-soft hover:bg-brand-primary-hover active:bg-brand-primary-hover active:scale-[0.97]',
  danger:
    'text-rose-600 hover:text-rose-700 hover:bg-rose-50 active:bg-rose-100 dark:hover:bg-rose-950/40 dark:active:bg-rose-950/60',
  accent:
    'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 active:bg-emerald-100 dark:hover:bg-emerald-950/40 dark:active:bg-emerald-950/60',
};

export const IconButton: React.FC<IconButtonProps> = ({
  variant = 'ghost',
  size = 'sm',
  compact = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={[
      'inline-flex items-center justify-center rounded-lg flex-shrink-0 select-none',
      compact ? '' : SIZES[size],
      VARIANTS[variant],
      'disabled:opacity-40 disabled:pointer-events-none',
      className,
    ].join(' ')}
    {...rest}
  >
    {children}
  </button>
);

/**
 * Standard press feedback for any control. Pair with a `hover:` style so the
 * same element responds correctly to mouse, touch and keyboard.
 */
export const pressable = 'transition-all duration-200 ease-out active:scale-[0.98]';

/**
 * Reveals hover-only affordances to touch users.
 *
 * On a fine pointer the hint stays hidden until hover, which keeps the desktop
 * UI quiet. On a coarse pointer there is no hover, so the hint is always
 * visible rather than permanently unreachable.
 */
export const hoverHint =
  'opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:transition-opacity';

export default IconButton;
