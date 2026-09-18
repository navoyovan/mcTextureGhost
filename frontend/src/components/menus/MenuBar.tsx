// frontend/src/components/menus/MenuBar.tsx
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FolderOpen,
  RotateCw,
  PlusSquare,
  FileText,
  ExternalLink,
  XCircle,
  Terminal,
  Radio,
  ChevronDown,
  Square,
  CheckSquare,
  Info,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { usePackStore, rawPackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { AboutModal } from '../common/AboutModal';
import styles from './MenuBar.module.css';

interface MenuItemDef {
  label: string;
  icon: React.ReactNode;
  action: () => void;
  hasDivider?: boolean;
  disabled?: boolean;
}

interface MenuDef {
  label: string;
  items: MenuItemDef[];
}

interface OpenMenuState {
  label: string;
  /** px from left edge of viewport */
  x: number;
  /** px from top edge of viewport */
  y: number;
}

export const MenuBar: React.FC = () => {
  const [openMenu, setOpenMenu] = useState<OpenMenuState | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  const { postCommand, openPackFolder, reloadPack, createPack, openInExplorer, closePack } = useIpc();
  const packRoot = usePackStore((s) => s.packRoot);
  const resetPackState = usePackStore((s) => s.resetPackState);
  const setSelectedFolderPath = usePackStore((s) => s.setSelectedFolderPath);
  const activeTab = usePackStore((s) => s.activeTab);
  const setActiveTab = usePackStore((s) => s.setActiveTab);
  const stats = usePackStore((s) => s.stats);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const setTileZoom = usePackStore((s) => s.setTileZoom);
  const simulateNoAssets = usePackStore((s) => s.simulateNoAssets);
  const setSimulateNoAssets = usePackStore((s) => s.setSimulateNoAssets);

  const isPackLoaded = Boolean(packRoot);
  const zoomPresets = [
    { label: 'SM', value: 80 },
    { label: 'MD', value: 120 },
    { label: 'LG', value: 160 },
    { label: 'XL', value: 200 },
  ] as const;

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [openMenu]);

  const handleTriggerClick = useCallback(
    (menuLabel: string, e: React.MouseEvent<HTMLButtonElement>) => {
      if (openMenu?.label === menuLabel) {
        setOpenMenu(null);
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      setOpenMenu({ label: menuLabel, x: rect.left, y: rect.bottom + 4 });
    },
    [openMenu]
  );

  const runItem = useCallback((action: () => void) => {
    setOpenMenu(null);
    action();
  }, []);

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        {
          label: 'Open Folder\u2026',
          icon: <FolderOpen size={13} />,
          action: () => openPackFolder(),
        },
        {
          label: 'Reload Pack',
          icon: <RotateCw size={13} />,
          action: () => {
            usePackStore.getState().setScanProgress({
              stage: 'scan_start',
              current: 1,
              total: 5,
              message: 'Reloading pack textures...',
            });
            reloadPack();
          },
          disabled: !isPackLoaded,
        },
        {
          label: 'New Pack Wizard\u2026',
          icon: <PlusSquare size={13} />,
          action: () => createPack('', null),
          hasDivider: true,
        },
        {
          label: 'Edit Manifest\u2026',
          icon: <FileText size={13} />,
          action: () => setSelectedFolderPath('manifest.json'),
          disabled: !isPackLoaded,
        },
        {
          label: 'Open in File Explorer',
          icon: <ExternalLink size={13} />,
          action: () => openInExplorer(packRoot),
          disabled: !isPackLoaded,
          hasDivider: true,
        },
        {
          label: 'Close Pack',
          icon: <XCircle size={13} />,
          action: () => {
            closePack();
            resetPackState();
            window.location.reload();
          },
          disabled: !isPackLoaded,
        },
      ],
    },
    {
      label: 'Dev',
      items: [
        {
          label: 'Simulate no download',
          icon: simulateNoAssets ? (
            <CheckSquare size={13} style={{ color: 'var(--accent-primary, #8CEB1F)' }} />
          ) : (
            <Square size={13} />
          ),
          action: () => setSimulateNoAssets(!simulateNoAssets),
          hasDivider: true,
        },
        {
          label: 'Open DevTools',
          icon: <Terminal size={13} />,
          action: () => postCommand('DEVTOOLS:OPEN', {}),
        },
        {
          label: 'Inspect IPC State',
          icon: <Radio size={13} />,
          action: () => {
            // eslint-disable-next-line no-console
            console.group('[McTextureGhost] IPC State Snapshot');
            // eslint-disable-next-line no-console
            console.log(rawPackStore.getState());
            // eslint-disable-next-line no-console
            console.groupEnd();
          },
        },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'About McTextureGhost',
          icon: <Info size={13} />,
          action: () => setIsAboutOpen(true),
        },
      ],
    },
  ];

  return (
    <nav className={styles.menuBar} ref={barRef} aria-label="Application menus">
      {/* File & Dev menus */}
      {menus.filter((m) => m.label !== 'Help').map((menu) => {
        const isOpen = openMenu?.label === menu.label;
        return (
          <div key={menu.label} className={styles.menuRoot}>
            <button
              type="button"
              className={`${styles.menuTrigger} ${isOpen ? styles.menuTriggerOpen : ''}`}
              onClick={(e) => handleTriggerClick(menu.label, e)}
              aria-haspopup="menu"
              aria-expanded={isOpen}
            >
              {menu.label}
              <ChevronDown
                size={10}
                className={`${styles.menuChevron} ${isOpen ? styles.menuChevronOpen : ''}`}
              />
            </button>
          </div>
        );
      })}

      {/* BETA button */}
      <div className={styles.menuRoot}>
        <button
          type="button"
          className={`${styles.menuTrigger} ${openMenu?.label === 'Beta' ? styles.menuTriggerOpen : ''}`}
          onClick={(e) => handleTriggerClick('Beta', e)}
          aria-haspopup="menu"
          aria-expanded={openMenu?.label === 'Beta'}
        >
          BETA
          <ChevronDown size={10} className={styles.menuChevron} />
        </button>
      </div>

      {/* Help menu placed after BETA */}
      <div className={styles.menuRoot}>
        <button
          type="button"
          className={`${styles.menuTrigger} ${openMenu?.label === 'Help' ? styles.menuTriggerOpen : ''}`}
          onClick={(e) => handleTriggerClick('Help', e)}
          aria-haspopup="menu"
          aria-expanded={openMenu?.label === 'Help'}
        >
          Help
          <ChevronDown
            size={10}
            className={`${styles.menuChevron} ${openMenu?.label === 'Help' ? styles.menuChevronOpen : ''}`}
          />
        </button>
      </div>

      {/* Portal-rendered dropdown to escape overflow:hidden parents */}
      {openMenu &&
        createPortal(
          <div
            className={styles.dropdownPortalBackdrop}
            onMouseDown={() => setOpenMenu(null)}
          >
            <div
              className={styles.dropdown}
              role="menu"
              aria-label={`${openMenu.label} menu`}
              style={{ left: openMenu.x, top: openMenu.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {openMenu.label === 'Beta' ? (
                <div className={styles.betaPanel}>
                  <div className={styles.betaSection}>
                    <span className={styles.betaSectionLabel}>Textures</span>
                    <div className={styles.betaCategoryGroup} role="group" aria-label="Texture category">
                      {(
                        [
                          { id: 'all', label: 'All', ghostCount: 0 },
                          { id: 'blocks', label: 'Blocks', ghostCount: stats.blocksGhostCount },
                          { id: 'items', label: 'Items', ghostCount: stats.itemsGhostCount },
                          { id: 'entities', label: 'Entities', ghostCount: stats.entitiesGhostCount },
                        ] as const
                      ).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`${styles.betaButton} ${activeTab === item.id ? styles.betaButtonActive : ''}`}
                          onClick={() => runItem(() => setActiveTab(item.id))}
                        >
                          <span>{item.label}</span>
                          {item.ghostCount > 0 && (
                            <span className={styles.betaGhostBadge}>{item.ghostCount}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className={styles.betaSection}>
                    <div className={styles.betaSectionHeader}>
                      <span className={styles.betaSectionLabel}>Zoom level</span>
                      <span className={styles.betaZoomValue}>{tileZoom}px</span>
                    </div>
                    <div className={styles.betaZoomControls}>
                      {zoomPresets.map((preset) => (
                        <button
                          key={preset.label}
                          type="button"
                          className={`${styles.betaZoomButton} ${tileZoom === preset.value ? styles.betaButtonActive : ''}`}
                          onClick={() => runItem(() => setTileZoom(preset.value))}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                    <input
                      type="range"
                      className={styles.betaSlider}
                      min={80}
                      max={200}
                      step={8}
                      value={tileZoom}
                      onChange={(e) => setTileZoom(Number(e.target.value))}
                      aria-label="Tile size zoom"
                    />
                  </div>
                </div>
              ) : menus
                .find((m) => m.label === openMenu.label)
                ?.items.map((item, idx) => (
                  <React.Fragment key={idx}>
                    <button
                      type="button"
                      className={`${styles.menuItem} ${item.disabled ? styles.menuItemDisabled : ''}`}
                      role="menuitem"
                      onClick={() => !item.disabled && runItem(item.action)}
                      aria-disabled={item.disabled}
                    >
                      <span className={styles.menuItemIcon}>{item.icon}</span>
                      <span className={styles.menuItemLabel}>{item.label}</span>
                    </button>
                    {item.hasDivider && <div className={styles.menuDivider} />}
                  </React.Fragment>
                ))}
            </div>
          </div>,
          document.body
        )}

      {/* About & Licenses Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </nav>
  );
};
