// frontend/src/components/toolbar/Toolbar.tsx
import React from 'react';
import { Search, X, LayoutGrid, Box, Layers } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import styles from './Toolbar.module.css';

export const Toolbar: React.FC = () => {
  const searchQuery = usePackStore((s) => s.searchQuery);
  const setSearchQuery = usePackStore((s) => s.setSearchQuery);
  const statusFilter = usePackStore((s) => s.statusFilter);
  const setStatusFilter = usePackStore((s) => s.setStatusFilter);
  const activeView = usePackStore((s) => s.activeView);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const setSelectedFolderPath = usePackStore((s) => s.setSelectedFolderPath);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);

  const handleSelectView = (view: 'grid' | 'workspace' | 'entity') => {
    if (selectedFolderPath && selectedFolderPath.toLowerCase().endsWith('.json')) {
      setSelectedFolderPath(null);
    }
    setActiveView(view);
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.leftControls}>
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
        <div className={styles.viewModeGroup}>
          <button
            type="button"
            className={`${styles.viewModeButton} ${activeView === 'grid' ? styles.viewModeButtonActive : ''}`}
            onClick={() => handleSelectView('grid')}
            title="Pack Grid overview"
          >
            <LayoutGrid size={13} />
            <span>Pack Grid</span>
          </button>
          <button
            type="button"
            className={`${styles.viewModeButton} ${activeView === 'workspace' ? styles.viewModeButtonActive : ''}`}
            onClick={() => handleSelectView('workspace')}
            title="Block Workspace (4-Tier relational hierarchy)"
          >
            <Box size={13} />
            <span>Blocks</span>
          </button>
          <button
            type="button"
            className={`${styles.viewModeButton} ${activeView === 'entity' ? styles.viewModeButtonActive : ''}`}
            onClick={() => handleSelectView('entity')}
            title="Entity Workspace (3D model & slot inspector)"
          >
            <Layers size={13} />
            <span>Entities</span>
          </button>
        </div>
      </div>
    </div>
  );
};
