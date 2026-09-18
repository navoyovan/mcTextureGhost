// frontend/src/components/common/ComponentLibrary.tsx
import React, { useState } from 'react';
import {
  X,
  Sparkles,
  FolderOpen,
  Plus,
  Search,
  LayoutGrid,
  Box,
  FileText,
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronRight,
  RefreshCw,
  Sliders,
  Code2,
  Palette,
  Package,
} from 'lucide-react';
import styles from './ComponentLibrary.module.css';

interface ComponentLibraryProps {
  isOpen: boolean;
  onClose: () => void;
}

type TabType = 'all' | 'buttons' | 'inputs' | 'cards' | 'badges' | 'typography';

export const ComponentLibrary: React.FC<ComponentLibraryProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [sampleText, setSampleText] = useState('mcTextureGhost');
  const [sampleSearch, setSampleSearch] = useState('dirt');
  const [sampleSelect, setSampleSelect] = useState('ghosts');
  const [sampleCheckbox, setSampleCheckbox] = useState(true);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose} data-testid="component-library-overlay">
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerTitleRow}>
            <div className={styles.headerIconWrapper}>
              <Code2 size={18} className={styles.headerIcon} />
            </div>
            <div>
              <h2 className={styles.title}>Component Library</h2>
              <p className={styles.subtitle}>
                mcTextureGhost Studio Design System & Component Showcase <kbd className={styles.kbd}>`</kbd>
              </p>
            </div>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            title="Close (` or Esc)"
          >
            <X size={18} />
          </button>
        </header>

        {/* Tab Filter Bar */}
        <nav className={styles.tabNav}>
          {(['all', 'buttons', 'inputs', 'cards', 'badges', 'typography'] as TabType[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`${styles.tabBtn} ${activeTab === tab ? styles.tabBtnActive : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>

        {/* Content Scroll Area */}
        <div className={styles.scrollArea}>
          {/* SECTION: BUTTONS */}
          {(activeTab === 'all' || activeTab === 'buttons') && (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>
                <Sparkles size={14} /> Interactive Buttons & Actions
              </h3>
              <div className={styles.componentGrid}>
                {/* Lit Surface Action Button (Welcome Primary) */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Lit Surface Primary Action</span>
                  <div className={styles.litPrimaryAction}>
                    <FolderOpen size={22} className={styles.litPrimaryIcon} />
                    <div>
                      <div className={styles.litPrimaryTitle}>Open Existing Pack</div>
                      <div className={styles.litPrimarySub}>Select a bedrock resource pack folder</div>
                    </div>
                  </div>
                </div>

                {/* Lit Surface Action Button (Welcome Secondary) */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Lit Surface Secondary Action</span>
                  <div className={styles.litSecondaryAction}>
                    <Plus size={20} className={styles.litSecondaryIcon} />
                    <div>
                      <div className={styles.litSecondaryTitle}>Create New Pack</div>
                      <div className={styles.litSecondarySub}>Initialize bedrock template</div>
                    </div>
                  </div>
                </div>

                {/* Standard Solid & Subtle Buttons */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Toolbar & Standard Action Buttons</span>
                  <div className={styles.rowWrap}>
                    <button type="button" className={styles.primaryBtn}>
                      <Plus size={13} /> Primary
                    </button>
                    <button type="button" className={styles.secondaryBtn}>
                      Secondary
                    </button>
                    <button type="button" className={styles.subtleBtn}>
                      <RefreshCw size={13} /> Subtle
                    </button>
                    <button type="button" className={styles.dangerBtn}>
                      Danger
                    </button>
                    <button type="button" className={styles.primaryBtn} disabled>
                      Disabled
                    </button>
                  </div>
                </div>

                {/* View Switcher Segmented Buttons */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Segmented View Switcher</span>
                  <div className={styles.viewModeGroup}>
                    <button type="button" className={`${styles.viewModeButton} ${styles.viewModeButtonActive}`}>
                      <LayoutGrid size={13} />
                      <span>Pack Grid</span>
                    </button>
                    <button type="button" className={styles.viewModeButton}>
                      <Box size={13} />
                      <span>Workspace</span>
                    </button>
                    <button type="button" className={styles.viewModeButton}>
                      <FileText size={13} />
                      <span>Manifest</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SECTION: INPUTS & FORM CONTROLS */}
          {(activeTab === 'all' || activeTab === 'inputs') && (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>
                <Sliders size={14} /> Inputs & Form Elements
              </h3>
              <div className={styles.componentGrid}>
                {/* Search Bar */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Search Bar with Clear</span>
                  <div className={styles.searchWrapper}>
                    <Search size={14} className={styles.searchIcon} />
                    <input
                      type="text"
                      className={styles.searchInput}
                      value={sampleSearch}
                      onChange={(e) => setSampleSearch(e.target.value)}
                      placeholder="Search items..."
                    />
                    {sampleSearch && (
                      <button
                        type="button"
                        className={styles.searchClear}
                        onClick={() => setSampleSearch('')}
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Status Dropdown */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Select Dropdown</span>
                  <select
                    className={styles.select}
                    value={sampleSelect}
                    onChange={(e) => setSampleSelect(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="ghosts">👻 Ghosts Only</option>
                    <option value="added">✅ Added Only</option>
                    <option value="orphans">◈ Orphans Only</option>
                  </select>
                </div>

                {/* Standard Text Input */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Standard Text Input</span>
                  <input
                    type="text"
                    className={styles.textInput}
                    value={sampleText}
                    onChange={(e) => setSampleText(e.target.value)}
                    placeholder="Enter resource name..."
                  />
                </div>

                {/* Checkbox / Toggle */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Checkbox & Toggle</span>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={sampleCheckbox}
                      onChange={(e) => setSampleCheckbox(e.target.checked)}
                      className={styles.checkboxInput}
                    />
                    <span>Highlight Missing Textures (Ghosts)</span>
                  </label>
                </div>
              </div>
            </section>
          )}

          {/* SECTION: CARDS & SURFACES */}
          {(activeTab === 'all' || activeTab === 'cards') && (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>
                <Palette size={14} /> Surfaces & Lit Workspace Rows
              </h3>
              <div className={styles.componentGrid}>
                {/* Recent Workspace Row */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Subtle Lit Workspace Row</span>
                  <div className={styles.sampleRecentRow}>
                    <div className={styles.rowThumbnail}>
                      <Package size={18} className={styles.rowThumbnailIcon} />
                    </div>
                    <div className={styles.rowDetails}>
                      <div className={styles.rowTitle}>Faithful 32x HD</div>
                      <div className={styles.rowPath}>C:/Users/yovan/AppData/Local/Packages/.../resource_packs/Faithful</div>
                    </div>
                    <ChevronRight size={14} className={styles.rowChevron} />
                  </div>
                </div>

                {/* Toast Notification Alert Surface */}
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Toast Notification Banners</span>
                  <div className={styles.toastSample}>
                    <AlertCircle size={16} className={styles.toastIconError} />
                    <div className={styles.toastText}>
                      <strong>Scan Error</strong>
                      <span>Missing manifest.json header UUID definition</span>
                    </div>
                  </div>
                  <div className={`${styles.toastSample} ${styles.toastSampleWarning}`}>
                    <AlertTriangle size={16} className={styles.toastIconWarning} />
                    <div className={styles.toastText}>
                      <strong>Texture Warning</strong>
                      <span>Unreferenced terrain texture: stone_andesite.png</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SECTION: BADGES & CHIPS */}
          {(activeTab === 'all' || activeTab === 'badges') && (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>
                <Info size={14} /> Status Badges & Indicators
              </h3>
              <div className={styles.componentGrid}>
                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Texture Status Badges</span>
                  <div className={styles.rowWrap}>
                    <span className={styles.badgeGhost}>👻 Ghost Texture</span>
                    <span className={styles.badgeAdded}>✅ Added Texture</span>
                    <span className={styles.badgeOrphan}>◈ Orphan File</span>
                    <span className={styles.badgeCount}>5 Workspaces</span>
                  </div>
                </div>

                <div className={styles.showcaseCard}>
                  <span className={styles.componentLabel}>Manifest State Badges</span>
                  <div className={styles.rowWrap}>
                    <span className={styles.badgeOk}>Valid</span>
                    <span className={styles.badgeMissing}>Missing</span>
                    <span className={styles.badgeDirty}>Unsaved Changes</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* SECTION: TYPOGRAPHY */}
          {(activeTab === 'all' || activeTab === 'typography') && (
            <section className={styles.section}>
              <h3 className={styles.sectionHeading}>
                <FileText size={14} /> Typography Tokens
              </h3>
              <div className={styles.showcaseCard}>
                <div className={styles.typeRow}>
                  <span className={styles.typeMeta}>Syne 700 (Brand Display)</span>
                  <span className={styles.typeBrand}>mcTextureGhost Studio</span>
                </div>
                <div className={styles.typeRow}>
                  <span className={styles.typeMeta}>Press Start 2P (Retro Pixel/Bedrock)</span>
                  <span className={styles.typePixel}>BEDROCK RESOURCE PACK</span>
                </div>
                <div className={styles.typeRow}>
                  <span className={styles.typeMeta}>Segoe UI / System (Primary UI)</span>
                  <span className={styles.typeBody}>
                    Non-destructive ghost overlay manager for Minecraft Bedrock resource pack authoring.
                  </span>
                </div>
                <div className={styles.typeRow}>
                  <span className={styles.typeMeta}>Consolas / Mono (Code/Paths)</span>
                  <span className={styles.typeMono}>textures/blocks/stone.png · UUID: 44b7a1c0-2f9e</span>
                </div>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
};
