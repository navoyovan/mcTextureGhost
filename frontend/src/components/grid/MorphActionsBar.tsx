// frontend/src/components/grid/MorphActionsBar.tsx
import React from 'react';
import { Plus, Edit3, Layers, MoreVertical } from 'lucide-react';
import styles from './TileHoverMorphPortal.module.css';

export interface MorphActionsBarProps {
  isGhost: boolean;
  isInstalled: boolean;
  isMorphingToAdded: boolean;
  hasMers: boolean;
  mersUrl: string | null;
  isPeekingMers: boolean;
  setIsPeekingMers: (peeking: boolean) => void;
  onExtractReference: (e: React.MouseEvent) => void;
  onCreateStub: (e: React.MouseEvent) => void;
  onEditClick: (e: React.MouseEvent) => void;
  onOpenContextMenuClick: (e: React.MouseEvent) => void;
}

export const MorphActionsBar: React.FC<MorphActionsBarProps> = ({
  isGhost,
  isInstalled,
  isMorphingToAdded,
  hasMers,
  mersUrl,
  isPeekingMers,
  setIsPeekingMers,
  onExtractReference,
  onCreateStub,
  onEditClick,
  onOpenContextMenuClick,
}) => {
  return (
    <div className={styles.actionsBar}>
      {isGhost ? (
        <div className={styles.ghostActionsGroup}>
          {isInstalled ? (
            <>
              <button
                type="button"
                className={styles.primaryActionBtn}
                onClick={onExtractReference}
                title="Add authentic vanilla texture to pack"
              >
                <Plus size={13} />
                <span>ADD</span>
              </button>

              <button
                type="button"
                className={styles.stubSquareBtn}
                onClick={onCreateStub}
                title="Create stub PNG file"
                aria-label="Create stub PNG"
              >
                <svg
                  viewBox="0 0 16 16"
                  className={styles.stubSvgFull}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <rect x="0" y="0" width="8" height="8" fill="#000000" />
                  <rect x="8" y="0" width="8" height="8" fill="var(--accent-primary, #8CEB1F)" />
                  <rect x="0" y="8" width="8" height="8" fill="var(--accent-primary, #8CEB1F)" />
                  <rect x="8" y="8" width="8" height="8" fill="#000000" />
                </svg>
              </button>
            </>
          ) : (
            <button
              type="button"
              className={styles.primaryActionBtn}
              onClick={onCreateStub}
              title="Create stub PNG texture file"
            >
              <Plus size={13} />
              <span>CREATE STUB</span>
            </button>
          )}
        </div>
      ) : isMorphingToAdded ? (
        <div className={styles.ghostActionsGroup}>
          <button
            type="button"
            className={`${styles.primaryActionBtn} ${styles.editBtnMorphExpand}`}
            onClick={onEditClick}
            title="Edit texture in default editor"
          >
            <Edit3 size={13} />
            <span>Edit</span>
          </button>

          <button
            type="button"
            className={`${styles.stubSquareBtn} ${styles.stubSquareBtnExiting}`}
            aria-hidden="true"
            tabIndex={-1}
          >
            <svg
              viewBox="0 0 16 16"
              className={styles.stubSvgFull}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect x="0" y="0" width="8" height="8" fill="#000000" />
              <rect x="8" y="0" width="8" height="8" fill="var(--accent-primary, #8CEB1F)" />
              <rect x="0" y="8" width="8" height="8" fill="var(--accent-primary, #8CEB1F)" />
              <rect x="8" y="8" width="8" height="8" fill="#000000" />
            </svg>
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`${styles.primaryActionBtn} ${styles.editBtnAnimIn}`}
          onClick={onEditClick}
          title="Edit texture in default editor"
        >
          <Edit3 size={13} />
          <span>Edit</span>
        </button>
      )}

      {/* Hold to Peek MERS PBR Map Button */}
      {!isGhost && hasMers && mersUrl && (
        <button
          type="button"
          className={`${styles.mersHoldBtn} ${isPeekingMers ? styles.mersHoldBtnActive : ''}`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsPeekingMers(true);
          }}
          onPointerUp={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsPeekingMers(false);
          }}
          onPointerLeave={() => setIsPeekingMers(false)}
          onPointerCancel={() => setIsPeekingMers(false)}
          title="Hold to peek companion MERS PBR map"
          aria-label="Hold to peek companion MERS PBR map"
        >
          <Layers size={13} />
          <span>MERS</span>
        </button>
      )}

      <button
        type="button"
        className={styles.iconActionBtn}
        onClick={onOpenContextMenuClick}
        title="Texture options"
        aria-label="Texture options"
      >
        <MoreVertical size={14} />
      </button>
    </div>
  );
};
