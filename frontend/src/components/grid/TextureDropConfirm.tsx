import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { RefreshCw, X, ArrowRight } from 'lucide-react';
import { TextureAliasDto } from '../../types/ipc';
import styles from './TextureDropConfirm.module.css';

export interface TextureDropConfirmProps {
  alias: TextureAliasDto;
  incomingObjectUrl?: string | null;
  incomingFileName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const TextureDropConfirm: React.FC<TextureDropConfirmProps> = ({
  alias,
  incomingObjectUrl,
  incomingFileName,
  onConfirm,
  onCancel,
}) => {
  // Extract clean current file name
  const currentFileName = alias.relativePath
    ? (alias.relativePath.split(/[/\\]/).pop() ?? alias.displayName ?? alias.alias)
    : (alias.displayName ?? alias.alias);

  // Keyboard shortcut listener (Escape = cancel, Enter = confirm)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        onConfirm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onConfirm, onCancel]);

  const modalContent = (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drop-confirm-title"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <h3 id="drop-confirm-title" className={styles.title}>
            <RefreshCw size={15} className={styles.titleIcon} />
            Replace Texture?
          </h3>
          <button
            type="button"
            className={styles.closeButton}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
            title="Cancel (Esc)"
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          <div className={styles.compareContainer}>
            {/* Current Texture */}
            <div className={styles.textureColumn}>
              <span className={styles.columnLabel}>Current</span>
              <div className={styles.thumbnailBox}>
                {alias.imageUrl ? (
                  <img
                    src={alias.imageUrl}
                    alt={currentFileName}
                    className={styles.thumbnailImg}
                  />
                ) : (
                  <span className={styles.placeholderGhost}>?</span>
                )}
              </div>
              <span className={styles.fileName} title={currentFileName}>
                {currentFileName}
              </span>
            </div>

            {/* Transition Arrow */}
            <div className={styles.arrowDivider}>
              <ArrowRight size={18} className={styles.arrowIcon} />
            </div>

            {/* Incoming Texture */}
            <div className={styles.textureColumn}>
              <span className={styles.columnLabel}>Incoming</span>
              <div className={styles.thumbnailBox}>
                {incomingObjectUrl ? (
                  <img
                    src={incomingObjectUrl}
                    alt={incomingFileName}
                    className={styles.thumbnailImg}
                  />
                ) : (
                  <span className={styles.thumbnailPlaceholder}>?</span>
                )}
              </div>
              <span className={styles.fileName} title={incomingFileName}>
                {incomingFileName}
              </span>
            </div>
          </div>

          <p className={styles.subText}>
            Overwriting will replace <span className={styles.targetPath}>{currentFileName}</span> on disk with the new file.
          </p>
        </div>

        {/* Footer Actions */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={(e) => {
              e.stopPropagation();
              onCancel();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.replaceBtn}
            onClick={(e) => {
              e.stopPropagation();
              onConfirm();
            }}
            autoFocus
          >
            <span>Replace</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </div>
  );

  return ReactDOM.createPortal(modalContent, document.body);
};
