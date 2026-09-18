// frontend/src/components/json/ManifestForm.tsx
import React, { useState, useRef } from 'react';
import {
  Package,
  Save,
  RefreshCw,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { usePackStore } from '../../store/packStore';
import { ManifestModelDto } from '../../types/ipc';
import styles from './JsonReader.module.css';

interface VersionSegmentProps {
  value: number;
  min?: number;
  onChange: (val: number) => void;
}

const VersionSegment: React.FC<VersionSegmentProps> = ({ value, min = 0, onChange }) => {
  return (
    <div className={styles.versionFieldBox}>
      <input
        type="number"
        min={min}
        className={styles.versionSegmentInput}
        value={value}
        onChange={(e) => onChange(Math.max(min, parseInt(e.target.value, 10) || 0))}
      />
      <div className={styles.stepperArrows}>
        <button
          type="button"
          className={styles.stepperArrowBtn}
          onClick={() => onChange(value + 1)}
          tabIndex={-1}
          title="Increment"
        >
          <ChevronUp size={9} />
        </button>
        <button
          type="button"
          className={styles.stepperArrowBtn}
          onClick={() => onChange(Math.max(min, value - 1))}
          tabIndex={-1}
          title="Decrement"
        >
          <ChevronDown size={9} />
        </button>
      </div>
    </div>
  );
};

export interface ManifestFormProps {
  form: ManifestModelDto;
  onChange: (form: ManifestModelDto) => void;
  onSave?: () => void;
  isDirty?: boolean;
  isSavedRecently?: boolean;
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

export const ManifestForm: React.FC<ManifestFormProps> = ({
  form,
  onChange,
  onSave,
  isDirty,
  isSavedRecently,
}) => {
  const hasPackIcon = usePackStore((s) => s.hasPackIcon);
  const packIconUrl = usePackStore((s) => s.packIconUrl);

  const titleInputRef = useRef<HTMLInputElement>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [iconLoadError, setIconLoadError] = useState<boolean>(false);

  const updateField = <K extends keyof ManifestModelDto>(key: K, value: ManifestModelDto[K]) => {
    const next = { ...form, [key]: value };
    if (key === 'versionMajor' || key === 'versionMinor' || key === 'versionPatch') {
      const v0 = key === 'versionMajor' ? Number(value) : form.versionMajor;
      const v1 = key === 'versionMinor' ? Number(value) : form.versionMinor;
      const v2 = key === 'versionPatch' ? Number(value) : form.versionPatch;
      next.version = [v0, v1, v2];
      next.versionString = `${v0}.${v1}.${v2}`;
    }
    if (key === 'minEngineMajor' || key === 'minEngineMinor' || key === 'minEnginePatch') {
      const m0 = key === 'minEngineMajor' ? Number(value) : form.minEngineMajor;
      const m1 = key === 'minEngineMinor' ? Number(value) : form.minEngineMinor;
      const m2 = key === 'minEnginePatch' ? Number(value) : form.minEnginePatch;
      next.minEngineVersion = [m0, m1, m2];
      next.minEngineString = `${m0}.${m1}.${m2}`;
    }
    if (key === 'moduleVersionMajor' || key === 'moduleVersionMinor' || key === 'moduleVersionPatch') {
      const mv0 = key === 'moduleVersionMajor' ? Number(value) : form.moduleVersionMajor;
      const mv1 = key === 'moduleVersionMinor' ? Number(value) : form.moduleVersionMinor;
      const mv2 = key === 'moduleVersionPatch' ? Number(value) : form.moduleVersionPatch;
      next.moduleVersion = [mv0, mv1, mv2];
    }
    onChange(next);
  };

  const handleCopy = (text: string | null | undefined, fieldKey: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldKey);
    setTimeout(() => setCopiedField(null), 1800);
  };

  return (
    <div className={styles.formColumn}>
      {/* Hero Pack Overview Header */}
      <div className={styles.packHeaderSection}>
        <div className={styles.packHeaderRow}>
          <div className={styles.packIconBox}>
            {hasPackIcon && packIconUrl && !iconLoadError ? (
              <img
                src={packIconUrl}
                alt="Pack Icon"
                className={styles.packIconImg}
                onError={() => setIconLoadError(true)}
              />
            ) : (
              <Package size={56} className={styles.packIconFallback} />
            )}
          </div>

          <div className={styles.packHeaderMeta}>
            <div className={styles.packTitleWrapper}>
              <input
                ref={titleInputRef}
                id="manifest-name"
                type="text"
                className={styles.packTitleInput}
                value={form.headerName || ''}
                placeholder="Resource Pack Title"
                onChange={(e) => updateField('headerName', e.target.value)}
              />
              <button
                type="button"
                className={styles.packTitleEditBtn}
                onClick={() => {
                  titleInputRef.current?.focus();
                  titleInputRef.current?.select();
                }}
                title="Edit Pack Title"
                tabIndex={-1}
              >
                <Pencil size={13} className={styles.packTitleEditIcon} />
              </button>
            </div>
            <div className={styles.packMetaActionsRow}>
              <div className={styles.packMetaTags}>
                <span className={styles.metaPill}>Format {form.formatVersion || 2}</span>
                <span className={styles.metaPill}>{form.moduleType || 'resources'}</span>
                <span className={styles.metaPillHighlight}>v{form.versionMajor}.{form.versionMinor}.{form.versionPatch}</span>
              </div>
              <div className={styles.packMetaActionsRight}>
                {onSave && (
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${isDirty ? styles.primaryBtn : styles.secondaryBtn}`}
                    onClick={onSave}
                    title="Save manifest.json to pack"
                  >
                    {isSavedRecently ? <Check size={13} /> : <Save size={13} />}
                    <span>{isSavedRecently ? 'Saved to Disk!' : 'Save Manifest'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.divider} />

      {/* Flat Property Fields Grid */}
      <div className={styles.fieldsGrid}>
        {/* Description Row */}
        <div className={`${styles.fieldRow} ${styles.fieldRowTop}`}>
          <div className={styles.fieldLabelGroup}>
            <span className={styles.fieldLabel}>Description</span>
            <span className={styles.fieldMeta}>header.description</span>
          </div>
          <textarea
            id="manifest-desc"
            className={styles.packDescTextarea}
            value={form.headerDescription || ''}
            placeholder="Resource pack description displayed in Minecraft Bedrock…"
            rows={3}
            onChange={(e) => updateField('headerDescription', e.target.value)}
          />
        </div>
        {/* Pack Version Row */}
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelGroup}>
            <span className={styles.fieldLabel}>Pack Version</span>
            <span className={styles.fieldMeta}>header.version</span>
          </div>
          <div className={styles.versionInputs}>
            <VersionSegment
              value={form.versionMajor}
              min={0}
              onChange={(v) => updateField('versionMajor', v)}
            />
            <span className={styles.versionDot}>.</span>
            <VersionSegment
              value={form.versionMinor}
              min={0}
              onChange={(v) => updateField('versionMinor', v)}
            />
            <span className={styles.versionDot}>.</span>
            <VersionSegment
              value={form.versionPatch}
              min={0}
              onChange={(v) => updateField('versionPatch', v)}
            />
          </div>
        </div>

        {/* Min Engine Version Row */}
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelGroup}>
            <span className={styles.fieldLabel}>Min Engine Version</span>
            <span className={styles.fieldMeta}>min_engine_version</span>
          </div>
          <div className={styles.versionInputs}>
            <VersionSegment
              value={form.minEngineMajor}
              min={1}
              onChange={(v) => updateField('minEngineMajor', v)}
            />
            <span className={styles.versionDot}>.</span>
            <VersionSegment
              value={form.minEngineMinor}
              min={0}
              onChange={(v) => updateField('minEngineMinor', v)}
            />
            <span className={styles.versionDot}>.</span>
            <VersionSegment
              value={form.minEnginePatch}
              min={0}
              onChange={(v) => updateField('minEnginePatch', v)}
            />
          </div>
        </div>

        {/* Header UUID Row */}
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelGroup}>
            <span className={styles.fieldLabel}>Header UUID</span>
            <span className={styles.fieldMeta}>header.uuid</span>
          </div>
          <div className={styles.uuidFieldGroup}>
            <input
              id="manifest-header-uuid"
              type="text"
              className={styles.uuidFieldInput}
              value={form.headerUuid || ''}
              onChange={(e) => updateField('headerUuid', e.target.value)}
            />
            <button
              type="button"
              className={styles.fieldActionBtn}
              onClick={() => updateField('headerUuid', generateUuid())}
              title="Roll new Header UUID"
            >
              <RefreshCw size={12} />
            </button>
            <button
              type="button"
              className={`${styles.fieldActionBtn} ${copiedField === 'headerUuid' ? styles.fieldActionSuccess : ''}`}
              onClick={() => handleCopy(form.headerUuid, 'headerUuid')}
              title="Copy UUID"
            >
              {copiedField === 'headerUuid' ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Module UUID Row */}
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelGroup}>
            <span className={styles.fieldLabel}>Module UUID</span>
            <span className={styles.fieldMeta}>modules[0].uuid</span>
          </div>
          <div className={styles.uuidFieldGroup}>
            <input
              id="manifest-module-uuid"
              type="text"
              className={styles.uuidFieldInput}
              value={form.moduleUuid || ''}
              onChange={(e) => updateField('moduleUuid', e.target.value)}
            />
            <button
              type="button"
              className={styles.fieldActionBtn}
              onClick={() => updateField('moduleUuid', generateUuid())}
              title="Roll new Module UUID"
            >
              <RefreshCw size={12} />
            </button>
            <button
              type="button"
              className={`${styles.fieldActionBtn} ${copiedField === 'moduleUuid' ? styles.fieldActionSuccess : ''}`}
              onClick={() => handleCopy(form.moduleUuid, 'moduleUuid')}
              title="Copy UUID"
            >
              {copiedField === 'moduleUuid' ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>

        {/* Module Type Row */}
        <div className={styles.fieldRow}>
          <div className={styles.fieldLabelGroup}>
            <span className={styles.fieldLabel}>Module Type</span>
            <span className={styles.fieldMeta}>modules[0].type</span>
          </div>
          <input
            id="manifest-module-type"
            type="text"
            className={styles.textFieldInput}
            value={form.moduleType || 'resources'}
            onChange={(e) => updateField('moduleType', e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};
