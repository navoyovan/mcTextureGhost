import React, { useMemo } from 'react';
import { MoreVertical } from 'lucide-react';
import { CatalogLeafDto, OpenWithAppDto } from '../../types/ipc';
import { useIpc } from '../../hooks/useIpc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { TextureContextMenu } from '../common/TextureContextMenu';
import styles from './BlockWorkspace.module.css';

export interface VariantTileGroup {
  key: string;
  alias: string;
  leaves: CatalogLeafDto[];
}

interface WorkspaceTileCardProps {
  grp: VariantTileGroup;
  cardKey: string;
  tileZoom: number;
  selectedBlockName: string;
  isMenuOpen: boolean;
  onToggleMenu: (key: string) => void;
  onTileClick: (domEl: HTMLElement, leaf: CatalogLeafDto, key: string) => void;
  onDeleteTextureFile: (path: string, alias: string) => void;
  onDeleteTextureEntries: (alias: string, relativePath?: string | null) => void;
}

function getStatusDotClass(status: string): string {
  switch (status) {
    case 'OK':       return styles.statusDotOk ?? '';
    case 'GHOST':    return styles.statusDotGhost ?? '';
    case 'ORPHAN':   return styles.statusDotOrphan ?? '';
    case 'OVERRIDE': return styles.statusDotOverride ?? '';
    default:         return styles.statusDotNew ?? '';
  }
}

function getLeafTitle(l: CatalogLeafDto, fallbackAlias: string): string {
  if (l.relativePath) {
    return l.relativePath.split(/[/\\]/).pop() ?? l.displayName ?? fallbackAlias;
  }
  return l.displayName ?? fallbackAlias;
}

function parseFileName(l: CatalogLeafDto, fallbackAlias: string) {
  const raw = getLeafTitle(l, fallbackAlias);
  const sourceForExt = l.fullPath || l.relativePath || l.imageUrl || raw;
  const dotIdx = sourceForExt.lastIndexOf('.');
  const cleanExt = dotIdx > 0 ? (sourceForExt.substring(dotIdx).split('?')[0] ?? '').split('#')[0] ?? '' : '';
  const fileExt = cleanExt && cleanExt.length <= 5 ? cleanExt : '.png';
  const rawDotIdx = raw.lastIndexOf('.');
  const fileBase = rawDotIdx > 0 ? raw.substring(0, rawDotIdx) : raw;
  return { fileBase, fileExt, fullFileName: `${fileBase}${fileExt}` };
}

export const WorkspaceTileCard: React.FC<WorkspaceTileCardProps> = React.memo(({
  grp,
  cardKey,
  tileZoom,
  selectedBlockName,
  isMenuOpen,
  onToggleMenu,
  onTileClick,
  onDeleteTextureFile,
  onDeleteTextureEntries,
}) => {
  const { alias, leaves } = grp;
  const primary = leaves[0];
  const { editTexture, openInExplorer } = useIpc();
  if (!primary) return null;

  const numVariations = leaves.length;
  const hasTexVariants = numVariations > 1;
  const isGhost = primary.status === 'GHOST';
  const primaryFile = parseFileName(primary, alias);

  const cardWidth = useMemo(() => {
    return hasTexVariants
      ? 22 + numVariations * tileZoom + (numVariations - 1) * 8
      : tileZoom + 22;
  }, [hasTexVariants, numVariations, tileZoom]);

  const cardStyle = useMemo(() => ({
    '--tile-zoom': `${tileZoom}px`,
    width: `${cardWidth}px`,
  } as React.CSSProperties), [tileZoom, cardWidth]);

  const tooltipTitle = useMemo(() => {
    const blockVariantSuffix = primary.blockVariantIndex && primary.totalBlockVariants
      ? ` (block state ${primary.blockVariantIndex}/${primary.totalBlockVariants})`
      : '';
    return [
      `${selectedBlockName}${blockVariantSuffix}`,
      `terrain textures: ${alias}`,
      numVariations === 1
        ? `path: ${primary.relativePath}`
        : `path: ${leaves.map((l) => l.relativePath).join(', ')}`,
      hasTexVariants ? `${numVariations} texture variations` : '',
    ].filter(Boolean).join('\n');
  }, [selectedBlockName, primary, alias, numVariations, hasTexVariants, leaves]);

  const [menuAnchor, setMenuAnchor] = React.useState<{ x?: number; y?: number; top?: number; bottom?: number; left?: number; right?: number } | null>(null);

  return (
    <div
      className={`${styles.leafCard} ${hasTexVariants ? styles.leafCardWithVariants : ''}`}
      style={cardStyle}
      title={tooltipTitle}
      onClick={(e) => {
        onTileClick(e.currentTarget, primary, cardKey);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setMenuAnchor({ x: e.clientX, y: e.clientY });
        onToggleMenu(cardKey);
      }}
    >
      {/* 3-Dots Hover Menu Trigger */}
      <button
        type="button"
        className={`${styles.moreButton} ${isMenuOpen ? styles.moreButtonActive : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          if (isMenuOpen) {
            setMenuAnchor(null);
            onToggleMenu(cardKey);
          } else {
            const rect = e.currentTarget.getBoundingClientRect();
            setMenuAnchor({
              top: rect.top,
              bottom: rect.bottom,
              left: rect.left,
              right: rect.right,
            });
            onToggleMenu(cardKey);
          }
        }}
        title="Texture options"
        aria-label="Texture options"
      >
        <MoreVertical size={14} />
      </button>

      {/* Dropdown Context Menu */}
      {isMenuOpen && (
        <TextureContextMenu
          item={primary}
          anchor={menuAnchor}
          onClose={() => {
            setMenuAnchor(null);
            onToggleMenu(cardKey);
          }}
          onEdit={(app?: OpenWithAppDto) => {
            editTexture(primary.alias, primary.fullPath, primary.status === 'GHOST', app?.exePath, false);
          }}
          onOpenWithDialog={() => {
            editTexture(primary.alias, primary.fullPath, primary.status === 'GHOST', null, true);
          }}
          onRevealInExplorer={() => {
            if (primary.fullPath) {
              openInExplorer(primary.fullPath, true);
            }
          }}
          onDeleteTexture={() => {
            if (primary.fullPath) {
              onDeleteTextureFile(primary.fullPath, primary.alias);
            }
          }}
          onDeleteEntries={() => {
            onDeleteTextureEntries(primary.alias, primary.relativePath);
          }}
        />
      )}

      {/* Thumbnail area */}
      <div
        className={`${hasTexVariants ? styles.texVariantThumbRow : styles.leafThumbWrapper} ${!isGhost ? styles.leafThumbWrapperAdded : ''}`}
      >
        {leaves.map((leaf, i) => {
          const leafName = getLeafTitle(leaf, alias);
          const isLeafGhost = leaf.status === 'GHOST';
          return (
            <React.Fragment key={`${leaf.relativePath}-${i}`}>
              {i > 0 && <div className={styles.texVarDivider} />}
              <div
                className={`${hasTexVariants ? styles.texVarThumbSlot : styles.leafThumbInner} ${!isLeafGhost ? styles.texVarThumbSlotAdded : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onTileClick(e.currentTarget, leaf, `${cardKey}-${i}`);
                }}
                title={leafName}
              >
                {!isLeafGhost && leaf.imageUrl ? (
                  <FlipbookThumbnail
                    src={leaf.imageUrl}
                    alt={leafName}
                    className={styles.leafThumb}
                    isFlipbook={leaf.isFlipbook}
                    flipbook={leaf.flipbook}
                    loading="lazy"
                  />
                ) : (
                  <span className={styles.leafGhost}>?</span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Meta / Names Area */}
      {hasTexVariants ? (
        <div className={styles.texVariantMetaRow}>
          {leaves.map((leaf, i) => {
            const file = parseFileName(leaf, alias);
            return (
              <React.Fragment key={`meta-${leaf.relativePath}-${i}`}>
                {i > 0 && <div className={styles.texVarMetaDivider} />}
                <div className={styles.texVarMetaCol} style={{ width: `${tileZoom}px` }}>
                  <div className={styles.leafHeaderRow}>
                    <span className={styles.leafName} title={file.fullFileName}>
                      <span>{file.fileBase}</span>
                      <span className={styles.fileExt}>{file.fileExt}</span>
                    </span>
                  </div>
                  <div className={styles.leafSubRow}>
                    <span className={`${styles.leafStatusDot} ${getStatusDotClass(leaf.status)}`} />
                    <span className={styles.leafSubtitle}>
                      {leaf.relativePath || leaf.alias}
                    </span>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className={styles.leafMeta}>
          <div className={styles.leafHeaderRow}>
            <span className={styles.leafName} title={primaryFile.fullFileName}>
              <span>{primaryFile.fileBase}</span>
              <span className={styles.fileExt}>{primaryFile.fileExt}</span>
            </span>
          </div>
          <div className={styles.leafSubRow}>
            <span className={`${styles.leafStatusDot} ${getStatusDotClass(primary.status)}`} />
            <span className={styles.leafSubtitle}>
              {primary.relativePath || primary.alias}
            </span>
          </div>
        </div>
      )}
    </div>
  );
});
