// frontend/src/components/catalog/CatalogFab.tsx
// Standalone always-visible "Explore Catalog" floating action element.
// - Wide viewport: fixed bottom-left card with hover-reveal reference picker stack
// - Narrow viewport (≤860px): full-width sticky bar pinned to the bottom of workspaceContentArea

import React, { useState, useRef, useMemo } from 'react';
import { BookOpen, X } from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { IpcMessageTypes } from '../../types/ipc';
import { Badge } from '../common/Badge';
import styles from './CatalogFab.module.css';

export const CatalogFab: React.FC = () => {
  const { postCommand } = useIpc();
  const packRoot = usePackStore((s) => s.packRoot);
  const isCatalogOpen = usePackStore((s) => s.isCatalogOpen);
  const setIsCatalogOpen = usePackStore((s) => s.setIsCatalogOpen);
  const referencePacks = usePackStore((s) => s.referencePacks);
  const activeReferenceId = usePackStore((s) => s.activeReferenceId);
  const setActiveReferenceId = usePackStore((s) => s.setActiveReferenceId);

  const [isHovered, setIsHovered] = useState(false);
  const [catalogIconLoadError, setCatalogIconLoadError] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const vanillaPackIconLocal = 'https://vanilla.local/pack_icon.png';
  const vanillaPackIconRemote = 'https://raw.githubusercontent.com/Mojang/bedrock-samples/main/resource_pack/pack_icon.png';
  const [vanillaIconSrc, setVanillaIconSrc] = useState<string>(vanillaPackIconLocal);

  const activeReference = useMemo(() => {
    return referencePacks?.find((p) => p.id === activeReferenceId) || referencePacks?.[0] || {
      id: 'vanilla',
      name: 'Vanilla Bedrock',
      version: '1.21.x',
      description: 'Mojang bedrock-samples official reference database',
      iconUrl: 'https://vanilla.local/pack_icon.png',
      isVanilla: true,
    };
  }, [referencePacks, activeReferenceId]);

  const customReference = useMemo(() => {
    return referencePacks?.find((p) => !p.isVanilla) || null;
  }, [referencePacks]);

  const handleCatalogIconError = () => {
    if (vanillaIconSrc === vanillaPackIconLocal) {
      setVanillaIconSrc(vanillaPackIconRemote);
    } else {
      setCatalogIconLoadError(true);
    }
  };

  const handleMouseEnter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => setIsHovered(true), 120);
  };

  const handleMouseLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setIsHovered(false);
  };

  // Only show when a pack is loaded
  if (!packRoot) return null;

  const catalogIcon = activeReference.isVanilla ? vanillaIconSrc : activeReference.iconUrl;

  return (
    <div
      className={`${styles.fabRoot} ${isCatalogOpen ? styles.fabRootOpen : ''} ${isHovered ? styles.fabRootHovered : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Floating reference picker stack — revealed on hover */}
      <div className={styles.floatingStack}>
        {/* Vanilla Bedrock Reference */}
        <button
          type="button"
          className={`${styles.floatingCard} ${activeReferenceId === 'vanilla' ? styles.floatingCardActive : ''}`}
          title="Vanilla Bedrock Reference Catalog"
          aria-label="Vanilla Bedrock Reference"
          onClick={(e) => {
            e.stopPropagation();
            setActiveReferenceId('vanilla');
            postCommand(IpcMessageTypes.CatalogSetReference, { id: 'vanilla' });
          }}
        >
          <div className={styles.floatingCardIcon}>
            <img
              src={vanillaIconSrc}
              alt="Vanilla Pack Icon"
              className={styles.floatingCardImg}
              onError={handleCatalogIconError}
            />
          </div>
          <div className={styles.floatingCardMeta}>
            <div className={styles.floatingCardTitleRow}>
              <span className={styles.floatingCardTitle}>Vanilla Bedrock</span>
              <Badge variant="mono" size="sm">1.21.x</Badge>
            </div>
            <span className={styles.floatingCardSubtitle}>
              {activeReferenceId === 'vanilla' ? 'Active reference' : 'Click to select vanilla'}
            </span>
          </div>
          {activeReferenceId === 'vanilla' && <span className={styles.floatingCardCheck}>✓</span>}
        </button>

        {/* Custom Reference */}
        {customReference ? (
          <div className={styles.customCardWrapper}>
            <button
              type="button"
              className={`${styles.floatingCard} ${activeReferenceId === customReference.id ? styles.floatingCardActive : ''}`}
              title={`Custom Reference: ${customReference.name}. Click to select, or right-click to change folder.`}
              aria-label="Custom Reference Pack"
              onClick={(e) => {
                e.stopPropagation();
                if (activeReferenceId === customReference.id) {
                  postCommand(IpcMessageTypes.CatalogPickReference, {});
                } else {
                  setActiveReferenceId(customReference.id);
                  postCommand(IpcMessageTypes.CatalogSetReference, { id: customReference.id });
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                postCommand(IpcMessageTypes.CatalogPickReference, {});
              }}
            >
              <div className={styles.floatingCardIcon}>
                <img
                  src={customReference.iconUrl}
                  alt={customReference.name}
                  className={styles.floatingCardImg}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = 'https://vanilla.local/pack_icon.png';
                  }}
                />
              </div>
              <div className={styles.floatingCardMeta}>
                <div className={styles.floatingCardTitleRow}>
                  <span className={styles.floatingCardTitle}>{customReference.name}</span>
                  <Badge variant="mono" size="sm">{customReference.version}</Badge>
                </div>
                <span className={styles.floatingCardSubtitle}>
                  {activeReferenceId === customReference.id ? 'Active custom pack' : 'Click to select custom'}
                </span>
              </div>
              {activeReferenceId === customReference.id && <span className={styles.floatingCardCheck}>✓</span>}
            </button>
            <button
              type="button"
              className={styles.removeReferenceBtn}
              title="Remove custom reference pack"
              aria-label="Remove Custom Reference Pack"
              onClick={(e) => {
                e.stopPropagation();
                setActiveReferenceId('vanilla');
                postCommand(IpcMessageTypes.CatalogRemoveReference, { id: customReference.id });
              }}
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={`${styles.floatingCard} ${styles.floatingCardEmpty} ${styles.floatingCardDisabled}`}
            title="Custom Reference packs are coming soon"
            aria-label="Custom Reference Coming Soon"
            disabled
          >
            <div className={styles.floatingCardEmptyIcon}>
              <span>+</span>
            </div>
            <div className={styles.floatingCardMeta}>
              <span className={styles.floatingCardTitle}>Custom Reference</span>
              <span className={styles.floatingCardSubtitle}>Coming Soon</span>
            </div>
          </button>
        )}
      </div>

      {/* Main trigger card */}
      <button
        type="button"
        className={`${styles.fabCard} ${isCatalogOpen ? styles.fabCardOpen : ''}`}
        onClick={() => setIsCatalogOpen(!isCatalogOpen)}
        title={isCatalogOpen ? `Close ${activeReference.name} Catalog` : `Open ${activeReference.name} Catalog`}
        aria-label={isCatalogOpen ? `Close ${activeReference.name} Catalog` : `Open ${activeReference.name} Catalog`}
      >
        <div className={styles.fabCardIcon}>
          {!catalogIconLoadError ? (
            <img
              src={catalogIcon}
              alt={`${activeReference.name} Icon`}
              className={styles.fabCardImg}
              onError={handleCatalogIconError}
            />
          ) : (
            <BookOpen size={16} />
          )}
        </div>
        <div className={styles.fabCardMeta}>
          <span className={styles.fabCardTitle}>Explore Catalog</span>
          <span className={styles.fabCardSubtitle}>{activeReference.name}</span>
        </div>
      </button>
    </div>
  );
};
