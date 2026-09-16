// frontend/src/components/common/SearchInput.tsx
import React, { forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react';
import { Search, X } from 'lucide-react';
import styles from './SearchInput.module.css';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'size'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
  placeholder?: string;
  /** Shortcut key label to display in the cue badge (default: '/') */
  shortcutCue?: string | null;
  /** Whether pressing '/' globally focuses this search input (default: true) */
  enableSlashShortcut?: boolean;
  /** Size preset for the search bar (default: 'md') */
  size?: 'sm' | 'md' | 'lg';
  wrapperClassName?: string;
  inputClassName?: string;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      value,
      onChange,
      onClear,
      placeholder = 'Search...',
      shortcutCue = '/',
      enableSlashShortcut = true,
      size = 'md',
      wrapperClassName = '',
      inputClassName = '',
      autoFocus = false,
      disabled = false,
      className = '',
      onFocus,
      onBlur,
      onKeyDown,
      ...rest
    },
    ref
  ) => {
    const inputRef = useRef<HTMLInputElement | null>(null);
    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    const [isFocused, setIsFocused] = useState(false);

    // Global '/' keyboard shortcut to focus search
    useEffect(() => {
      if (!enableSlashShortcut || disabled) return;

      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key !== '/') return;

        // Do not intercept if user is already typing in an input / textarea / editable element
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
        ) {
          return;
        }

        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      };

      window.addEventListener('keydown', handleGlobalKeyDown);
      return () => window.removeEventListener('keydown', handleGlobalKeyDown);
    }, [enableSlashShortcut, disabled]);

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange('');
      onClear?.();
      inputRef.current?.focus();
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        if (value) {
          e.stopPropagation();
          onChange('');
          onClear?.();
        } else {
          inputRef.current?.blur();
        }
      }
      onKeyDown?.(e);
    };

    const showCue = Boolean(shortcutCue && !isFocused && !value);

    const sizeClass =
      size === 'sm'
        ? styles.sizeSm
        : size === 'lg'
        ? styles.sizeLg
        : styles.sizeMd;

    return (
      <div
        className={`${styles.searchWrapper} ${sizeClass} ${isFocused ? styles.searchWrapperFocused : ''} ${
          disabled ? styles.searchWrapperDisabled : ''
        } ${wrapperClassName} ${className}`}
        onClick={() => inputRef.current?.focus()}
      >
        <Search
          size={size === 'sm' ? 12 : size === 'lg' ? 15 : 13.5}
          className={styles.searchIcon}
          aria-hidden="true"
        />

        <input
          ref={inputRef}
          type="text"
          className={`${styles.searchInput} ${inputClassName}`}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          onKeyDown={handleInputKeyDown}
          {...rest}
        />

        {value && !disabled ? (
          <button
            type="button"
            className={styles.clearBtn}
            onClick={handleClear}
            title="Clear search (Esc)"
            aria-label="Clear search"
            tabIndex={-1}
          >
            <X size={size === 'sm' ? 11 : 12.5} />
          </button>
        ) : showCue ? (
          <kbd className={styles.kbdCue} title={`Press '${shortcutCue}' to focus search`}>
            {shortcutCue}
          </kbd>
        ) : null}
      </div>
    );
  }
);

SearchInput.displayName = 'SearchInput';
