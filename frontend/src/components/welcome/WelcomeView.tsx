// frontend/src/components/welcome/WelcomeView.tsx
import React from 'react';
import {
  FolderOpen,
  FolderPlus,
  BookOpen,
  Clock,
  Package,
  ChevronRight,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { RecentPackItemDto } from '../../types/ipc';
import styles from './WelcomeView.module.css';

interface WelcomeViewProps {
  onOpenNewPackDialog?: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onOpenNewPackDialog }) => {
  const { openPackFolder, createPack } = useIpc();
  const recentPacks = usePackStore((s) => s.recentPacks);

  // Maximum 3 recent packs per PROJECT.md § Milestones & Interfaces
  const visibleRecentPacks = (recentPacks || []).slice(0, 3);

  const handleOpenExisting = () => {
    // null folderPath triggers native OpenFolderDialog in C# host
    openPackFolder(null);
  };

  const handleCreateNew = () => {
    if (onOpenNewPackDialog) {
      onOpenNewPackDialog();
    } else {
      // Direct IPC trigger if modal dialog handler is not mounted
      createPack('');
    }
  };

  const handleOpenRecent = (pack: RecentPackItemDto) => {
    if (pack.folderPath) {
      openPackFolder(pack.folderPath);
    }
  };

  const handleOpenTutorial = () => {
    window.open('https://learn.microsoft.com/en-us/minecraft/creator/documents/resourcepack', '_blank');
  };

  // Safe truncation for very long paths (> 260 characters)
  const formatPath = (fullPath: string): string => {
    if (!fullPath) return '';
    if (fullPath.length > 55) {
      return '...' + fullPath.slice(-52);
    }
    return fullPath;
  };

  return (
    <div className={styles.welcomeLayout} data-testid="welcome-view">
      {/* Main Content Hero */}
      <main className={styles.mainContent}>
        {/* Top Hero Bar */}
        <header className={styles.heroHeader}>
          <div className={styles.welcomeHeadingGroup}>
            <h1 className={styles.welcomeTitle}>Welcome</h1>
            <p className={styles.welcomeSubtitle}>
              Minecraft Bedrock Texture Ghost & Scaffolding Studio
            </p>
          </div>

          <button
            type="button"
            className={styles.tutorialButton}
            onClick={handleOpenTutorial}
            title="Open Minecraft Creator documentation"
          >
            <BookOpen className={styles.tutorialButtonIcon} />
            <span>Tutorial & Docs</span>
          </button>
        </header>

        {/* Primary Action Cards Grid */}
        <section className={styles.actionCardGrid} aria-label="Resource Pack Actions">
          {/* Card 1: Open existing pack */}
          <button
            type="button"
            className={styles.actionCard}
            onClick={handleOpenExisting}
            data-testid="open-pack-card"
          >
            <div className={styles.actionIconWrapper}>
              <FolderOpen className={styles.actionIcon} />
            </div>
            <div className={styles.actionCardContent}>
              <h2 className={styles.actionCardTitle}>Open Existing Resource Pack</h2>
              <p className={styles.actionCardDescription}>
                Browse for an existing Bedrock resource pack directory containing manifest.json.
              </p>
            </div>
            <ChevronRight className={styles.recentItemChevron} />
          </button>

          {/* Card 2: Create new pack */}
          <button
            type="button"
            className={styles.actionCard}
            onClick={handleCreateNew}
            data-testid="create-pack-card"
          >
            <div className={`${styles.actionIconWrapper} ${styles.actionIconWrapperCreate}`}>
              <FolderPlus className={styles.actionIcon} />
            </div>
            <div className={styles.actionCardContent}>
              <h2 className={styles.actionCardTitle}>Create New Resource Pack</h2>
              <p className={styles.actionCardDescription}>
                Initialize a fresh Bedrock resource pack scaffold with default directory hierarchy.
              </p>
            </div>
            <ChevronRight className={styles.recentItemChevron} />
          </button>
        </section>

        {/* Recent Packs History */}
        <section className={styles.recentSection} aria-label="Recent Resource Packs">
          <div className={styles.recentSectionHeader}>
            <Clock className={styles.recentSectionIcon} />
            <span>Recent Packs</span>
          </div>

          {visibleRecentPacks.length > 0 ? (
            <div className={styles.recentList} data-testid="recent-packs-list">
              {visibleRecentPacks.map((pack) => (
                <div
                  key={pack.folderPath}
                  className={styles.recentItemCard}
                  onClick={() => handleOpenRecent(pack)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenRecent(pack);
                    }
                  }}
                  title={pack.folderPath}
                >
                  <div className={styles.recentItemIcon}>
                    {pack.packIconUrl ? (
                      <img
                        src={pack.packIconUrl}
                        alt=""
                        className={styles.recentPackThumbnail}
                      />
                    ) : (
                      <Package className={styles.sidebarHeaderIcon} />
                    )}
                  </div>

                  <div className={styles.recentItemInfo}>
                    <div className={styles.recentItemNameRow}>
                      <span className={styles.recentItemName}>
                        {pack.packName || pack.displayFolder || 'Unnamed Pack'}
                      </span>
                      {pack.version && (
                        <span className={styles.recentItemVersion}>v{pack.version}</span>
                      )}
                    </div>
                    <span className={styles.recentItemPath}>
                      {formatPath(pack.folderPath)}
                    </span>
                  </div>

                  <div className={styles.recentItemMeta}>
                    <span className={styles.recentItemTime}>
                      {pack.relativeTime || 'recently'}
                    </span>
                    <ChevronRight className={styles.recentItemChevron} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.emptyRecentMessage} data-testid="recent-packs-empty">
              No recent packs opened yet
            </div>
          )}
        </section>
      </main>
    </div>
  );
};
