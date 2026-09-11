import React, { useState } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  AlertTriangle,
  FileJson,
  FileText,
  FileImage,
  FileCode,
  File,
} from 'lucide-react';
import { PackFolderItemDto } from '../../types/ipc';
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
    if (isJson) return <FileJson size={13} className={iconClass} />;
    if (isImage) return <FileImage size={13} className={iconClass} />;
    if (isText) return <FileText size={13} className={iconClass} />;
    if (isCode) return <FileCode size={13} className={iconClass} />;
    return <File size={13} className={iconClass} />;
  }

  return (
    <Folder
      size={13}
      className={isSelected ? styles.folderIconSelected : styles.folderIcon}
    />
  );
}

export interface DirectoryTreeNodeProps {
  node: PackFolderItemDto;
  selectedPath: string | null;
  onSelect: (path: string | null) => void;
}

export const DirectoryTreeNode: React.FC<DirectoryTreeNodeProps> = ({
  node,
  selectedPath,
  onSelect,
}) => {
  const hasChildren = Boolean(node.subFolders && node.subFolders.length > 0);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    // Default expand top-level (depth 0) and 'textures' node
    return (node.depth ?? 0) === 0 || node.name?.toLowerCase() === 'textures';
  });

  const nodePath = node.relativePath || node.name;
  const isSelected = selectedPath === nodePath;

  const handleRowClick = () => {
    // Clicking the already selected path clears the filter, otherwise select this node
    onSelect(isSelected ? null : nodePath);
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
            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span className={styles.chevronSpacer} />
        )}

        {renderNodeIcon(node, isSelected)}

        <span className={styles.folderItemText}>{node.name}</span>

        <div className={styles.nodeBadges}>
          {node.isMissing && (
            <span className={styles.missingBadge} title="Folder missing on disk">
              MISSING
            </span>
          )}
          {node.ghostCount > 0 && (
            <span className={styles.ghostPill} title={`${node.ghostCount} ghost textures`}>
              👻 {node.ghostCount}
            </span>
          )}
          {node.textureCount > 0 && (
            <span className={styles.countPill} title={`${node.textureCount} textures`}>
              {node.textureCount}
            </span>
          )}
        </div>
      </div>

      {hasChildren && isExpanded && (
        <div className={styles.treeChildren} role="group">
          {node.subFolders.map((sub) => (
            <DirectoryTreeNode
              key={sub.relativePath || sub.fullPath || sub.name}
              node={sub}
              selectedPath={selectedPath}
              onSelect={onSelect}
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
}

export const DirectoryTree: React.FC<DirectoryTreeProps> = ({
  folders,
  selectedPath,
  onSelect,
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
        />
      ))}
    </div>
  );
};
