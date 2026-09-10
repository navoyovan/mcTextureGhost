// frontend/src/components/toolbar/Toolbar.tsx
import React from 'react';
import { Search, X, LayoutGrid, Box, ZoomIn } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import styles from './Toolbar.module.css';

const ZOOM_PRESETS = [
  { label: 'SM', value: 80 },
  { label: 'MD', value: 120 },
  { label: 'LG', value: 160 },
  { label: 'XL', value: 200 },
] as const;

export const Toolbar: React.FC = () => {
  const activeTab = usePackStore((s) => s.activeTab);
  const setActiveTab = usePackStore((s) => s.setActiveTab);
  const searchQuery = usePackStore((s) => s.searchQuery);
  const setSearchQuery = usePackStore((s) => s.setSearchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const setStatusFilter = usePackStore((s) => s.setStatusFilter);
  const activeView = usePackStore((s) => s.activeView);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const stats = usePackStore((s) => s.stats);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);
  const setSelectedFolderPath = usePackStore((s) => s.setSelectedFolderPath);
  const tileZoom = usePackStore((s) => s.tileZoom);
  const setTileZoom = usePackStore((s) => s.setTileZoom);

  return (
    <div className={styles.toolbar}>
      <div className={styles.leftControls}>
        {/* Category Tabs: All / Blocks / Items */}
        <div className={styles.categoryGroup} role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'all'}
            className={`${styles.categoryTab} ${activeTab === 'all' ? styles.categoryTabActive : ''}`}
            onClick={() => setActiveTab('all')}
          >
            <span>All</span>
            {(stats.ghostCount || stats.ghosts) > 0 && (
              <span className={styles.ghostBadge}>👻 {stats.ghostCount || stats.ghosts}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'blocks'}
            className={`${styles.categoryTab} ${activeTab === 'blocks' ? styles.categoryTabActive : ''}`}
            onClick={() => setActiveTab('blocks')}
          >
            <span>🧱 Blocks</span>
            {(stats.blocksGhostCount || 0) > 0 && (
              <span className={styles.ghostBadge}>👻 {stats.blocksGhostCount}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'items'}
            className={`${styles.categoryTab} ${activeTab === 'items' ? styles.categoryTabActive : ''}`}
            onClick={() => setActiveTab('items')}
          >
            <span>🗡 Items</span>
            {(stats.itemsGhostCount || 0) > 0 && (
              <span className={styles.ghostBadge}>👻 {stats.itemsGhostCount}</span>
            )}
          </button>
        </div>

        {/* Active Folder Filter Breadcrumbs */}
        {selectedFolderPath && (
          <div className={styles.breadcrumbBar} role="navigation" aria-label="Folder filter breadcrumbs">
            <button
              type="button"
              className={styles.breadcrumbRootBtn}
              onClick={() => setSelectedFolderPath(null)}
              title="Return to entire pack"
            >
              Pack
            </button>
            {selectedFolderPath.split(/[\\/]/).filter(Boolean).map((segment, idx, arr) => {
              const isLast = idx === arr.length - 1;
              const subPath = arr.slice(0, idx + 1).join('/');
              return (
                <React.Fragment key={subPath}>
                  <span className={styles.breadcrumbSeparator}>/</span>
                  {isLast ? (
                    <span className={styles.breadcrumbCurrent}>{segment}</span>
                  ) : (
                    <button
                      type="button"
                      className={styles.breadcrumbBtn}
                      onClick={() => setSelectedFolderPath(subPath)}
                      title={`Filter to ${subPath}`}
                    >
                      {segment}
                    </button>
                  )}
                </React.Fragment>
              );
            })}
            <button
              type="button"
              className={styles.breadcrumbClearBtn}
              onClick={() => setSelectedFolderPath(null)}
              title="Clear folder filter"
              aria-label="Clear folder filter"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Search Input */}
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search textures..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.searchClear}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {/* Status Dropdown */}
        <select
          className={styles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          aria-label="Filter textures by status"
        >
          <option value="all">All Statuses</option>
          <option value="ghosts">👻 Ghosts Only</option>
          <option value="added">✅ Added Only</option>
          <option value="orphans">◈ Orphans Only</option>
        </select>
      </div>

      {/* Right Controls: Zoom + View Mode */}
      <div className={styles.rightControls}>
        {/* Zoom Controls */}
        <div className={styles.zoomGroup}>
          <ZoomIn size={13} className={styles.zoomIcon} />
          <div className={styles.zoomPresets} role="group" aria-label="Tile zoom presets">
            {ZOOM_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`${styles.zoomPresetBtn} ${tileZoom === preset.value ? styles.zoomPresetBtnActive : ''}`}
                onClick={() => setTileZoom(preset.value)}
                title={`${preset.label} tiles (${preset.value}px)`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            className={styles.zoomSlider}
            min={80}
            max={200}
            step={8}
            value={tileZoom}
            onChange={(e) => setTileZoom(Number(e.target.value))}
            aria-label="Tile size zoom"
            title={`Tile size: ${tileZoom}px`}
          />
        </div>

        <div className={styles.viewModeGroup}>
          <button
            type="button"
            className={`${styles.viewModeButton} ${activeView === 'grid' ? styles.viewModeButtonActive : ''}`}
            onClick={() => setActiveView('grid')}
            title="Pack Grid overview"
          >
            <LayoutGrid size={13} />
            <span>Pack Grid</span>
          </button>
          <button
            type="button"
            className={`${styles.viewModeButton} ${activeView === 'workspace' ? styles.viewModeButtonActive : ''}`}
            onClick={() => setActiveView('workspace')}
            title="Block Workspace (4-Tier relational hierarchy)"
          >
            <Box size={13} />
            <span>Block Workspace</span>
          </button>
        </div>
      </div>
    </div>
  );
};
