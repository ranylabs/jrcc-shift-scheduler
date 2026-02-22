import { formatMonthLabel } from '../../engine/dateUtils';

export default function Toolbar({
  monthKey,
  canUndo,
  canRedo,
  busy,
  cloudStatus,
  onMonthChange,
  onMonthShift,
  onUndo,
  onRedo,
  onAutoFill,
  onClearGenerated,
  compactMode,
  onToggleCompactMode,
  onToggleThemePanel,
  onSave,
  onLoad,
  onExportPdf
}) {
  return (
    <div className="toolbar no-print">
      <div className="toolbar__group">
        <button type="button" onClick={() => onMonthShift(-1)}>
          חודש קודם
        </button>
        <input type="month" value={monthKey} onChange={(event) => onMonthChange(event.target.value)} />
        <button type="button" onClick={() => onMonthShift(1)}>
          חודש הבא
        </button>
        <span className="toolbar__monthLabel">{formatMonthLabel(monthKey)}</span>
      </div>

      <div className="toolbar__group">
        <button type="button" disabled={!canUndo} onClick={onUndo}>
          בטל
        </button>
        <button type="button" disabled={!canRedo} onClick={onRedo}>
          בצע מחדש
        </button>
        <button type="button" onClick={onAutoFill}>
          מחולל משמרות
        </button>
        <button type="button" onClick={onClearGenerated}>
          נקה משמרות מחולל
        </button>
        <button type="button" onClick={onToggleCompactMode}>
          {compactMode ? 'תצוגה רגילה' : 'תצוגה קומפקטית'}
        </button>
        <button type="button" onClick={onToggleThemePanel}>
          עיצוב
        </button>
        <button type="button" disabled={busy} onClick={onSave}>
          שמירה
        </button>
        <button type="button" disabled={busy} onClick={onLoad}>
          טעינה
        </button>
        <button type="button" onClick={onExportPdf}>
          ייצוא PDF
        </button>
      </div>

      <div className="toolbar__cloud" aria-live="polite">
        {cloudStatus}
      </div>
    </div>
  );
}