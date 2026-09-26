// frontend/src/components/catalog/CatalogToolbar.tsx
import React from 'react';
import { Box, Sword, PawPrint } from 'lucide-react';
import { SearchInput } from '../common/SearchInput';
import styles from './CatalogDrawer.module.css';

export type CatalogCategory = 'all' | 'block' | 'item' | 'entity';

export interface CatalogFloatingClusterProps {
  categoryFilter: CatalogCategory;
  onSelectCategory: (category: CatalogCategory) => void;
}

/**
 * 4 connected buttons detached from drawer on left: All (top), Blocks, Items, Entities
 */
export const CatalogFloatingCluster: React.FC<CatalogFloatingClusterProps> = ({
  categoryFilter,
  onSelectCategory,
}) => {
  return (
    <div className={styles.floatingActionCluster}>
      <button
        type="button"
        className={`${styles.floatingBtn} ${categoryFilter === 'all' ? styles.floatingBtnActive : ''}`}
        title="Show All"
        aria-label="Show All"
        onClick={(e) => {
          e.stopPropagation();
          onSelectCategory('all');
        }}
      >
        <span className={styles.floatingBtnText}>All</span>
        <span className={styles.floatingBtnTooltip}>Show All</span>
      </button>
      <div className={styles.floatingBtnDivider} />
      <button
        type="button"
        className={`${styles.floatingBtn} ${categoryFilter === 'block' ? styles.floatingBtnActive : ''}`}
        title="Filter Blocks"
        aria-label="Filter Blocks"
        onClick={(e) => {
          e.stopPropagation();
          onSelectCategory(categoryFilter === 'block' ? 'all' : 'block');
        }}
      >
        <span className={styles.floatingBtnIcon}>
          <Box size={16} />
        </span>
        <span className={styles.floatingBtnTooltip}>Filter Blocks</span>
      </button>
      <div className={styles.floatingBtnDivider} />
      <button
        type="button"
        className={`${styles.floatingBtn} ${categoryFilter === 'item' ? styles.floatingBtnActive : ''}`}
        title="Filter Items"
        aria-label="Filter Items"
        onClick={(e) => {
          e.stopPropagation();
          onSelectCategory(categoryFilter === 'item' ? 'all' : 'item');
        }}
      >
        <span className={styles.floatingBtnIcon}>
          <Sword size={16} />
        </span>
        <span className={styles.floatingBtnTooltip}>Filter Items</span>
      </button>
      <div className={styles.floatingBtnDivider} />
      <button
        type="button"
        className={`${styles.floatingBtn} ${categoryFilter === 'entity' ? styles.floatingBtnActive : ''}`}
        title="Filter Entities"
        aria-label="Filter Entities"
        onClick={(e) => {
          e.stopPropagation();
          onSelectCategory(categoryFilter === 'entity' ? 'all' : 'entity');
        }}
      >
        <span className={styles.floatingBtnIcon}>
          <PawPrint size={16} />
        </span>
        <span className={styles.floatingBtnTooltip}>Filter Entities</span>
      </button>
    </div>
  );
};

export interface CatalogToolbarProps {
  searchText: string;
  onSearchChange: (text: string) => void;
  categoryFilter: CatalogCategory;
  onSelectCategory: (category: CatalogCategory) => void;
  isOpen: boolean;
}

/**
 * Search input + inline category pills for smaller viewports
 */
export const CatalogToolbar: React.FC<CatalogToolbarProps> = ({
  searchText,
  onSearchChange,
  categoryFilter,
  onSelectCategory,
  isOpen,
}) => {
  return (
    <div className={styles.searchToolbar}>
      <SearchInput
        value={searchText}
        onChange={onSearchChange}
        placeholder="Search vanilla blocks, items, entities, or aliases..."
        shortcutCue={isOpen ? '/' : null}
        enableSlashShortcut={isOpen}
        autoFocus
        data-testid="catalog-search-input"
      />

      {/* Inline Category Pills for small viewports when floating cluster is hidden */}
      <div className={styles.inlineCategoryPills}>
        <button
          type="button"
          className={`${styles.inlinePillBtn} ${categoryFilter === 'all' ? styles.inlinePillBtnActive : ''}`}
          onClick={() => onSelectCategory('all')}
        >
          All
        </button>
        <button
          type="button"
          className={`${styles.inlinePillBtn} ${categoryFilter === 'block' ? styles.inlinePillBtnActive : ''}`}
          onClick={() => onSelectCategory(categoryFilter === 'block' ? 'all' : 'block')}
        >
          <Box size={12} />
          <span>Blocks</span>
        </button>
        <button
          type="button"
          className={`${styles.inlinePillBtn} ${categoryFilter === 'item' ? styles.inlinePillBtnActive : ''}`}
          onClick={() => onSelectCategory(categoryFilter === 'item' ? 'all' : 'item')}
        >
          <Sword size={12} />
          <span>Items</span>
        </button>
        <button
          type="button"
          className={`${styles.inlinePillBtn} ${categoryFilter === 'entity' ? styles.inlinePillBtnActive : ''}`}
          onClick={() => onSelectCategory(categoryFilter === 'entity' ? 'all' : 'entity')}
        >
          <PawPrint size={12} />
          <span>Entities</span>
        </button>
      </div>
    </div>
  );
};
