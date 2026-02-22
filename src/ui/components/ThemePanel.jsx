const FONT_SCALE_OPTIONS = [
  { value: 1, label: '100%' },
  { value: 1.1, label: '110%' },
  { value: 1.2, label: '120%' }
];

export default function ThemePanel({ open, theme, onThemeChange }) {
  if (!open) {
    return null;
  }

  return (
    <section className="themePanel no-print no-export" dir="rtl">
      <div className="themePanel__header">
        <h3>עיצוב</h3>
      </div>

      <div className="themePanel__grid">
        <label className="themePanel__control">
          <span>וריאנט</span>
          <select
            value={theme.variant}
            onChange={(event) => onThemeChange({ variant: event.target.value })}
          >
            <option value="default">רגיל</option>
            <option value="compact">קומפקטי</option>
            <option value="contrast">ניגודיות גבוהה</option>
          </select>
        </label>

        <label className="themePanel__control">
          <span>גודל טקסט</span>
          <select
            value={String(theme.fontScale)}
            onChange={(event) => onThemeChange({ fontScale: Number(event.target.value) })}
          >
            {FONT_SCALE_OPTIONS.map((option) => (
              <option key={option.value} value={String(option.value)}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="themePanel__control">
          <span>סגנון כותרת</span>
          <select
            value={theme.headerStyle}
            onChange={(event) => onThemeChange({ headerStyle: event.target.value })}
          >
            <option value="green">ירוק</option>
            <option value="dark">כהה</option>
            <option value="light">בהיר</option>
          </select>
        </label>

        <label className="themePanel__control">
          <span>קווי גבול</span>
          <select
            value={theme.thickBorders}
            onChange={(event) => onThemeChange({ thickBorders: event.target.value })}
          >
            <option value="none">רגיל</option>
            <option value="sundaysOnly">מודגש בראשון</option>
            <option value="custom">מודגש בכל הגריד</option>
          </select>
        </label>

        <label className="themePanel__toggle">
          <input
            type="checkbox"
            checked={theme.zebraRows}
            onChange={(event) => onThemeChange({ zebraRows: event.target.checked })}
          />
          <span>שורות זברה</span>
        </label>
      </div>
    </section>
  );
}
