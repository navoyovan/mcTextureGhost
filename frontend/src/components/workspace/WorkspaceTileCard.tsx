import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { CatalogLeafDto, OpenWithAppDto, TileDragData } from '../../types/ipc';
import { usePackStore, packStoreActions } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { FlipbookThumbnail } from '../common/FlipbookThumbnail';
import { TextureContextMenu } from '../common/TextureContextMenu';
import { TextureDropConfirm } from '../grid/TextureDropConfirm';
import { normalizePath, getFileName, resolveTextureFullPath } from '../../utils/pathUtils';
import { leafToAliasDto, VariantTileGroup } from '../../utils/leafTransforms';
import styles from './BlockWorkspace.module.css';

export type { VariantTileGroup };

interface WorkspaceTileCardProps {
  grp: VariantTileGroup;
  cardKey: string;
  tileZoom: number;
  selectedBlockName: string;
  isMenuOpen: boolean;
  onToggleMenu: (key: string) => void;
  onTileClick: (domEl: HTMLElement, leaf: CatalogLeafDto, key: string, targetType?: 'card' | 'image') => void;
  onDeleteTextureFile: (path: string, alias: string) => void;
  onDeleteTextureEntries?: (alias: string, relativePath?: string | null) => void;
  onAddVariation?: (leaf: CatalogLeafDto, count?: number) => void;

  onDeleteVariation?: (leaf: CatalogLeafDto) => void;
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
  onAddVariation,
  onDeleteVariation,
}) => {
  const { alias, leaves } = grp;
  const primary = leaves[0];
  const { editTexture, openInExplorer, dropImportTexture, copyTextureFile, setVariationWeight, renameVariation } = useIpc();
  const packRoot = usePackStore((s) => s.packRoot);
  const packAliases = usePackStore((s) => s.aliases);

  // Index aliases for this card's specific alias to avoid O(N) array scans across all pack aliases
  const groupStoreAliases = useMemo(() => {
    const target = alias.toLowerCase();
    return packAliases.filter((a) => a.alias.toLowerCase() === target && a.status !== 'ORPHAN');
  }, [packAliases, alias]);

  const handleUpdateWeight = useCallback((leaf: CatalogLeafDto, weight: number) => {
    if (!leaf.relativePath) return;
    packStoreActions.optimisticSetVariationWeight(leaf.alias, leaf.relativePath, weight);
    setVariationWeight(leaf.alias, leaf.relativePath, weight);
  }, [setVariationWeight]);

  const handleRenameVariation = useCallback((leaf: CatalogLeafDto, newLabel: string) => {
    if (!leaf.relativePath) return;
    const oldSlash = leaf.relativePath.lastIndexOf('/');
    const baseDir = oldSlash > 0 ? leaf.relativePath.substring(0, oldSlash) : 'textures/blocks';
    const cleanLabel = newLabel.replace(/\.(png|tga)$/i, '');
    const newRelativePath = `${baseDir}/${cleanLabel}.png`;
    packStoreActions.optimisticRenameVariation(leaf.alias, leaf.relativePath, newRelativePath);
    renameVariation(leaf.alias, leaf.relativePath, newLabel);
  }, [renameVariation]);

  const findStoreAlias = useCallback((targetLeaf: CatalogLeafDto) => {
    const targetRel = (targetLeaf.relativePath || '').replace(/\\/g, '/').toLowerCase().replace(/\.(png|tga)$/i, '');

    return groupStoreAliases.find((a) => {
      // 1. If both declare relativePath, match strictly by relative path
      if (targetRel && a.relativePath) {
        const aRel = a.relativePath.replace(/\\/g, '/').toLowerCase().replace(/\.(png|tga)$/i, '');
        if (aRel !== targetRel) return false;
      }

      // 2. If both declare blockVariantIndex, match strictly by blockVariantIndex
      if (targetLeaf.blockVariantIndex != null && a.blockVariantIndex != null) {
        if (a.blockVariantIndex !== targetLeaf.blockVariantIndex) return false;
      }

      // 3. If both declare textureVariantIndex, match strictly by textureVariantIndex
      if (targetLeaf.textureVariantIndex != null && a.textureVariantIndex != null) {
        if (a.textureVariantIndex !== targetLeaf.textureVariantIndex) return false;
      } else if (targetLeaf.textureVariantIndex != null || a.textureVariantIndex != null) {
        return false;
      }

      return true;
    });
  }, [groupStoreAliases]);

  // Drag and drop state
  const [dragSlotIndex, setDragSlotIndex] = useState<number | null>(null);
  const [pendingDrop, setPendingDrop] = useState<
    | { leaf: CatalogLeafDto; type: 'file'; file: File; objectUrl: string }
    | { leaf: CatalogLeafDto; type: 'tile'; source: TileDragData }
    | null
  >(null);
  const dragCounterMap = useRef<Map<number, number>>(new Map());

  const processImport = useCallback(
    (leaf: CatalogLeafDto, file: File) => {
      const tImportStart = performance.now();
      const targetFullPath = resolveTextureFullPath(packRoot, leaf.fullPath, leaf.relativePath);
      if (!targetFullPath) return;
      // optimistic BEFORE file read — instant tile flip even for large files
      const previewUrl = URL.createObjectURL(file);
      packStoreActions.updateTexture(leaf.alias, 'OK', targetFullPath, previewUrl, leaf.relativePath);

      const sourceFilePath = (file as any).path as string | undefined;
      if (sourceFilePath) {
        const totalMs = performance.now() - tImportStart;
        console.log(`[PERF][IMPORT] file=${file.name} nativePath=${sourceFilePath} totalBeforeIpc=${totalMs.toFixed(1)}ms`);
        dropImportTexture({
          aliasKey: leaf.alias,
          fullPath: targetFullPath,
          sourceFilePath,
          relativePath: leaf.relativePath,
          category: (leaf.category as string) || 'block',
          fileName: file.name,
        });
      } else {
        // Fallback: Use arrayBuffer() which stays off the main thread, then convert to base64 in small chunks
        // to avoid locking the JS thread during encoding (readAsDataURL blocks on large files)
        file.arrayBuffer().then((buffer) => {
          const tEncodeStart = performance.now();
          const bytes = new Uint8Array(buffer);
          let binary = '';
          const chunkSize = 8192;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
          }
          const base64Data = `data:${file.type || 'image/png'};base64,${btoa(binary)}`;
          const encodeMs = performance.now() - tEncodeStart;
          const totalMs = performance.now() - tImportStart;
          console.log(`[PERF][IMPORT] file=${file.name} size=${(file.size / 1024).toFixed(1)}KB encode=${encodeMs.toFixed(1)}ms totalBeforeIpc=${totalMs.toFixed(1)}ms`);
          dropImportTexture({
            aliasKey: leaf.alias,
            fullPath: targetFullPath,
            base64Data,
            relativePath: leaf.relativePath,
            category: (leaf.category as string) || 'block',
            fileName: file.name,
          });
        }).catch((err) => console.error('[WorkspaceTileCard] Failed to read file buffer:', err));
      }
    },
    [packRoot, dropImportTexture]
  );

  const executeTileCopy = useCallback(
    (leaf: CatalogLeafDto, sourceData: TileDragData, targetFullPath: string) => {
      // optimistic immediately
      packStoreActions.updateTexture(leaf.alias, 'OK', targetFullPath, sourceData.imageUrl || null, leaf.relativePath);
      if (sourceData.fullPath) {
        copyTextureFile({
          sourceFullPath: sourceData.fullPath,
          targetFullPath,
          targetAliasKey: leaf.alias,
          targetRelativePath: leaf.relativePath,
        });
      } else if (sourceData.imageUrl) {
        fetch(sourceData.imageUrl)
          .then((res) => res.arrayBuffer())
          .then((buffer) => {
            const bytes = new Uint8Array(buffer);
            let binary = '';
            const chunkSize = 8192;
            for (let i = 0; i < bytes.length; i += chunkSize) {
              binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            const base64Data = `data:image/png;base64,${btoa(binary)}`;
            dropImportTexture({
              aliasKey: leaf.alias,
              fullPath: targetFullPath,
              base64Data,
              relativePath: leaf.relativePath,
              category: (leaf.category as string) || 'block',
              fileName: `${sourceData.aliasKey}.png`,
            });
          })
          .catch((err) => console.error('[WorkspaceTileCard] Failed to fetch source texture blob:', err));
      }
    },
    [copyTextureFile, dropImportTexture]
  );

  const handleSlotDragStart = (e: React.DragEvent, leaf: CatalogLeafDto) => {
    if (leaf.status === 'GHOST') {
      e.preventDefault();
      return;
    }
    const dragData: TileDragData = {
      aliasKey: leaf.alias,
      fullPath: leaf.fullPath,
      relativePath: leaf.relativePath,
      imageUrl: leaf.imageUrl,
      displayName: getLeafTitle(leaf, alias),
      category: (leaf.category as string) || 'block',
      isGhost: false,
      sourceType: 'workspace',
    };
    e.dataTransfer.setData('application/x-mctg-tile', JSON.stringify(dragData));
    if (leaf.fullPath) {
      e.dataTransfer.setData('text/plain', leaf.fullPath);
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleSlotDragEnter = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const count = (dragCounterMap.current.get(slotIndex) || 0) + 1;
    dragCounterMap.current.set(slotIndex, count);
    if (e.dataTransfer?.items?.length || e.dataTransfer?.types?.length) {
      setDragSlotIndex(slotIndex);
    }
  };

  const handleSlotDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleSlotDragLeave = (e: React.DragEvent, slotIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const count = (dragCounterMap.current.get(slotIndex) || 0) - 1;
    dragCounterMap.current.set(slotIndex, Math.max(0, count));
    if (count <= 0) {
      setDragSlotIndex((prev) => (prev === slotIndex ? null : prev));
      dragCounterMap.current.delete(slotIndex);
    }
  };

  const handleSlotDrop = (e: React.DragEvent, leaf: CatalogLeafDto) => {
    e.preventDefault();
    e.stopPropagation();
    setDragSlotIndex(null);
    dragCounterMap.current.clear();

    const targetFullPath = resolveTextureFullPath(packRoot, leaf.fullPath, leaf.relativePath);

    if (!targetFullPath) return;

    // 1. Check internal tile drag
    const tileJson = e.dataTransfer?.getData('application/x-mctg-tile');
    if (tileJson) {
      try {
        const sourceData: TileDragData = JSON.parse(tileJson);
        if (sourceData.aliasKey === leaf.alias && sourceData.fullPath === leaf.fullPath) {
          return;
        }

        if (leaf.status === 'GHOST') {
          executeTileCopy(leaf, sourceData, targetFullPath);
        } else {
          setPendingDrop({ leaf, type: 'tile', source: sourceData });
        }
        return;
      } catch (err) {
        console.error('[WorkspaceTileCard] Error parsing tile drag data:', err);
      }
    }

    // 2. Check OS file drop
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file) return;

    const validExtensions = ['.png', '.tga', '.jpg', '.jpeg', '.webp'];
    const lowerName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => lowerName.endsWith(ext));

    if (!isValid) return;

    if (leaf.status === 'GHOST') {
      processImport(leaf, file);
    } else {
      const objectUrl = URL.createObjectURL(file);
      setPendingDrop({ leaf, type: 'file', file, objectUrl });
    }
  };

  const handleConfirmOverwrite = useCallback(() => {
    if (!pendingDrop) return;
    if (pendingDrop.type === 'file') {
      const { leaf, file, objectUrl } = pendingDrop;
      processImport(leaf, file);
      URL.revokeObjectURL(objectUrl);
    } else if (pendingDrop.type === 'tile') {
      const targetFullPath = resolveTextureFullPath(packRoot, pendingDrop.leaf.fullPath, pendingDrop.leaf.relativePath);
      if (targetFullPath) {
        executeTileCopy(pendingDrop.leaf, pendingDrop.source, targetFullPath);
      }
    }
    setPendingDrop(null);
  }, [pendingDrop, processImport, packRoot, executeTileCopy]);

  const handleCancelOverwrite = useCallback(() => {
    if (pendingDrop) {
      if (pendingDrop.type === 'file') {
        URL.revokeObjectURL(pendingDrop.objectUrl);
      }
      setPendingDrop(null);
    }
  }, [pendingDrop]);

  useEffect(() => {
    return () => {
      if (pendingDrop && pendingDrop.type === 'file') {
        URL.revokeObjectURL(pendingDrop.objectUrl);
      }
    };
  }, [pendingDrop]);

  if (!primary) return null;

  const numVariations = leaves.length;
  const hasTexVariants = numVariations > 1;
  const primaryStoreAlias = findStoreAlias(primary);
  const isGhost = primaryStoreAlias ? (primaryStoreAlias.status === 'GHOST' || !primaryStoreAlias.exists) : (primary.status === 'GHOST' || (!primary.fullPath && primary.status !== 'OK' && primary.status !== 'OVERRIDE'));
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
  const [variationMenu, setVariationMenu] = React.useState<{ leaf: CatalogLeafDto; anchor: { x?: number; y?: number } } | null>(null);
  const lastMenuCloseRef = React.useRef<number>(0);
  const primaryThumbRef = React.useRef<HTMLDivElement>(null);

  const isCardDragOver = !hasTexVariants && dragSlotIndex === 0;
  const [isExiting, setIsExiting] = useState(false);
  const [deletingSlotIndex, setDeletingSlotIndex] = useState<number | null>(null);

  const handleDeleteWithAnimation = useCallback((action: () => void) => {
    setIsExiting(true);
    setTimeout(() => {
      action();
    }, 180);
  }, []);

  const handleDeleteTextureWithAnimation = useCallback((leaf: CatalogLeafDto, slotIdx: number) => {
    if (!leaf.fullPath) return;
    setDeletingSlotIndex(slotIdx);
    setTimeout(() => {
      onDeleteTextureFile(leaf.fullPath, leaf.alias);
      setDeletingSlotIndex(null);
    }, 160);
  }, [onDeleteTextureFile]);

  return (
    <div
      className={`${styles.leafCard} ${hasTexVariants ? styles.leafCardWithVariants : ''} ${isCardDragOver ? styles.leafCardDragOver : ''} ${isExiting ? styles.leafCardExiting : ''}`}
      style={cardStyle}
      title={tooltipTitle}
      onClick={
        !hasTexVariants
          ? (e) => {
              if (Date.now() - lastMenuCloseRef.current < 300) return;
              const targetEl =
                primaryThumbRef.current ||
                (e.currentTarget.querySelector(`.${styles.leafThumbWrapper}, .${styles.texVarThumbSlot}, .${styles.leafThumbInner}, img`) as HTMLElement | null) ||
                e.currentTarget;
              onTileClick(targetEl, primary, cardKey, 'image');
            }
          : undefined
      }
      onContextMenu={
        !hasTexVariants
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuAnchor({ x: e.clientX, y: e.clientY });
              onToggleMenu(cardKey);
            }
          : undefined
      }
      onDragEnter={!hasTexVariants ? (e) => handleSlotDragEnter(e, 0) : undefined}
      onDragOver={!hasTexVariants ? handleSlotDragOver : undefined}
      onDragLeave={!hasTexVariants ? (e) => handleSlotDragLeave(e, 0) : undefined}
      onDrop={!hasTexVariants ? (e) => handleSlotDrop(e, primary) : undefined}
    >
      {/* Dropdown Context Menu */}
      {isMenuOpen && (
        <TextureContextMenu
          item={primary}
          anchor={menuAnchor}
          onClose={() => {
            lastMenuCloseRef.current = Date.now();
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
            handleDeleteTextureWithAnimation(primary, 0);
          }}
          onDeleteEntries={
            onDeleteTextureEntries
              ? () => {
                  const hasPhysicalTexture = Boolean(primary.fullPath || primary.status === 'OK');
                  if (!hasPhysicalTexture) {
                    handleDeleteWithAnimation(() => {
                      onDeleteTextureEntries(primary.alias, primary.relativePath);
                    });
                  } else {
                    onDeleteTextureEntries(primary.alias, primary.relativePath);
                  }
                }
              : undefined
          }
          onAddVariation={onAddVariation ? (count) => onAddVariation(primary, count) : undefined}
          onDeleteVariation={onDeleteVariation && primary.textureVariantIndex != null ? () => onDeleteVariation(primary) : undefined}
          onUpdateWeight={hasTexVariants || primary.textureVariantIndex != null ? (weight) => handleUpdateWeight(primary, weight) : undefined}
          onRenameVariation={hasTexVariants || primary.textureVariantIndex != null ? (newLabel) => handleRenameVariation(primary, newLabel) : undefined}
        />
      )}

      {/* Per-variation context menu — texture-only interaction, morph does not expand on right-click */}
      {variationMenu && (
        <TextureContextMenu
          item={variationMenu.leaf}
          anchor={variationMenu.anchor}
          onClose={() => {
            lastMenuCloseRef.current = Date.now();
            setVariationMenu(null);
          }}
          onEdit={(app?: OpenWithAppDto) => {
            editTexture(variationMenu.leaf.alias, variationMenu.leaf.fullPath, variationMenu.leaf.status === 'GHOST', app?.exePath, false);
          }}
          onOpenWithDialog={() => {
            editTexture(variationMenu.leaf.alias, variationMenu.leaf.fullPath, variationMenu.leaf.status === 'GHOST', null, true);
          }}
          onRevealInExplorer={() => {
            if (variationMenu.leaf.fullPath) {
              openInExplorer(variationMenu.leaf.fullPath, true);
            }
          }}
          onDeleteTexture={() => {
            const vIdx = leaves.findIndex((l) => l === variationMenu.leaf || l.relativePath === variationMenu.leaf.relativePath);
            handleDeleteTextureWithAnimation(variationMenu.leaf, vIdx >= 0 ? vIdx : 0);
          }}
          onDeleteEntries={
            onDeleteTextureEntries
              ? () => {
                  onDeleteTextureEntries(variationMenu.leaf.alias, variationMenu.leaf.relativePath);
                }
              : undefined
          }
          onAddVariation={onAddVariation ? (count) => onAddVariation(variationMenu.leaf, count) : undefined}
          onDeleteVariation={onDeleteVariation && variationMenu.leaf.textureVariantIndex != null ? () => onDeleteVariation(variationMenu.leaf) : undefined}
          onUpdateWeight={(weight) => handleUpdateWeight(variationMenu.leaf, weight)}
          onRenameVariation={(newLabel) => handleRenameVariation(variationMenu.leaf, newLabel)}
        />
      )}

      {/* Thumbnail area */}
      <div
        ref={!hasTexVariants ? primaryThumbRef : undefined}
        className={`${hasTexVariants ? styles.texVariantThumbRow : styles.leafThumbWrapper} ${!isGhost ? styles.leafThumbWrapperAdded : ''}`}
      >
        {isCardDragOver && (
          <div className={styles.dropOverlay}>
            <span className={styles.dropOverlayIcon}>{isGhost ? '✨' : '📥'}</span>
            <span className={styles.dropOverlayBadge}>
              {isGhost ? 'Drop to Create' : 'Drop to Replace'}
            </span>
          </div>
        )}

        {leaves.map((leaf, i) => {
          const leafName = getLeafTitle(leaf, alias);
          const storeAlias = findStoreAlias(leaf);
          const isLeafGhost =
            leaf.status === 'GHOST' ||
            (storeAlias && (storeAlias.status === 'GHOST' || storeAlias.exists === false)) ||
            (!leaf.fullPath && leaf.status !== 'OK' && leaf.status !== 'OVERRIDE');
          const baseImgUrl = isLeafGhost ? '' : (leaf.imageUrl || storeAlias?.imageUrl || '');
          const resolvedImgUrl = isLeafGhost
            ? ''
            : (baseImgUrl || (packRoot
              ? (leaf.fullPath && leaf.fullPath.startsWith(packRoot)
                ? `https://pack.local/${normalizePath(leaf.fullPath.slice(packRoot.length).replace(/^[/\\]+/, ''))}`
                : (leaf.status === 'OK' || leaf.status === 'OVERRIDE') && leaf.relativePath
                ? `https://pack.local/${normalizePath(leaf.relativePath.replace(/^[/\\]+/, ''))}`
                : '')
              : ''));
          const isSlotDragOver = hasTexVariants && dragSlotIndex === i;

          return (
            <React.Fragment key={`${leaf.relativePath}-${i}`}>
              {i > 0 && <div className={styles.texVarDivider} />}
              <div
                ref={hasTexVariants && i === 0 ? primaryThumbRef : undefined}
                className={`${hasTexVariants ? styles.texVarThumbSlot : styles.leafThumbInner} ${!isLeafGhost ? styles.texVarThumbSlotAdded : ''} ${isSlotDragOver ? styles.texVarSlotDragOver : ''}`}
                draggable={!isLeafGhost && Boolean(resolvedImgUrl || leaf.fullPath)}
                onDragStart={(e) => handleSlotDragStart(e, leaf)}
                onClick={(e) => {
                  if (Date.now() - lastMenuCloseRef.current < 300) return;
                  e.stopPropagation();
                  const targetEl = (!hasTexVariants && primaryThumbRef.current) ? primaryThumbRef.current : e.currentTarget;
                  onTileClick(targetEl, leaf, `${cardKey}-${i}`, 'image');
                }}
                onContextMenu={
                  hasTexVariants
                    ? (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setVariationMenu({ leaf, anchor: { x: e.clientX, y: e.clientY } });
                      }
                    : undefined
                }
                onDragEnter={hasTexVariants ? (e) => handleSlotDragEnter(e, i) : undefined}
                onDragOver={hasTexVariants ? handleSlotDragOver : undefined}
                onDragLeave={hasTexVariants ? (e) => handleSlotDragLeave(e, i) : undefined}
                onDrop={hasTexVariants ? (e) => handleSlotDrop(e, leaf) : undefined}
                title={leafName}
                style={{ position: 'relative', cursor: !isLeafGhost ? 'grab' : undefined }}
              >
                {isSlotDragOver && (
                  <div className={styles.dropOverlay}>
                    <span className={styles.dropOverlayIcon}>{isLeafGhost ? '✨' : '📥'}</span>
                    <span className={styles.dropOverlayBadge}>
                      {isLeafGhost ? 'Create' : 'Replace'}
                    </span>
                  </div>
                )}

                {!isLeafGhost && resolvedImgUrl ? (
                  <FlipbookThumbnail
                    src={resolvedImgUrl}
                    atlasSrc={
                      leaf.atlasFullPath
                        ? packRoot && leaf.atlasFullPath.startsWith(packRoot)
                          ? `https://pack.local/${normalizePath(leaf.atlasFullPath.slice(packRoot.length).replace(/^[/\\]+/, ''))}`
                          : resolvedImgUrl.replace(/[^/?#]+(\?.*)?$/, `${getFileName(leaf.atlasFullPath)}$1`)
                        : null
                    }
                    alt={leafName}
                    aliasKey={leaf.alias}
                    className={`${styles.leafThumb} ${deletingSlotIndex === i ? styles.leafThumbDeleting : ''}`}
                    isFlipbook={leaf.isFlipbook || Boolean(leaf.hasAtlas)}
                    flipbook={leaf.flipbook}
                  />
                ) : (
                  <span key="ghost" className={styles.leafGhost}>?</span>
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

      {/* Overwrite Confirmation Modal (mounted via Portal) */}
      {pendingDrop && (
        <TextureDropConfirm
          alias={leafToAliasDto(pendingDrop.leaf)}
          incomingObjectUrl={pendingDrop.type === 'file' ? pendingDrop.objectUrl : pendingDrop.source.imageUrl}
          incomingFileName={pendingDrop.type === 'file' ? pendingDrop.file.name : `${pendingDrop.source.displayName || pendingDrop.source.aliasKey}.png`}
          onConfirm={handleConfirmOverwrite}
          onCancel={handleCancelOverwrite}
        />
      )}
    </div>
  );
});
