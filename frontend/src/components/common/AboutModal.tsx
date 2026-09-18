// frontend/src/components/common/AboutModal.tsx
import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink, Info } from 'lucide-react';
import { useIpc } from '../../hooks/useIpc';
import styles from './AboutModal.module.css';

export interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LicenseEntry {
  id: string;
  name: string;
  license: string;
  notice: React.ReactNode;
  url: string;
}

const LICENSES: LicenseEntry[] = [
  {
    id: 'wpf-ui',
    name: 'WPF-UI',
    license: 'MIT',
    notice: 'Copyright (c) Lepoco and contributors.',
    url: 'https://github.com/lepoco/wpfui',
  },
  {
    id: 'virtualizing-wrap-panel',
    name: 'VirtualizingWrapPanel',
    license: 'MIT',
    notice: 'Copyright (c) Jan Zellner.',
    url: 'https://github.com/JanZellner/VirtualizingWrapPanel',
  },
  {
    id: 'webview2',
    name: 'Microsoft.Web.WebView2',
    license: 'Microsoft SDK',
    notice: 'Copyright (c) Microsoft Corporation.',
    url: 'https://developer.microsoft.com/en-us/microsoft-edge/webview2/',
  },
  {
    id: 'system-drawing-common',
    name: 'System.Drawing.Common',
    license: 'MIT',
    notice: 'Copyright (c) .NET Foundation and Contributors.',
    url: 'https://github.com/dotnet/runtime',
  },
  {
    id: 'react',
    name: 'React / React-DOM',
    license: 'MIT',
    notice: 'Copyright (c) Meta Platforms, Inc. and affiliates.',
    url: 'https://react.dev/',
  },
  {
    id: 'three',
    name: 'Three.js',
    license: 'MIT',
    notice: 'Copyright (c) 2010-2026 three.js authors.',
    url: 'https://threejs.org/',
  },
  {
    id: 'lucide-react',
    name: 'lucide-react',
    license: 'ISC',
    notice: 'Copyright (c) Lucide Contributors.',
    url: 'https://lucide.dev/',
  },
  {
    id: 'gsap',
    name: 'GSAP',
    license: 'GreenSock Standard',
    notice: 'Copyright (c) 2008-2026 GreenSock.',
    url: 'https://gsap.com/',
  },
  {
    id: 'portfolio-yovan',
    name: 'portfolio-yovan (Design System)',
    license: 'CC BY 4.0',
    notice: (
      <span>
        UI Components by{' '}
        <a
          href="https://navoyovan.github.io/portfolio-yovan/component-library/"
          target="_blank"
          rel="noopener noreferrer"
          className={styles.authorLink}
        >
          navoyovan
        </a>
      </span>
    ),
    url: 'https://navoyovan.github.io/portfolio-yovan/component-library/',
  },
];

export const AboutModal: React.FC<AboutModalProps> = ({ isOpen, onClose }) => {
  const { openInExplorer } = useIpc();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleOpenUrl = useCallback(
    (url: string) => {
      openInExplorer(url);
    },
    [openInExplorer]
  );

  if (!isOpen) return null;

  return createPortal(
    <div className={styles.backdrop} onMouseDown={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Top Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleWrap}>
            <Info size={15} className={styles.headerIcon} />
            <span className={styles.headerText}>About</span>
          </div>
          <button
            type="button"
            className={styles.closeButton}
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </div>

        <div className={styles.scrollContent}>
          {/* Section 1: App Info Hero */}
          <div className={styles.appHero}>
            <img src="/icon.png" alt="mcTextureGhost logo" className={styles.appLogoImg} />

            <div className={styles.appNameRow}>
              <h2 id="about-title" className={styles.appName}>
                <span>mc</span>
                <span className={styles.appNamePixel}>Texture</span>
                <span>Ghost</span>
              </h2>
              <span className={styles.appVersionBadge}>v1.0.0</span>
            </div>

            <p className={styles.appCopyright}>© 2026 navoyovan</p>

            <p className={styles.disclaimerText}>
              NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT.
            </p>
          </div>

          {/* Section 2: Open Source Licenses */}
          <div className={styles.licensesSection}>
            <div className={styles.licensesHeader}>
              <span className={styles.licensesTitle}>Open Source Licenses</span>
              <span className={styles.licensesCount}>{LICENSES.length}</span>
            </div>

            <div className={styles.licenseList}>
              {LICENSES.map((entry) => (
                <div
                  key={entry.id}
                  className={styles.licenseCard}
                  onClick={() => handleOpenUrl(entry.url)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleOpenUrl(entry.url);
                    }
                  }}
                  title={`Open ${entry.name} repository`}
                >
                  <div className={styles.licenseHeaderLeft}>
                    <div className={styles.licenseNameRow}>
                      <span className={styles.licenseName}>{entry.name}</span>
                      <span className={styles.licenseTypeBadge}>{entry.license}</span>
                    </div>
                    <p className={styles.licenseNotice}>{entry.notice}</p>
                  </div>

                  <div className={styles.licenseHeaderRight}>
                    <span className={styles.linkIconWrap} aria-hidden="true">
                      <ExternalLink size={13} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
