// frontend/src/components/manifest/ManifestEditor.tsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Save,
  RefreshCw,
  Copy,
  Check,
  FileCode,
  Sparkles,
  Layers,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { useIpc } from '../../hooks/useIpc';
import { ManifestModelDto } from '../../types/ipc';
import styles from './ManifestEditor.module.css';

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

export const ManifestEditor: React.FC = () => {
  const packRoot = usePackStore((s) => s.packRoot);
  const packName = usePackStore((s) => s.packName);
  const rawManifest = usePackStore((s) => s.manifest);
  const hasManifest = usePackStore((s) => s.hasManifest);
  const setActiveView = usePackStore((s) => s.setActiveView);
  const { saveManifest } = useIpc();

  // If a manifest already exists on disk, never seed with dummy generated UUIDs.
  // Wait for the actual parsed manifest from backend.
  const [form, setForm] = useState<ManifestModelDto | null>(() => {
    if (rawManifest) return { ...rawManifest };
    if (!hasManifest) return createDefaultManifest(packName, packRoot);
    return null;
  });

  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSavedRecently, setIsSavedRecently] = useState<boolean>(false);

  useEffect(() => {
    if (rawManifest && !isDirty) {
      setForm({ ...rawManifest });
    }
  }, [rawManifest, isDirty]);

  // If manifest file exists on disk but store has not finished loading it yet, wait
  if (hasManifest && !rawManifest && !form) {
    return (
      <div className={styles.container} data-testid="manifest-editor">
        <header className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              className={styles.backBtn}
              onClick={() => setActiveView('grid')}
            >
              <ArrowLeft size={13} />
              <span>Pack Grid</span>
            </button>
            <span className={styles.headerTitle}>Manifest Editor</span>
          </div>
        </header>
        <div style={{ padding: 48, textAlign: 'center', color: '#a1a1aa' }}>
          Loading existing manifest.json from disk...
        </div>
      </div>
    );
  }

  const currentForm = form || createDefaultManifest(packName, packRoot);

  const updateField = <K extends keyof ManifestModelDto>(key: K, value: ManifestModelDto[K]) => {
    setForm((prev) => {
      const base = prev || currentForm;
      const next = { ...base, [key]: value };
      if (key === 'versionMajor' || key === 'versionMinor' || key === 'versionPatch') {
        const maj = key === 'versionMajor' ? Number(value) : base.versionMajor;
        const min = key === 'versionMinor' ? Number(value) : base.versionMinor;
        const pat = key === 'versionPatch' ? Number(value) : base.versionPatch;
        next.version = [maj, min, pat];
        next.versionString = `${maj}.${min}.${pat}`;
      }
      if (key === 'minEngineMajor' || key === 'minEngineMinor' || key === 'minEnginePatch') {
        const maj = key === 'minEngineMajor' ? Number(value) : base.minEngineMajor;
        const min = key === 'minEngineMinor' ? Number(value) : base.minEngineMinor;
        const pat = key === 'minEnginePatch' ? Number(value) : base.minEnginePatch;
        next.minEngineVersion = [maj, min, pat];
        next.minEngineString = `${maj}.${min}.${pat}`;
      }
      if (key === 'moduleVersionMajor' || key === 'moduleVersionMinor' || key === 'moduleVersionPatch') {
        const maj = key === 'moduleVersionMajor' ? Number(value) : base.moduleVersionMajor;
        const min = key === 'moduleVersionMinor' ? Number(value) : base.moduleVersionMinor;
        const pat = key === 'moduleVersionPatch' ? Number(value) : base.moduleVersionPatch;
        next.moduleVersion = [maj, min, pat];
      }
      return next;
    });
    setIsDirty(true);
  };

  const handleCopy = (text: string, fieldKey: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
      setCopiedField(fieldKey);
      setTimeout(() => setCopiedField(null), 1800);
    }
  };

  const handleRegenerateAllUuids = () => {
    setForm((prev) => ({
      ...(prev || currentForm),
      headerUuid: generateUuid(),
      moduleUuid: generateUuid(),
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    const payloadToSave: ManifestModelDto = {
      ...currentForm,
      fileExists: true,
      filePath: currentForm.filePath || (packRoot ? `${packRoot}\\manifest.json` : null),
    };
    saveManifest(payloadToSave);
    setIsDirty(false);
    setIsSavedRecently(true);
    setTimeout(() => setIsSavedRecently(false), 2500);
  };

  // Canonical Minecraft Bedrock JSON preview structure
  const jsonPreviewString = useMemo(() => {
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
  }, [currentForm]);

  const filePathDisplay = currentForm.filePath || (packRoot ? `${packRoot}\\manifest.json` : 'manifest.json');

  return (
    <div className={styles.container} data-testid="manifest-editor">
      {/* 1. Header Bar */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.backBtn}
            onClick={() => setActiveView('grid')}
            title="Back to Pack Grid"
          >
            <ArrowLeft size={13} />
            <span>Pack Grid</span>
          </button>

          <div className={styles.headerTitleWrapper}>
            <div className={styles.titleRow}>
              <span className={styles.headerTitle}>Manifest Editor</span>
              {isDirty ? (
                <span className={styles.statusBadgeDirty}>Unsaved changes</span>
              ) : hasManifest || currentForm.fileExists ? (
                <span className={styles.statusBadgeExists}>manifest.json</span>
              ) : (
                <span className={styles.statusBadgeMissing}>Not created yet</span>
              )}
            </div>
            <span className={styles.manifestPath} title={filePathDisplay}>
              {filePathDisplay}
            </span>
          </div>
        </div>

        <div className={styles.headerActions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.secondaryBtn}`}
            onClick={handleRegenerateAllUuids}
            title="Regenerate all UUIDs in manifest"
          >
            <RefreshCw size={13} />
            <span>New UUIDs</span>
          </button>

          <button
            type="button"
            className={`${styles.actionBtn} ${styles.primaryBtn}`}
            onClick={handleSave}
            title="Save manifest.json"
          >
            {isSavedRecently ? <Check size={13} /> : <Save size={13} />}
            <span>{isSavedRecently ? 'Saved!' : 'Save Manifest'}</span>
          </button>
        </div>
      </header>

      {/* 2. Main Content Split View */}
      <div className={styles.contentArea}>
        {/* Form Column */}
        <div className={styles.formColumn}>
          {/* Header Metadata Section */}
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <Sparkles size={14} /> Pack Identity (Header)
              </span>
              <span className={styles.sectionSubtitle}>Primary metadata exposed in Bedrock UI</span>
            </div>

            {/* Pack Name */}
            <div className={styles.formGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.label} htmlFor="manifest-name">Pack Name</label>
                <span className={styles.helperText}>header.name</span>
              </div>
              <input
                id="manifest-name"
                type="text"
                className={styles.input}
                value={currentForm.headerName || ''}
                placeholder="Resource pack title"
                onChange={(e) => updateField('headerName', e.target.value)}
              />
            </div>

            {/* Description */}
            <div className={styles.formGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.label} htmlFor="manifest-desc">Description</label>
                <span className={styles.helperText}>header.description</span>
              </div>
              <textarea
                id="manifest-desc"
                className={`${styles.input} ${styles.textarea}`}
                value={currentForm.headerDescription || ''}
                placeholder="Pack description displayed in settings"
                onChange={(e) => updateField('headerDescription', e.target.value)}
              />
            </div>

            {/* Header UUID */}
            <div className={styles.formGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.label} htmlFor="manifest-header-uuid">Header UUID (Pack ID)</label>
                <span className={styles.helperText}>header.uuid</span>
              </div>
              <div className={styles.uuidInputGroup}>
                <input
                  id="manifest-header-uuid"
                  type="text"
                  className={styles.uuidInput}
                  value={currentForm.headerUuid || ''}
                  onChange={(e) => updateField('headerUuid', e.target.value)}
                />
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => updateField('headerUuid', generateUuid())}
                  title="Generate new Header UUID"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => handleCopy(currentForm.headerUuid, 'headerUuid')}
                  title="Copy UUID"
                >
                  {copiedField === 'headerUuid' ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            {/* Version & Min Engine Version Row */}
            <div className={styles.versionRow}>
              {/* Pack Version */}
              <div className={styles.formGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.label}>Pack Version</label>
                  <span className={styles.helperText}>header.version</span>
                </div>
                <div className={styles.versionInputsGroup}>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.versionMajor}
                    onChange={(e) => updateField('versionMajor', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className={styles.versionDot}>.</span>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.versionMinor}
                    onChange={(e) => updateField('versionMinor', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className={styles.versionDot}>.</span>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.versionPatch}
                    onChange={(e) => updateField('versionPatch', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>

              {/* Min Engine Version */}
              <div className={styles.formGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.label}>Min Engine Version</label>
                  <span className={styles.helperText}>min_engine_version</span>
                </div>
                <div className={styles.versionInputsGroup}>
                  <input
                    type="number"
                    min="1"
                    className={styles.versionNumberInput}
                    value={currentForm.minEngineMajor}
                    onChange={(e) => updateField('minEngineMajor', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className={styles.versionDot}>.</span>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.minEngineMinor}
                    onChange={(e) => updateField('minEngineMinor', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className={styles.versionDot}>.</span>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.minEnginePatch}
                    onChange={(e) => updateField('minEnginePatch', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            </div>
          </section>

          {/* Module Metadata Section */}
          <section className={styles.cardSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <Layers size={14} /> Resource Module
              </span>
              <span className={styles.sectionSubtitle}>Client resource payload definition</span>
            </div>

            {/* Module UUID */}
            <div className={styles.formGroup}>
              <div className={styles.fieldLabelRow}>
                <label className={styles.label} htmlFor="manifest-module-uuid">Module UUID</label>
                <span className={styles.helperText}>modules[0].uuid</span>
              </div>
              <div className={styles.uuidInputGroup}>
                <input
                  id="manifest-module-uuid"
                  type="text"
                  className={styles.uuidInput}
                  value={currentForm.moduleUuid || ''}
                  onChange={(e) => updateField('moduleUuid', e.target.value)}
                />
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => updateField('moduleUuid', generateUuid())}
                  title="Generate new Module UUID"
                >
                  <RefreshCw size={12} />
                </button>
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => handleCopy(currentForm.moduleUuid, 'moduleUuid')}
                  title="Copy UUID"
                >
                  {copiedField === 'moduleUuid' ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            </div>

            {/* Module Type & Version */}
            <div className={styles.versionRow}>
              <div className={styles.formGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.label} htmlFor="manifest-module-type">Module Type</label>
                  <span className={styles.helperText}>modules[0].type</span>
                </div>
                <input
                  id="manifest-module-type"
                  type="text"
                  className={styles.input}
                  value={currentForm.moduleType || 'resources'}
                  onChange={(e) => updateField('moduleType', e.target.value)}
                />
              </div>

              <div className={styles.formGroup}>
                <div className={styles.fieldLabelRow}>
                  <label className={styles.label}>Module Version</label>
                  <span className={styles.helperText}>modules[0].version</span>
                </div>
                <div className={styles.versionInputsGroup}>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.moduleVersionMajor}
                    onChange={(e) => updateField('moduleVersionMajor', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className={styles.versionDot}>.</span>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.moduleVersionMinor}
                    onChange={(e) => updateField('moduleVersionMinor', parseInt(e.target.value, 10) || 0)}
                  />
                  <span className={styles.versionDot}>.</span>
                  <input
                    type="number"
                    min="0"
                    className={styles.versionNumberInput}
                    value={currentForm.moduleVersionPatch}
                    onChange={(e) => updateField('moduleVersionPatch', parseInt(e.target.value, 10) || 0)}
                  />
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Right JSON Preview Column */}
        <div className={styles.previewColumn}>
          <div className={styles.previewHeader}>
            <span className={styles.previewTitle}>
              <FileCode size={13} /> JSON Output Preview
            </span>
            <button
              type="button"
              className={styles.copyCodeBtn}
              onClick={() => handleCopy(jsonPreviewString, 'jsonPreview')}
              title="Copy formatted JSON to clipboard"
            >
              {copiedField === 'jsonPreview' ? <Check size={12} /> : <Copy size={12} />}
              <span>{copiedField === 'jsonPreview' ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
          <pre className={styles.jsonCodeArea}>{jsonPreviewString}</pre>
        </div>
      </div>
    </div>
  );
};
