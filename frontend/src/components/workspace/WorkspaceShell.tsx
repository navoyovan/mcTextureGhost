// frontend/src/components/workspace/WorkspaceShell.tsx
import React from 'react';
import { Box, ChevronDown } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import styles from './WorkspaceShell.module.css';

export interface WorkspaceShellProps {
  listAriaLabel: string;
  listHeader: React.ReactNode;
  sidebarContent: React.ReactNode;
  hasSelection: boolean;
  emptySelectionText?: string;
  detailAriaLabel?: string;
  title?: React.ReactNode;
  titleBadge?: React.ReactNode;
  subtitle?: React.ReactNode;
  headerActions?: React.ReactNode;
  show3DPreview?: boolean;
  previewTitle?: string;
  previewContent?: React.ReactNode;
  children?: React.ReactNode;
}

export const WorkspaceShell: React.FC<WorkspaceShellProps> = ({
  listAriaLabel,
  listHeader,
  sidebarContent,
  hasSelection,
  emptySelectionText = 'Select an item to inspect',
  detailAriaLabel = 'Detail Pane',
  title,
  titleBadge,
  subtitle,
  headerActions,
  show3DPreview = false,
  previewTitle = '3D Preview',
  previewContent,
  children,
}) => {
  const isListDrawerOpen = usePackStore((s) => s.isWorkspaceDrawerOpen);
  const setIsListDrawerOpen = usePackStore((s) => s.setIsWorkspaceDrawerOpen);
  const disable3DView = usePackStore((s) => s.disable3DView);
  const setDisable3DView = usePackStore((s) => s.setDisable3DView);

  return (
    <div className={styles.workspaceContainer}>
      {/* Backdrop for compact viewports */}
      {isListDrawerOpen && (
        <div
          className={styles.blockListBackdrop}
          onClick={() => setIsListDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left List */}
      <aside
        className={`${styles.blockListPane} ${isListDrawerOpen ? styles.blockListPaneOpen : ''}`}
        aria-label={listAriaLabel}
      >
        <div className={styles.blockListHeader}>{listHeader}</div>
        {sidebarContent}
      </aside>

      {/* Right Detail Pane */}
      {hasSelection ? (
        <section className={styles.detailPane} aria-label={detailAriaLabel}>
          <div className={styles.detailHeader}>
            <div className={styles.blockTitleGroup}>
              <div className={styles.blockHeaderTitleRow}>
                <h2 className={styles.blockDisplayName}>{title}</h2>
                {titleBadge}
              </div>
              {subtitle && <span className={styles.blockIdSub}>{subtitle}</span>}
            </div>
            {headerActions && <div className={styles.detailHeaderActions}>{headerActions}</div>}
          </div>

          {/* 3D Preview Collapsible Card */}
          {show3DPreview && previewContent && (
            <div
              className={`${styles.previewTreeContainer} ${disable3DView ? styles.previewTreeContainerCollapsed : ''}`}
            >
              <div
                className={styles.previewTreeHeader}
                onClick={() => setDisable3DView(!disable3DView)}
                title={disable3DView ? 'Click to expand 3D preview' : 'Click to minimize 3D preview'}
              >
                <div className={styles.previewTreeHeaderLeft}>
                  <Box size={13} style={{ color: '#8CEB1F' }} />
                  <span className={styles.previewTreeHeaderTitle}>{previewTitle}</span>
                </div>
                <div className={styles.previewTreeHeaderActions}>
                  <button
                    type="button"
                    className={styles.previewTreeToggleBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDisable3DView(!disable3DView);
                    }}
                    title={disable3DView ? 'Expand 3D preview panel' : 'Minimize 3D preview panel'}
                  >
                    <ChevronDown
                      size={12}
                      className={`${styles.previewTreeToggleChevron} ${!disable3DView ? styles.previewTreeToggleChevronExpanded : ''}`}
                    />
                    <span>{disable3DView ? 'Expand' : 'Minimize'}</span>
                  </button>
                </div>
              </div>

              <div
                className={`${styles.previewTreeContentWrapper} ${disable3DView ? styles.previewTreeContentWrapperCollapsed : ''}`}
              >
                <div className={styles.previewTreeContentInner}>{previewContent}</div>
              </div>
            </div>
          )}

          {children}
        </section>
      ) : (
        <div className={styles.emptySelection}>{emptySelectionText}</div>
      )}
    </div>
  );
};
