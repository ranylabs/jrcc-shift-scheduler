import { useMemo, useState } from 'react';
import { ROLE, WEEKDAY_LABELS } from '../../engine/constants';

const CREATE_KEY = '__create__';

const EMPTY_FORM = {
  name: '',
  targetShifts: 8,
  maxNightShifts: 6,
  maxMorningShifts: 6,
  unavailableWeekdays: [],
  role: ROLE.OPERATOR
};

export default function EmployeePanel({ employees, onAdd, onUpdate, onDelete }) {
  const [openEditorId, setOpenEditorId] = useState(null);
  const [forms, setForms] = useState({ [CREATE_KEY]: EMPTY_FORM });

  const formById = useMemo(() => {
    const next = { ...forms };

    for (const employee of employees) {
      if (!next[employee.id]) {
        next[employee.id] = mapEmployeeToForm(employee);
      }
    }

    return next;
  }, [employees, forms]);

  const toggleEditor = (id) => {
    setOpenEditorId((current) => (current === id ? null : id));
    if (id !== CREATE_KEY) {
      const employee = employees.find((item) => item.id === id);
      if (employee) {
        setForms((current) => ({ ...current, [id]: mapEmployeeToForm(employee) }));
      }
    }
  };

  const handleFormChange = (id, key, value) => {
    setForms((current) => ({
      ...current,
      [id]: {
        ...(current[id] ?? EMPTY_FORM),
        [key]: value
      }
    }));
  };

  const handleToggleWeekday = (id, weekdayIndex) => {
    const form = formById[id] ?? EMPTY_FORM;
    const checked = (form.unavailableWeekdays ?? []).includes(weekdayIndex);

    handleFormChange(
      id,
      'unavailableWeekdays',
      checked
        ? form.unavailableWeekdays.filter((day) => day !== weekdayIndex)
        : [...(form.unavailableWeekdays ?? []), weekdayIndex]
    );
  };

  const handleSubmit = (event, id) => {
    event.preventDefault();
    event.stopPropagation();

    const form = formById[id] ?? EMPTY_FORM;
    const payload = {
      ...form,
      name: form.name.trim(),
      targetShifts: Number(form.targetShifts),
      maxNightShifts: Number(form.maxNightShifts),
      maxMorningShifts: Number(form.maxMorningShifts),
      unavailableWeekdays: [...(form.unavailableWeekdays ?? [])].sort((a, b) => a - b)
    };

    if (!payload.name) {
      return;
    }

    if (id === CREATE_KEY) {
      onAdd(payload);
      setForms((current) => ({ ...current, [CREATE_KEY]: EMPTY_FORM }));
      setOpenEditorId(null);
      return;
    }

    onUpdate(id, payload);
    setOpenEditorId(null);
  };

  return (
    <aside className="employeePanel" dir="rtl">
      <div className="employeePanel__header">
        <h2>עובדים</h2>
        <button type="button" onClick={() => toggleEditor(CREATE_KEY)}>
          עובד חדש
        </button>
      </div>

      {openEditorId === CREATE_KEY ? (
        <div className="employeeEditorWrap" key="new-editor">
          <EmployeeEditor
            form={formById[CREATE_KEY] ?? EMPTY_FORM}
            submitLabel="הוספה"
            onChange={(key, value) => handleFormChange(CREATE_KEY, key, value)}
            onToggleWeekday={(weekdayIndex) => handleToggleWeekday(CREATE_KEY, weekdayIndex)}
            onSubmit={(event) => handleSubmit(event, CREATE_KEY)}
            onCancel={() => setOpenEditorId(null)}
          />
        </div>
      ) : null}

      <div className="employeePanel__list">
        {employees.map((employee) => {
          const isOpen = openEditorId === employee.id;

          return (
            <div key={employee.id} className={isOpen ? 'employeeCard employeeCard--active' : 'employeeCard'}>
              <button type="button" className="employeeCard__select" onClick={() => toggleEditor(employee.id)}>
                <span>{employee.name}</span>
                <span>{employee.role}</span>
              </button>
              <button
                type="button"
                className="employeeCard__delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(employee.id);
                  setOpenEditorId((current) => (current === employee.id ? null : current));
                }}
              >
                מחיקה
              </button>

              {isOpen ? (
                <div className="employeeEditorWrap">
                  <EmployeeEditor
                    form={formById[employee.id] ?? mapEmployeeToForm(employee)}
                    submitLabel="שמירה"
                    onChange={(key, value) => handleFormChange(employee.id, key, value)}
                    onToggleWeekday={(weekdayIndex) => handleToggleWeekday(employee.id, weekdayIndex)}
                    onSubmit={(event) => handleSubmit(event, employee.id)}
                    onCancel={() => setOpenEditorId(null)}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function EmployeeEditor({ form, submitLabel, onChange, onToggleWeekday, onSubmit, onCancel }) {
  return (
    <form className="employeeForm" onSubmit={onSubmit}>
      <label>
        שם
        <input value={form.name} onChange={(event) => onChange('name', event.target.value)} />
      </label>

      <label>
        תפקיד
        <select value={form.role} onChange={(event) => onChange('role', event.target.value)}>
          <option value={ROLE.OPERATOR}>מפעיל</option>
          <option value={ROLE.RESPONSIBLE}>אחראי</option>
        </select>
      </label>

      <label>
        יעד משמרות חודשי
        <input
          type="number"
          min="0"
          value={form.targetShifts}
          onChange={(event) => onChange('targetShifts', event.target.value || 0)}
        />
      </label>

      <label>
        מקסימום משמרות לילה
        <input
          type="number"
          min="0"
          value={form.maxNightShifts}
          onChange={(event) => onChange('maxNightShifts', event.target.value || 0)}
        />
      </label>

      <label>
        מקסימום משמרות בוקר
        <input
          type="number"
          min="0"
          value={form.maxMorningShifts}
          onChange={(event) => onChange('maxMorningShifts', event.target.value || 0)}
        />
      </label>

      <fieldset>
        <legend>ימים חסומים</legend>
        <div className="weekdayGrid">
          {WEEKDAY_LABELS.map((label, weekdayIndex) => {
            const checked = (form.unavailableWeekdays ?? []).includes(weekdayIndex);
            return (
              <label key={`${label}-${weekdayIndex}`} className="weekdayToggle">
                <input type="checkbox" checked={checked} onChange={() => onToggleWeekday(weekdayIndex)} />
                {label}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="employeeForm__actions">
        <button type="submit">{submitLabel}</button>
        <button type="button" className="employeeForm__ghost" onClick={onCancel}>
          סגירה
        </button>
      </div>
    </form>
  );
}

function mapEmployeeToForm(employee) {
  return {
    name: employee.name,
    targetShifts: employee.targetShifts,
    maxNightShifts: employee.maxNightShifts,
    maxMorningShifts: employee.maxMorningShifts,
    unavailableWeekdays: employee.unavailableWeekdays ?? [],
    role: employee.role
  };
}