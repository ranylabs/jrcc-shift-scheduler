import { useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'sched-rcc-theme-v1';

const DEFAULT_THEME = {
  '--weekend-bg': '#fff2cc',
  '--row-even-bg': '#ffffff',
  '--row-odd-bg': '#f6f8fb',
  '--grid-border-color': '#cbd5e1',
  '--grid-border-width': '1',
  '--divider-header-body-width': '3',
  '--divider-employee-days-width': '3',
  '--cell-height': '34',
  '--cell-height-print': '26',
  '--shift-letter-size': '16',
  '--shift-letter-weight': '600',
  '--shift-morning-text': '#0f172a',
  '--shift-night-text': '#0f172a',
  '--shift-x-text': '#0f172a',
  '--shift-morning-bg': '#d9f6eb',
  '--shift-night-bg': '#e1eaff',
  '--shift-x-bg': '#ffe6ea'
};

const CONTROL_FIELDS = [
  { key: '--weekend-bg', label: 'צבע שישי-שבת', type: 'color' },
  { key: '--row-even-bg', label: 'שורה זוגית', type: 'color' },
  { key: '--row-odd-bg', label: 'שורה אי-זוגית', type: 'color' },
  { key: '--grid-border-color', label: 'צבע קווי גריד', type: 'color' },
  { key: '--grid-border-width', label: 'עובי קו רגיל (px)', type: 'range', min: 1, max: 4, step: 1 },
  {
    key: '--divider-header-body-width',
    label: 'קו מפריד כותרת/גוף (px)',
    type: 'range',
    min: 1,
    max: 8,
    step: 1
  },
  {
    key: '--divider-employee-days-width',
    label: 'קו מפריד עובד/ימים (px)',
    type: 'range',
    min: 1,
    max: 8,
    step: 1
  },
  { key: '--cell-height', label: 'גובה תא במסך (px)', type: 'range', min: 24, max: 64, step: 1 },
  { key: '--cell-height-print', label: 'גובה תא בהדפסה (px)', type: 'range', min: 18, max: 60, step: 1 },
  { key: '--shift-letter-size', label: 'גודל אות משמרת', type: 'range', min: 10, max: 36, step: 1 },
  { key: '--shift-morning-text', label: 'צבע אות משמרת בוקר (ב)', type: 'color' },
  { key: '--shift-night-text', label: 'צבע אות משמרת לילה (ל)', type: 'color' },
  { key: '--shift-x-text', label: 'צבע אות משמרת X', type: 'color' },
  { key: '--shift-morning-bg', label: 'צבע בוקר', type: 'color' },
  { key: '--shift-night-bg', label: 'צבע לילה', type: 'color' },
  { key: '--shift-x-bg', label: 'צבע X', type: 'color' }
];

export default function ThemePanel({ open }) {
  const [theme, setTheme] = useState(DEFAULT_THEME);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      applyTheme(DEFAULT_THEME);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      const merged = { ...DEFAULT_THEME, ...parsed };
      setTheme(merged);
      applyTheme(merged);
    } catch {
      applyTheme(DEFAULT_THEME);
    }
  }, []);

  const fields = useMemo(() => CONTROL_FIELDS, []);

  const handleChange = (key, value) => {
    const next = { ...theme, [key]: value };
    setTheme(next);
    applyTheme(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const handleReset = () => {
    setTheme(DEFAULT_THEME);
    applyTheme(DEFAULT_THEME);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_THEME));
  };

  if (!open) {
    return null;
  }

  return (
    <section className="themePanel no-print no-export" dir="rtl">
      <div className="themePanel__header">
        <h3>עיצוב</h3>
        <button type="button" onClick={handleReset}>
          איפוס עיצוב
        </button>
      </div>

      <div className="themePanel__grid">
        {fields.map((field) => (
          <label key={field.key} className="themePanel__control">
            <span>{field.label}</span>
            {field.type === 'color' ? (
              <input
                type="color"
                value={theme[field.key]}
                onChange={(event) => handleChange(field.key, event.target.value)}
              />
            ) : (
              <div className="themePanel__rangeWrap">
                <input
                  type="range"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(theme[field.key])}
                  onChange={(event) => handleChange(field.key, event.target.value)}
                />
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(theme[field.key])}
                  onChange={(event) => handleChange(field.key, event.target.value)}
                />
              </div>
            )}
          </label>
        ))}
      </div>
    </section>
  );
}

function applyTheme(theme) {
  const root = document.documentElement;

  Object.entries(theme).forEach(([key, value]) => {
    if (key.includes('width') || key.includes('height') || key.includes('size')) {
      root.style.setProperty(key, `${Number(value)}px`);
      return;
    }

    root.style.setProperty(key, value);
  });
}
