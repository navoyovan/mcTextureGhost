// frontend/src/components/json/JsonReader.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Layers,
  RotateCw,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes, ManifestModelDto } from '../../types/ipc';
import { ManifestForm } from './ManifestForm';
import { SearchInput } from '../common/SearchInput';
import styles from './JsonReader.module.css';

export interface JsonReaderProps {
  filePath: string;
  onBack: () => void;
}

/**
 * Tokenizes a single line of JSON into colored spans.
 */
function renderHighlightedLine(line: string): React.ReactNode {
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

function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function createDefaultManifest(packName: string | null, packRoot: string | null): ManifestModelDto {
  return {
    headerName: packName || 'Bedrock Resource Pack',
    headerDescription: 'Bedrock resource pack created with McTextureGhost',
    headerUuid: generateUuid(),
    versionMajor: 1,
    versionMinor: 0,
    versionPatch: 0,
    minEngineMajor: 1,
    minEngineMinor: 20,
    minEnginePatch: 0,
    moduleUuid: generateUuid(),
    moduleType: 'resources',
    moduleVersionMajor: 1,
    moduleVersionMinor: 0,
    moduleVersionPatch: 0,
    formatVersion: 2,
    fileExists: false,
    filePath: packRoot ? `${packRoot}\\manifest.json` : null,
    versionString: '1.0.0',
    minEngineString: '1.20.0',
    version: [1, 0, 0],
    minEngineVersion: [1, 20, 0],
    moduleVersion: [1, 0, 0],
  };
}

export const JsonReader: React.FC<JsonReaderProps> = ({ filePath, onBack }) => {
  const packRoot = usePackStore((s) => s.packRoot);
  const packName = usePackStore((s) => s.packName);
  const rawManifest = usePackStore((s) => s.manifest);
  const hasManifest = usePackStore((s) => s.hasManifest);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const { postCommand, saveManifest } = useIpc();

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

  // Standard JSON file loading state
  const [rawText, setRawText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Manifest Form state
  const [manifestForm, setManifestForm] = useState<ManifestModelDto | null>(() => {
    if (rawManifest) return { ...rawManifest };
    if (!hasManifest) return createDefaultManifest(packName, packRoot);
    return null;
  });
  const [isManifestDirty, setIsManifestDirty] = useState<boolean>(false);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

  useEffect(() => {
    if (rawManifest && !isManifestDirty) {
      setManifestForm({ ...rawManifest });
    }
  }, [rawManifest, isManifestDirty]);

  const loadFileContent = useCallback(async () => {
    if (isManifest) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setLoadError(null);

    try {
      const url = `https://pack.local/${cleanPath}?t=${Date.now()}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText})`);
      }
      const text = await res.text();
      try {
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
  }, [cleanPath, isManifest]);

  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  // Serialized JSON for display (either live from manifest form or from disk for standard json)
  const currentForm = manifestForm || createDefaultManifest(packName, packRoot);

  const manifestJsonString = useMemo(() => {
    if (!isManifest) return '';
    const output = {
      format_version: currentForm.formatVersion || 2,
      header: {
        name: currentForm.headerName || '',
        description: currentForm.headerDescription || '',
        uuid: currentForm.headerUuid,
        version: [
          Number(currentForm.versionMajor) || 0,
          Number(currentForm.versionMinor) || 0,
          Number(currentForm.versionPatch) || 0,
        ],
        min_engine_version: [
          Number(currentForm.minEngineMajor) || 1,
          Number(currentForm.minEngineMinor) || 20,
          Number(currentForm.minEnginePatch) || 0,
        ],
      },
      modules: [
        {
          type: currentForm.moduleType || 'resources',
          uuid: currentForm.moduleUuid,
          version: [
            Number(currentForm.moduleVersionMajor) || 0,
            Number(currentForm.moduleVersionMinor) || 0,
            Number(currentForm.moduleVersionPatch) || 0,
          ],
        },
      ],
    };
    return JSON.stringify(output, null, 2);
  }, [isManifest, currentForm]);

  const activeJsonText = isManifest ? manifestJsonString : rawText;

  const lines = useMemo(() => {
    if (!activeJsonText) return [];
    return activeJsonText.split(/\r?\n/);
  }, [activeJsonText]);

  const lineCount = lines.length;
  const byteSize = useMemo(() => {
    return new Blob([activeJsonText]).size;
  }, [activeJsonText]);

  const formattedSize = useMemo(() => {
    if (byteSize < 1024) return `${byteSize} B`;
    return `${(byteSize / 1024).toFixed(1)} KB`;
  }, [byteSize]);

  const handleCopy = useCallback(() => {
    if (!activeJsonText) return;
    navigator.clipboard.writeText(activeJsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [activeJsonText]);

  const handleOpenInEditor = useCallback(() => {
    if (!fullDiskPath) return;
    postCommand(IpcMessageTypes.TextureEdit, {
      aliasKey: fileName,
      fullPath: fullDiskPath,
      isGhost: false,
    });
  }, [fullDiskPath, fileName, postCommand]);

  const handleSaveManifest = useCallback(() => {
    const payload: ManifestModelDto = {
      ...currentForm,
      filePath: currentForm.filePath || (packRoot ? `${packRoot}\\manifest.json` : null),
    };
    saveManifest(payload);
    setIsManifestDirty(false);
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2500);
  }, [currentForm, packRoot, saveManifest]);

  const handleManifestFormChange = useCallback((updated: ManifestModelDto) => {
    setManifestForm(updated);
    setIsManifestDirty(true);
  }, []);

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
        </div>

        <div className={styles.headerRight}>
          <span className={styles.statsBadge}>
            {lineCount} lines • {formattedSize}
          </span>

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

      {/* 2. Body: Either Split Manifest Editor or Standard JSON Code Viewport */}
      {isManifest ? (
        <div className={styles.splitContentArea}>
          <ManifestForm
            form={currentForm}
            onChange={handleManifestFormChange}
            onSave={handleSaveManifest}
            isDirty={isManifestDirty}
            isSavedRecently={isSavedRecently}
          />
          <div className={styles.previewColumn}>
            <div className={styles.codeViewport}>
              <div className={styles.gutter}>
                {lines.map((_, i) => (
                  <div key={i + 1} className={styles.gutterLine}>
                    {i + 1}
                  </div>
                ))}
              </div>
              <div className={styles.codeContent}>
                {lines.map((line, i) => (
                  <div key={i} className={styles.codeLine}>
                    {renderHighlightedLine(line)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Search Sub-bar */}
          <div className={styles.searchBar}>
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search in JSON..."
              shortcutCue="/"
              enableSlashShortcut={true}
              size="sm"
              wrapperClassName={styles.jsonSearchWrapper}
            />

            {searchQuery.trim() && (
              <span className={styles.matchCountBadge}>
                {matchingLines.size} {matchingLines.size === 1 ? 'match' : 'matches'} found
              </span>
            )}
          </div>

          {/* Code Viewport */}
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
              <div className={styles.gutter}>
                {lines.map((_, i) => (
                  <div key={i + 1} className={styles.gutterLine}>
                    {i + 1}
                  </div>
                ))}
              </div>
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
        </>
      )}
    </div>
  );
};
