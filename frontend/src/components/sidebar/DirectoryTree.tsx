import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  Box,
  AlertTriangle,
  FileJson,
  FileText,
  FileImage,
  FileCode,
  File,
  Pencil,
} from 'lucide-react';
import { PackFolderItemDto } from '../../types/ipc';
import { usePackStore } from '../../store/packStore';
import { JsonFileContextMenu } from '../common/JsonFileContextMenu';
import { Badge } from '../common/Badge';
import styles from './DirectoryTree.module.css';

function renderNodeIcon(node: PackFolderItemDto, isSelected: boolean) {
  if (node.isMissing) {
    return <AlertTriangle size={13} className={styles.missingFolderIcon} />;
  }

  const nameLower = (node.name || '').toLowerCase();
  const isJson = nameLower.endsWith('.json');
  const isImage =
    nameLower.endsWith('.png') ||
    nameLower.endsWith('.tga') ||
    nameLower.endsWith('.jpg') ||
    nameLower.endsWith('.jpeg');
  const isText = nameLower.endsWith('.lang') || nameLower.endsWith('.txt');
  const isCode =
    nameLower.endsWith('.material') ||
    nameLower.endsWith('.js') ||
    nameLower.endsWith('.ts');

  if (!node.isDirectory || isJson || isImage || isText || isCode) {
    const iconClass = isSelected ? styles.fileIconSelected : styles.fileIcon;
    if (isJson) return <FileJson size={16} className={iconClass} />;
    if (isImage) return <FileImage size={16} className={iconClass} />;
    if (isText) return <FileText size={16} className={iconClass} />;
    if (isCode) return <FileCode size={16} className={iconClass} />;
    return <File size={16} className={iconClass} />;
  }

  if (nameLower === 'blocks') {
    return (
      <Box
        size={16}
        className={isSelected ? styles.folderIconSelected : styles.folderIcon}
      />
    );
  }

  return (
    <Folder
      size={16}
      className={isSelected ? styles.folderIconSelected : styles.folderIcon}
    />
  );
}

export interface DirectoryTreeNodeProps {
  node: PackFolderItemDto;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onOpenManifest?: () => void;
}

export const DirectoryTreeNode: React.FC<DirectoryTreeNodeProps> = ({
  node,
  selectedPath,
  onSelect,
  onOpenManifest,
}) => {
  const packRoot = usePackStore((s) => s.packRoot);
  const hasChildren = Boolean(node.subFolders && node.subFolders.length > 0);
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null);

  const nodePath = (node.relativePath || node.name).replace(/\\/g, '/');
  const isSelected = Boolean(
    selectedPath &&
    selectedPath.replace(/\\/g, '/').toLowerCase() === nodePath.toLowerCase()
  );
  const isManifest = (node.name?.toLowerCase() === 'manifest.json' || node.relativePath?.toLowerCase() === 'manifest.json');
  const isFileNode = !node.isDirectory || /\.(json|lang|txt|material|png|tga|jpg|jpeg|js|ts)$/i.test(node.name || '');

  const resolvedFullPath = node.fullPath || (packRoot ? `${packRoot}\\${nodePath.replace(/\//g, '\\')}` : nodePath);

  const handleRowClick = () => {
    if (isManifest) {
      if (onOpenManifest) onOpenManifest();
      return;
    }
    // Clicking the already selected path clears the filter, otherwise select this node
    onSelect(isSelected ? null : nodePath);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    if (isFileNode) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenuPos({ x: e.clientX, y: e.clientY });
    }
  };

  const handleEditManifest = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onOpenManifest) onOpenManifest();
  };

  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const depthClamped = Math.max(0, Math.min(node.depth ?? 0, 8));

  return (
    <div className={styles.treeNodeContainer}>
      <div
        className={`${styles.treeRow} ${isSelected ? styles.treeRowSelected : ''} ${node.isMissing ? styles.treeRowMissing : ''}`}
        data-depth={depthClamped}
        onClick={handleRowClick}
        onContextMenu={handleContextMenu}
        title={node.fullPath || node.relativePath || node.name}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isExpanded : undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className={styles.chevronBtn}
            onClick={handleChevronClick}
            title={isExpanded ? 'Collapse directory' : 'Expand directory'}
            aria-label={isExpanded ? 'Collapse directory' : 'Expand directory'}
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className={styles.chevronSpacer} />
        )}

        {renderNodeIcon(node, isSelected)}

        <span className={styles.folderItemText}>{node.name}</span>

        <div className={styles.nodeBadges}>
          {node.isMissing && (
            <Badge variant="ghost" size="sm" title="Folder missing on disk">
              MISSING
            </Badge>
          )}
          {node.ghostCount > 0 && (
            <Badge variant="ghost" size="counter" title={`${node.ghostCount} ghost textures`}>
              {node.ghostCount}
            </Badge>
          )}
          {node.orphanCount > 0 && (
            <Badge variant="orphan" size="counter" title={`${node.orphanCount} orphan textures`}>
              {node.orphanCount}
            </Badge>
          )}
          {node.textureCount > 0 && (
            <Badge variant="neutral" size="counter" title={`${node.textureCount} textures`}>
              {node.textureCount}
            </Badge>
          )}
          {isManifest && onOpenManifest && (
            <button
              type="button"
              className={styles.editManifestBtn}
              onClick={handleEditManifest}
              title="Open Manifest Editor"
              aria-label="Edit manifest.json"
            >
              <Pencil size={11} />
            </button>
          )}
        </div>
      </div>

      {contextMenuPos && (
        <JsonFileContextMenu
          fileName={node.name}
          relativePath={node.relativePath || node.name}
          fullPath={resolvedFullPath}
          anchor={contextMenuPos}
          onClose={() => setContextMenuPos(null)}
        />
      )}

      {hasChildren && isExpanded && (
        <div className={styles.treeChildren} role="group">
          {node.subFolders.map((sub) => (
            <DirectoryTreeNode
              key={sub.relativePath || sub.fullPath || sub.name}
              node={sub}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onOpenManifest={onOpenManifest}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export interface DirectoryTreeProps {
  folders: PackFolderItemDto[];
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
  onOpenManifest?: () => void;
}

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  folders,
  selectedPath,
  onSelect,
  onOpenManifest,
}) => {
  if (!folders || folders.length === 0) {
    return (
      <div className={styles.emptyNotice}>
        Standard textures structure
      </div>
    );
  }

  return (
    <div className={styles.treeRoot} role="tree" aria-label="Pack folder hierarchy">
      {folders.map((node) => (
        <DirectoryTreeNode
          key={node.relativePath || node.fullPath || node.name}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onOpenManifest={onOpenManifest}
        />
      ))}
    </div>
  );
};
