import React, { useState, useRef, useEffect } from 'react';
import {
  LayoutGrid,
  Box,
  Filter,
  ChevronDown,
  Check,
  Ghost,
  PawPrint,
  Sparkles,
  Film,
  Shuffle,
  Boxes,
  AlertCircle,
  Sword,
  FileCode2,
  Compass,
  PanelLeft,
  PanelLeftOpen,
} from 'lucide-react';
import { usePackStore, TextureFilterKey } from '../../store/packStore';
import { SearchInput } from '../common/SearchInput';
import styles from './Toolbar.module.css';

interface FilterOption {
  key: TextureFilterKey;
  label: string;
  category: 'status' | 'feature';
  icon: React.ReactNode;
}

const FILTER_OPTIONS: FilterOption[] = [
  // Status group
  { key: 'ghosts', label: 'Ghosts Only', category: 'status', icon: <Ghost size={12} /> },
  { key: 'orphans', label: 'Orphans Only', category: 'status', icon: <AlertCircle size={12} /> },
  { key: 'added', label: 'Added Only', category: 'status', icon: <Check size={12} /> },
  // Feature group
  { key: 'mers', label: 'MERS (PBR / RTX)', category: 'feature', icon: <Sparkles size={12} /> },
  { key: 'atlas', label: 'Atlas (Item)', category: 'feature', icon: <Compass size={12} /> },
  { key: 'flipbook', label: 'Flipbook (Anim)', category: 'feature', icon: <Film size={12} /> },
  { key: 'variations', label: 'Texture Variations', category: 'feature', icon: <Shuffle size={12} /> },
  { key: 'blockstates', label: 'Blockstates', category: 'feature', icon: <Boxes size={12} /> },
];

export const Toolbar: React.FC = () => {
  const searchQuery = usePackStore((s) => s.searchQuery);
  const setSearchQuery = usePackStore((s) => s.setSearchQuery);
  const activeTab = usePackStore((s) => s.activeTab);
  const setActiveTab = usePackStore((s) => s.setActiveTab);
  const stats = usePackStore((s) => s.stats);
  const activeFilters = usePackStore((s) => s.activeFilters);
  const toggleFilter = usePackStore((s) => s.toggleFilter);
  const clearFilters = usePackStore((s) => s.clearFilters);
  const activeView = usePackStore((s) => s.activeView);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const setSelectedFolderPath = usePackStore((s) => s.setSelectedFolderPath);
  const selectedFolderPath = usePackStore((s) => s.selectedFolderPath);

  const isJsonFileSelected = Boolean(
    selectedFolderPath && /\.(json|material)$/i.test(selectedFolderPath)
  );

  const jsonFileName = isJsonFileSelected
    ? (selectedFolderPath!.replace(/\\/g, '/').split('/').pop() || selectedFolderPath!)
    : null;

  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsFilterOpen(false);
      }
    };

    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFilterOpen]);

  useEffect(() => {
    if (isJsonFileSelected) setIsFilterOpen(false);
  }, [isJsonFileSelected]);

  const handleSelectView = (view: 'grid' | 'workspace' | 'entity') => {
    if (isJsonFileSelected) {
      setSelectedFolderPath(null);
    }
    setActiveView(view);
  };

  const isSidebarCollapsed = usePackStore((s) => s.isSidebarCollapsed);
  const toggleSidebar = usePackStore((s) => s.toggleSidebar);
  const isManifestJsonDrawerOpen = usePackStore((s) => s.isManifestJsonDrawerOpen);
  const toggleManifestJsonDrawer = usePackStore((s) => s.toggleManifestJsonDrawer);
  const isWorkspaceDrawerOpen = usePackStore((s) => s.isWorkspaceDrawerOpen);
  const toggleWorkspaceDrawer = usePackStore((s) => s.toggleWorkspaceDrawer);
  const blockWorkspaceTree = usePackStore((s) => s.blockWorkspaceTree);
  const entityWorkspaceTree = usePackStore((s) => s.entityWorkspaceTree);

  const isManifest = Boolean(
    isJsonFileSelected && jsonFileName?.toLowerCase() === 'manifest.json'
  );

  const isFilterActive = activeFilters.length > 0 || activeTab !== 'all';
  const totalFilterCount = activeFilters.length + (activeTab !== 'all' ? 1 : 0);

  return (
    <div className={styles.toolbar}>
      <div className={styles.leftControls}>
        {/* Sidebar Collapse / Expand Toggle Button */}
        <button
          type="button"
          className={`${styles.sidebarToggleBtn} ${isSidebarCollapsed ? styles.sidebarToggleBtnCollapsed : ''}`}
          onClick={toggleSidebar}
          title={isSidebarCollapsed ? 'Expand Sidebar (Ctrl+B)' : 'Collapse Sidebar (Ctrl+B)'}
          aria-label={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          aria-pressed={!isSidebarCollapsed}
        >
          {isSidebarCollapsed ? <PanelLeftOpen size={14} /> : <PanelLeft size={14} />}
        </button>
      </div>

      {/* Search & Filter Controls */}
      <div className={styles.searchFilterGroup}>
        {/* Workspace Expanders (Blocks / Entities drawer on narrow viewports only, placed to the left of Search) */}
        {!isJsonFileSelected && activeView === 'workspace' && (
          <button
            type="button"
            className={`${styles.workspaceExpanderBtn} ${isWorkspaceDrawerOpen ? styles.workspaceExpanderBtnActive : ''}`}
            onClick={toggleWorkspaceDrawer}
            title="Toggle Blocks List"
            aria-expanded={isWorkspaceDrawerOpen}
          >
            <Box size={13} />
            <span>Blocks ({blockWorkspaceTree?.length ?? 0})</span>
          </button>
        )}

        {!isJsonFileSelected && activeView === 'entity' && (
          <button
            type="button"
            className={`${styles.workspaceExpanderBtn} ${isWorkspaceDrawerOpen ? styles.workspaceExpanderBtnActive : ''}`}
            onClick={toggleWorkspaceDrawer}
            title="Toggle Entities List"
            aria-expanded={isWorkspaceDrawerOpen}
          >
            <PawPrint size={13} />
            <span>Entities ({entityWorkspaceTree?.length ?? 0})</span>
          </button>
        )}

        <SearchInput
          value={searchQuery}
          onChange={setSearchQuery}
          placeholder={isJsonFileSelected ? 'Search in JSON...' : 'Search textures...'}
          shortcutCue="/"
          enableSlashShortcut={true}
          wrapperClassName={styles.toolbarSearch}
        />

        {/* Modernized Filter Checklist Dropdown */}
        {!isJsonFileSelected && (
          <div className={styles.filterDropdownWrapper} ref={filterDropdownRef}>
            <button
              type="button"
              className={`${styles.filterTriggerBtn} ${isFilterOpen ? styles.filterTriggerBtnOpen : ''} ${isFilterActive ? styles.filterTriggerBtnActive : ''}`}
              onClick={() => setIsFilterOpen((prev) => !prev)}
              aria-expanded={isFilterOpen}
              aria-haspopup="true"
              title="Filter textures by category, status, and features"
            >
              <Filter size={13} className={styles.filterIcon} />
              <span className={styles.filterLabel}>Filter</span>
              {totalFilterCount > 0 && (
                <span className={styles.filterCountBadge}>{totalFilterCount}</span>
              )}
              <ChevronDown size={12} className={`${styles.filterChevron} ${isFilterOpen ? styles.filterChevronOpen : ''}`} />
            </button>

            {isFilterOpen && (
              <div className={styles.filterMenuPopover} role="menu">
                <div className={styles.filterMenuHeader}>
                  <span className={styles.filterMenuTitle}>Filter Textures</span>
                  {isFilterActive && (
                    <button
                      type="button"
                      className={styles.filterResetBtn}
                      onClick={() => {
                        clearFilters();
                        setActiveTab('all');
                      }}
                      title="Reset all filters"
                    >
                      Clear All
                    </button>
                  )}
                </div>

                {/* Category Scope */}
                <div className={styles.filterSection}>
                  <div className={styles.filterSectionLabel}>Category</div>
                  {[
                    { id: 'all', label: 'All Categories', icon: <LayoutGrid size={12} /> },
                    { id: 'blocks', label: 'Blocks', icon: <Box size={12} />, ghostCount: stats.blocksGhostCount },
                    { id: 'items', label: 'Items', icon: <Sword size={12} />, ghostCount: stats.itemsGhostCount },
                    { id: 'entities', label: 'Entities', icon: <PawPrint size={12} />, ghostCount: stats.entitiesGhostCount },
                  ].map((item) => {
                    const isChecked = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`${styles.filterMenuItem} ${isChecked ? styles.filterMenuItemChecked : ''}`}
                        onClick={() => setActiveTab(item.id as any)}
                        role="menuitemradio"
                        aria-checked={isChecked}
                      >
                        <div className={`${styles.filterRadio} ${isChecked ? styles.filterRadioChecked : ''}`}>
                          {isChecked && <div className={styles.filterRadioDot} />}
                        </div>
                        <div className={styles.filterItemIcon}>{item.icon}</div>
                        <span className={styles.filterItemLabel}>{item.label}</span>
                        {item.ghostCount !== undefined && item.ghostCount > 0 && (
                          <span className={styles.ghostCountPill}>{item.ghostCount}</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className={styles.filterDivider} />

                {/* Status */}
                <div className={styles.filterSection}>
                  <div className={styles.filterSectionLabel}>Status</div>
                  {FILTER_OPTIONS.filter((opt) => opt.category === 'status').map((opt) => {
                    const isChecked = activeFilters.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`${styles.filterMenuItem} ${isChecked ? styles.filterMenuItemChecked : ''}`}
                        onClick={() => toggleFilter(opt.key)}
                        role="menuitemcheckbox"
                        aria-checked={isChecked}
                      >
                        <div className={`${styles.filterCheckbox} ${isChecked ? styles.filterCheckboxChecked : ''}`}>
                          {isChecked && <Check size={10} strokeWidth={3} />}
                        </div>
                        <div className={styles.filterItemIcon}>{opt.icon}</div>
                        <span className={styles.filterItemLabel}>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={styles.filterDivider} />

                {/* Features */}
                <div className={styles.filterSection}>
                  <div className={styles.filterSectionLabel}>Features</div>
                  {FILTER_OPTIONS.filter((opt) => opt.category === 'feature').map((opt) => {
                    const isChecked = activeFilters.includes(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        className={`${styles.filterMenuItem} ${isChecked ? styles.filterMenuItemChecked : ''}`}
                        onClick={() => toggleFilter(opt.key)}
                        role="menuitemcheckbox"
                        aria-checked={isChecked}
                      >
                        <div className={`${styles.filterCheckbox} ${isChecked ? styles.filterCheckboxChecked : ''}`}>
                          {isChecked && <Check size={10} strokeWidth={3} />}
                        </div>
                        <div className={styles.filterItemIcon}>{opt.icon}</div>
                        <span className={styles.filterItemLabel}>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Controls: Zoom + View Mode */}
      <div className={styles.rightControls}>
        {isJsonFileSelected && (
          <div className={styles.viewModeGroup}>
            <button
              type="button"
              className={`${styles.viewModeButton} ${!isManifest || isManifestJsonDrawerOpen ? styles.viewModeButtonActive : ''}`}
              onClick={() => {
                if (isManifest) {
                  toggleManifestJsonDrawer();
                }
              }}
              title={isManifest ? (isManifestJsonDrawerOpen ? 'Close JSON Drawer' : 'Open JSON Drawer') : 'JSON'}
              aria-pressed={!isManifest || isManifestJsonDrawerOpen}
            >
              <FileCode2 size={13} />
              <span>JSON</span>
            </button>
          </div>
        )}
        <div className={styles.viewModeGroup}>
          <button
            type="button"
            className={`${styles.viewModeButton} ${!isJsonFileSelected && activeView === 'grid' ? styles.viewModeButtonActive : ''}`}
            aria-pressed={!isJsonFileSelected && activeView === 'grid'}
            onClick={() => handleSelectView('grid')}
            title="Pack Grid overview"
          >
            <LayoutGrid size={13} />
            <span>Pack Grid</span>
          </button>
          <button
            type="button"
            className={`${styles.viewModeButton} ${!isJsonFileSelected && activeView === 'workspace' ? styles.viewModeButtonActive : ''}`}
            aria-pressed={!isJsonFileSelected && activeView === 'workspace'}
            onClick={() => handleSelectView('workspace')}
            title="Block Workspace (4-Tier relational hierarchy)"
          >
            <Box size={13} />
            <span>Blocks</span>
          </button>
          <button
            type="button"
            className={`${styles.viewModeButton} ${!isJsonFileSelected && activeView === 'entity' ? styles.viewModeButtonActive : ''}`}
            aria-pressed={!isJsonFileSelected && activeView === 'entity'}
            onClick={() => handleSelectView('entity')}
            title="Entity Workspace (3D model & slot inspector)"
          >
            <PawPrint size={13} />
            <span>Entities</span>
          </button>
        </div>
      </div>
    </div>
  );
};
