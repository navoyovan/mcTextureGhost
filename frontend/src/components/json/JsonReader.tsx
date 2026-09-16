// frontend/src/components/json/JsonReader.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  FileJson,
  Copy,
  Check,
  Search,
  X,
  ExternalLink,
  Layers,
  Sparkles,
  RotateCw,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes } from '../../types/ipc';
import styles from './JsonReader.module.css';

export interface JsonReaderProps {
  filePath: string;
  onBack: () => void;
}

/**
 * Tokenizes a single line of JSON into colored spans.
 */
function renderHighlightedLine(line: string): React.ReactNode {
  // Regex pattern matching JSON tokens
  const tokenRegex = /("(?:\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(?:\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:])/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(line)) !== null) {
    const textBefore = line.substring(lastIndex, match.index);
    if (textBefore) {
      parts.push(textBefore);
    }

    const token = match[0];
    let className: string = '';

    if (token.endsWith(':')) {
      // Key: "propertyName":
      const keyName = token.slice(0, -1);
      parts.push(
        <span key={`${match.index}-key`} className={styles.tokenKey || ''}>
          {keyName}
        </span>
      );
      parts.push(
        <span key={`${match.index}-colon`} className={styles.tokenPunctuation || ''}>
          :
        </span>
      );
      lastIndex = tokenRegex.lastIndex;
      continue;
    } else if (token.startsWith('"')) {
      className = styles.tokenString || '';
    } else if (token === 'true' || token === 'false') {
      className = styles.tokenBoolean || '';
    } else if (token === 'null') {
      className = styles.tokenNull || '';
    } else if (/^-?\d/.test(token)) {
      className = styles.tokenNumber || '';
    } else if (/^[{}\[\],]$/.test(token)) {
      className = styles.tokenPunctuation || '';
    }

    parts.push(
      <span key={match.index} className={className}>
        {token}
      </span>
    );
    lastIndex = tokenRegex.lastIndex;
  }

  const textAfter = line.substring(lastIndex);
  if (textAfter) {
    parts.push(textAfter);
  }

  return parts;
}

export const JsonReader: React.FC<JsonReaderProps> = ({ filePath, onBack }) => {
  const packRoot = usePackStore((s) => s.packRoot);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const { postCommand } = useIpc();

  const [rawText, setRawText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const cleanPath = useMemo(() => {
    return filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  }, [filePath]);

  const fileName = useMemo(() => {
    return cleanPath.split('/').pop() || cleanPath;
  }, [cleanPath]);

  const fullDiskPath = useMemo(() => {
    if (!packRoot) return null;
    return `${packRoot}\\${cleanPath.replace(/\//g, '\\')}`;
  }, [packRoot, cleanPath]);

  const isManifest = useMemo(() => {
    return fileName.toLowerCase() === 'manifest.json' || cleanPath.toLowerCase() === 'manifest.json';
  }, [fileName, cleanPath]);

  const isEntity = useMemo(() => {
    return cleanPath.startsWith('entity/') || cleanPath.startsWith('attachables/') || fileName.endsWith('.entity.json');
  }, [cleanPath, fileName]);

  const loadFileContent = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      // Fetch via virtual host pack.local
      const url = `https://pack.local/${cleanPath}?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText})`);
      }
      const text = await res.text();
      try {
        // Try pretty printing if valid JSON
        const parsed = JSON.parse(text);
        setRawText(JSON.stringify(parsed, null, 2));
      } catch {
        setRawText(text);
      }
    } catch (err: any) {
      setLoadError(err?.message || 'Could not load file from disk.');
    } finally {
      setIsLoading(false);
    }
  }, [cleanPath]);

  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  const lines = useMemo(() => {
    if (!rawText) return [];
    return rawText.split(/\r?\n/);
  }, [rawText]);

  const lineCount = lines.length;
  const byteSize = useMemo(() => {
    return new Blob([rawText]).size;
  }, [rawText]);

  const formattedSize = useMemo(() => {
    if (byteSize < 1024) return `${byteSize} B`;
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }, [byteSize]);

  const handleCopy = useCallback(() => {
    if (!rawText) return;
    navigator.clipboard.writeText(rawText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [rawText]);

  const handleOpenInEditor = useCallback(() => {
    if (!fullDiskPath) return;
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: fileName,
      fullPath: fullDiskPath,
      isGhost: false,
    });
  }, [fullDiskPath, fileName, postCommand]);

  const matchingLines = useMemo(() => {
    if (!searchQuery.trim()) return new Set<number>();
    const query = searchQuery.toLowerCase();
    const matches = new Set<number>();
    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(query)) {
        matches.add(index);
      }
    });
    return matches;
  }, [lines, searchQuery]);

  return (
    <div className={styles.container} data-testid="json-reader">
      {/* 1. Header Toolbar */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={onBack}
            title="Return to Pack Grid"
          >
            <ArrowLeft size={13} />
            <span>Grid</span>
          </button>

          <div className={styles.fileIconBadge}>
            <FileJson size={16} />
          </div>

          <div className={styles.fileMetaGroup}>
            <span className={styles.fileNameTitle} title={fileName}>
              {fileName}
            </span>
            <span className={styles.filePathBadge} title={cleanPath}>
              {cleanPath}
            </span>
          </div>
        </div>

        <div className={styles.headerRight}>
          <span className={styles.statsBadge}>
            {lineCount} lines • {formattedSize}
          </span>

          {isManifest && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnHighlight}`}
              onClick={() => {
                onBack();
                setActiveView('manifest');
              }}
              title="Open structured Manifest Editor"
            >
              <Sparkles size={13} />
              <span>Visual Editor</span>
            </button>
          )}

          {isEntity && (
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnHighlight}`}
              onClick={() => {
                onBack();
                setActiveView('entity');
              }}
              title="Open Entity Workspace with 3D Model View"
            >
              <Layers size={13} />
              <span>3D Workspace</span>
            </button>
          )}

          <button
            type="button"
            className={styles.actionBtn}
            onClick={handleOpenInEditor}
            title="Open in external system editor"
          >
            <ExternalLink size={13} />
            <span>Open in Editor</span>
          </button>

          <button
            type="button"
            className={`${styles.actionBtn} ${copied ? styles.actionBtnSuccess : ''}`}
            onClick={handleCopy}
            title="Copy entire JSON to clipboard"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>
      </header>

      {/* 2. Search Sub-bar */}
      <div className={styles.searchBar}>
        <div className={styles.searchInputGroup}>
          <Search size={13} className={styles.searchIcon} />
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search in JSON..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.searchClearBtn}
              onClick={() => setSearchQuery('')}
              title="Clear search"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {searchQuery.trim() && (
          <span className={styles.matchCountBadge}>
            {matchingLines.size} {matchingLines.size === 1 ? 'match' : 'matches'} found
          </span>
        )}
      </div>

      {/* 3. Code Viewport */}
      {isLoading ? (
        <div className={styles.loadingContainer}>
          <RotateCw size={24} className="spin" />
          <span>Reading JSON from pack...</span>
        </div>
      ) : loadError ? (
        <div className={styles.errorContainer}>
          <h3 className={styles.errorTitle}>Failed to Load JSON</h3>
          <p className={styles.errorDesc}>{loadError}</p>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={loadFileContent}
          >
            <RotateCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <div className={styles.codeViewport}>
          {/* Line Numbers Gutter */}
          <div className={styles.gutter}>
            {lines.map((_, i) => (
              <div key={i + 1} className={styles.gutterLine}>
                {i + 1}
              </div>
            ))}
          </div>

          {/* Code Text Content */}
          <div className={styles.codeContent}>
            {lines.map((line, i) => {
              const isMatch = matchingLines.has(i);
              return (
                <div
                  key={i}
                  className={`${styles.codeLine} ${isMatch ? styles.codeLineHighlight : ''}`}
                >
                  {renderHighlightedLine(line)}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
