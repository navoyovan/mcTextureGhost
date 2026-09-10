// frontend/src/components/sidebar/Sidebar.tsx
import React, { useState, useEffect } from 'react';
import { RotateCw, X, Layers, AlertTriangle, BookOpen, FolderOpen } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes, ManifestModelDto } from '../../types/ipc';
import { DirectoryTree } from './DirectoryTree';
import styles from './Sidebar.module.css';

function formatPackPath(path: string | null): string {
  if (!path) return '';
  if (path.length <= 26) return path;
  return `${path.slice(0, 9)}...${path.slice(-14)}`;
}

export const Sidebar: React.FC = () => {
  const { reloadPack, postCommand } = useIpc();

  const packName = usePackStore((s) => s.packName);
  const packRoot = usePackStore((s) => s.packRoot);
  const hasManifest = usePackStore((s) => s.hasManifest);
  const hasPackIcon = usePackStore((s) => s.hasPackIcon);
  const packIconUrl = usePackStore((s) => s.packIconUrl);
  const stats = usePackStore((s) => s.stats);
  const packFolders = usePackStore((s) => s.packFolders);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const setSelectedFolderPath = usePackStore((s) => s.setSelectedFolderPath);
  const toggleCatalog = usePackStore((s) => s.toggleCatalog);
  const resetPackState = usePackStore((s) => s.resetPackState);
  const [iconLoadError, setIconLoadError] = useState<boolean>(false);

  useEffect(() => {
    setIconLoadError(false);
  }, [packIconUrl]);

  const handlePackIconClick = () => {
    if (!packRoot) return;
    const iconPath = `${packRoot}\\pack_icon.png`;
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: 'pack_icon',
      fullPath: iconPath,
      isGhost: !hasPackIcon,
    });
  };

  const handleGenerateManifest = () => {
    const defaultManifest: ManifestModelDto = {
      headerName: packName || 'Bedrock Resource Pack',
      headerDescription: 'Scaffolded by McTextureGhost',
      headerUuid: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'c3f0b26a-9f5e-4c7b-891d-123456789abc',
      versionMajor: 1,
      versionMinor: 0,
      versionPatch: 0,
      minEngineMajor: 1,
      minEngineMinor: 20,
      minEnginePatch: 0,
      moduleUuid: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'e4a1c57d-0a6f-4e8c-902e-abcdef123456',
      moduleType: 'resources',
      moduleVersionMajor: 1,
      moduleVersionMinor: 0,
      moduleVersionPatch: 0,
      formatVersion: 2,
      fileExists: true,
      filePath: packRoot ? `${packRoot}\\manifest.json` : null,
      versionString: '1.0.0',
      minEngineString: '1.20.0',
      version: [1, 0, 0],
      minEngineVersion: [1, 20, 0],
      moduleVersion: [1, 0, 0],
    };
    postCommand(IpcMessageTypes.ManifestSave, { manifest: defaultManifest });
  };

  const handleOpenInExplorer = () => {
    if (packRoot) {
      postCommand(IpcMessageTypes.OpenInExplorer, { targetPath: packRoot });
    }
  };

  const handleClosePack = () => {
    postCommand(IpcMessageTypes.PackClose, {});
    resetPackState();
  };

  const handleReload = () => {
    reloadPack();
  };

  const showIconImage = hasPackIcon && packIconUrl && !iconLoadError;

  return (
    <aside className={styles.sidebar} aria-label="Pack Explorer Sidebar">
      {/* 1. Active Pack Identity Card */}
      <div className={styles.packCard}>
        <div className={styles.packIdentityRow}>
          <button
            type="button"
            className={styles.packIconWrapper96}
            onClick={handlePackIconClick}
            title={hasPackIcon ? 'Open pack_icon.png in external editor' : 'Generate placeholder pack_icon.png'}
            aria-label="Pack Icon Artwork"
          >
            {showIconImage ? (
              <img
                src={packIconUrl}
                alt="Pack Icon"
                className={styles.packIconImg96}
                onError={() => setIconLoadError(true)}
              />
            ) : (
              <div className={styles.packIconPlaceholder}>
                <span className={styles.packIconPlaceholderGhost}>👻</span>
                <span className={styles.packIconPlaceholderText}>+ ICON</span>
              </div>
            )}
          </button>

          <div className={styles.packMeta}>
            <span className={styles.packTitle} title={packName || 'Resource Pack'}>
              {packName || 'Resource Pack'}
            </span>
            <span className={styles.packPath} title={packRoot || ''}>
              {formatPackPath(packRoot)}
            </span>

            {/* Retro Status Badge Pills */}
            <div className={styles.statusPillsRow}>
              <span className={styles.pillTotal} title="Total declared textures">
                {stats.totalCount || stats.total || 0} total
              </span>
              <span className={styles.pillOk} title="Textures with valid artwork on disk">
                {stats.okCount || stats.done || 0} done
              </span>
              <span className={styles.pillGhost} title="Missing texture artwork (Ghosts)">
                👻 {stats.ghostCount || stats.ghosts || 0}
              </span>
              <span className={styles.pillOrphan} title="Unlinked/orphan textures">
                ◈ {stats.orphanCount || stats.orphans || 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Missing Manifest Quick-Warning Card */}
      {!hasManifest && Boolean(packRoot) && (
        <div className={styles.manifestWarningCard} role="alert">
          <div className={styles.manifestWarningHeader}>
            <AlertTriangle className={styles.warningIcon} size={15} />
            <span className={styles.warningTitle}>Missing manifest.json</span>
          </div>
          <p className={styles.warningDesc}>
            manifest.json not found. Bedrock cannot load this pack without a valid manifest.
          </p>
          <button
            type="button"
            className={styles.generateManifestBtn}
            onClick={handleGenerateManifest}
          >
            ⚡ Generate Manifest
          </button>
        </div>
      )}

      {/* 3. Directory Explorer Tree Section */}
      <div className={styles.folderSection}>
        <div className={styles.folderSectionHeader}>
          <Layers size={12} />
          <span>Directories</span>
        </div>
        <div className={styles.folderTreeContainer}>
          <DirectoryTree
            folders={packFolders}
            selectedPath={selectedFolderPath}
            onSelect={setSelectedFolderPath}
          />
        </div>
      </div>

      {/* 4. Action Dock at Bottom of Sidebar */}
      <div className={styles.actionDock}>
        <button
          type="button"
          className={styles.exploreCatalogCard}
          onClick={toggleCatalog}
          title="Open Vanilla Bedrock Reference Catalog"
        >
          <div className={styles.catalogCardIconWrapper}>
            <BookOpen size={16} />
          </div>
          <div className={styles.catalogCardMeta}>
            <span className={styles.catalogCardTitle}>Explore Catalog</span>
            <span className={styles.catalogCardSubtitle}>Browse vanilla Bedrock textures</span>
          </div>
        </button>

        <div className={styles.quickActionsRow}>
          <button
            type="button"
            className={styles.quickBtn}
            onClick={handleOpenInExplorer}
            title="Open pack folder in Windows File Explorer"
          >
            <FolderOpen size={13} />
            <span>Folder</span>
          </button>
          <button
            type="button"
            className={styles.quickBtn}
            onClick={handleReload}
            title="Rescan and refresh pack files"
          >
            <RotateCw size={13} />
            <span>Reload</span>
          </button>
          <button
            type="button"
            className={`${styles.quickBtn} ${styles.quickBtnClose}`}
            onClick={handleClosePack}
            title="Close pack and return to welcome screen"
          >
            <X size={13} />
          </button>
        </div>
      </div>
    </aside>
  );
};
