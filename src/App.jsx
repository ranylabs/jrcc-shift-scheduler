import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getMonthMeta, shiftMonth } from './engine/dateUtils';
import { validateSchedule } from './engine/validation';
import {
  deleteEmployeeById,
  subscribeEmployees,
  upsertEmployee
} from './services/employeesRepository';
import { isFirebaseConfigured } from './services/firebase';
import { loadScheduleByMonth, saveScheduleByMonth } from './services/scheduleRepository';
import { useScheduleStore } from './state/scheduleState';
import CalendarGrid from './ui/components/CalendarGrid';
import EmployeePanel from './ui/components/EmployeePanel';
import ThemePanel from './ui/components/ThemePanel';
import Toolbar from './ui/components/Toolbar';

export default function App() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useScheduleStore();
  const [busy, setBusy] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [message, setMessage] = useState('לחיצה על תא מחליפה בין: ריק -> בוקר -> לילה -> X');
  const [employeesReady, setEmployeesReady] = useState(!isFirebaseConfigured);
  const exportRef = useRef(null);
  const loadRequestRef = useRef(0);

  const monthMeta = useMemo(() => getMonthMeta(state.monthKey), [state.monthKey]);
  const validation = useMemo(() => validateSchedule(state), [state]);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setEmployeesReady(true);
      return () => {};
    }

    const unsubscribe = subscribeEmployees((employees) => {
      dispatch({ type: 'SET_EMPLOYEES', payload: employees });
      setEmployeesReady(true);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !employeesReady) {
      return;
    }

    loadScheduleForMonth(state.monthKey, true);
  }, [state.monthKey, employeesReady]);

  const setMonth = (monthKey) => {
    if (!monthKey) {
      return;
    }
    dispatch({ type: 'SET_MONTH', payload: monthKey });
  };

  const handleSave = async () => {
    if (!isFirebaseConfigured) {
      setMessage('הענן לא מוגדר. יש למלא משתני פיירבייס.');
      return;
    }

    setBusy(true);
    setMessage('שומר לענן...');

    try {
      await saveScheduleByMonth(state.monthKey, {
        schedule: state.schedule,
        scheduleMeta: state.scheduleMeta
      });
      setMessage(`נשמר חודש ${state.monthKey}`);
    } catch {
      setMessage('שמירה לענן נכשלה');
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async () => {
    if (!isFirebaseConfigured) {
      setMessage('הענן לא מוגדר. יש למלא משתני פיירבייס.');
      return;
    }

    await loadScheduleForMonth(state.monthKey, false);
  };

  const handleAddEmployee = async (payload) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 11);

    const employee = { ...payload, id };
    dispatch({ type: 'ADD_EMPLOYEE', payload: employee });

    if (!isFirebaseConfigured) {
      return;
    }

    try {
      await upsertEmployee(employee);
    } catch {
      setMessage('שמירת עובד לענן נכשלה');
    }
  };

  const handleUpdateEmployee = async (id, updates) => {
    dispatch({ type: 'UPDATE_EMPLOYEE', payload: { id, updates } });

    if (!isFirebaseConfigured) {
      return;
    }

    const current = state.employees.find((employee) => employee.id === id);
    if (!current) {
      return;
    }

    try {
      await upsertEmployee({ ...current, ...updates, id });
    } catch {
      setMessage('עדכון עובד בענן נכשל');
    }
  };

  const handleDeleteEmployee = async (id) => {
    dispatch({ type: 'DELETE_EMPLOYEE', payload: id });

    if (!isFirebaseConfigured) {
      return;
    }

    try {
      await deleteEmployeeById(id);
    } catch {
      setMessage('מחיקת עובד מהענן נכשלה');
    }
  };

  const handleExportPdf = async () => {
    if (!exportRef.current) {
      return;
    }

    setMessage('מייצא PDF...');
    setExportMode(true);
    try {
      await new Promise((resolve) => requestAnimationFrame(resolve));

      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true
      });

      const image = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

      const pdfWidth = 297;
      const pdfHeight = 210;
      const margin = 6;
      const targetWidth = pdfWidth - margin * 2;
      const targetHeight = pdfHeight - margin * 2;
      let ratio = targetWidth / canvas.width;
      let imageWidth = targetWidth;
      let imageHeight = canvas.height * ratio;
      if (imageHeight > targetHeight) {
        ratio = targetHeight / canvas.height;
        imageHeight = targetHeight;
        imageWidth = canvas.width * ratio;
      }
      const offsetX = margin;
      const offsetY = margin;

      pdf.addImage(image, 'PNG', offsetX, offsetY, imageWidth, imageHeight, undefined, 'FAST');
      pdf.save(`schedule-${state.monthKey}.pdf`);
      setMessage(`ה־PDF יוצא עבור ${state.monthKey}`);
    } finally {
      setExportMode(false);
    }
  };

  const cloudStatus = busy ? 'מסנכרן...' : isFirebaseConfigured ? 'מחובר לענן' : 'לא מחובר לענן';

  async function loadScheduleForMonth(monthKey, isAutoLoad) {
    const requestId = loadRequestRef.current + 1;
    loadRequestRef.current = requestId;

    setBusy(true);
    setMessage(isAutoLoad ? 'טעינה אוטומטית מהענן...' : 'נטען מהענן...');

    try {
      const loaded = await loadScheduleByMonth(monthKey);
      if (loadRequestRef.current !== requestId) {
        return;
      }

      if (!loaded) {
        setMessage(
          isAutoLoad ? `לא נמצאו נתונים לחודש ${monthKey}` : `אין נתונים שמורים לחודש ${monthKey}`
        );
        return;
      }

      const normalizedSchedule = loaded.schedule ?? loaded;
      const normalizedMeta = loaded.scheduleMeta ?? {};
      dispatch({ type: 'LOAD_MONTH', payload: { schedule: normalizedSchedule, scheduleMeta: normalizedMeta } });
      setMessage(isAutoLoad ? `נטען אוטומטית חודש ${monthKey}` : `נטען חודש ${monthKey}`);
    } catch {
      if (loadRequestRef.current === requestId) {
        setMessage(isAutoLoad ? 'טעינה אוטומטית מהענן נכשלה' : 'טעינה מהענן נכשלה');
      }
    } finally {
      if (loadRequestRef.current === requestId) {
        setBusy(false);
      }
    }
  }

  return (
    <div className={`app ${compactMode ? 'compactMode' : ''}`} dir="rtl">
      <header className="app__header">
        <h1>sched rcc app</h1>
        <p>מערכת סידור משמרות חודשית</p>
      </header>

      <Toolbar
        monthKey={state.monthKey}
        canUndo={canUndo}
        canRedo={canRedo}
        busy={busy}
        cloudStatus={cloudStatus}
        onMonthChange={setMonth}
        onMonthShift={(delta) => setMonth(shiftMonth(state.monthKey, delta))}
        onUndo={undo}
        onRedo={redo}
        onAutoFill={() => dispatch({ type: 'GENERATE_SCHEDULE' })}
        onClearGenerated={() => dispatch({ type: 'CLEAR_GENERATED' })}
        compactMode={compactMode}
        onToggleCompactMode={() => setCompactMode((current) => !current)}
        onToggleThemePanel={() => setThemePanelOpen((current) => !current)}
        onSave={handleSave}
        onLoad={handleLoad}
        onExportPdf={handleExportPdf}
      />
      <ThemePanel open={themePanelOpen} />

      <main className="app__main">
        <section className={`board ${exportMode ? 'exportMode' : ''}`} ref={exportRef}>
          <CalendarGrid
            monthDays={monthMeta.days}
            employees={state.employees}
            schedule={state.schedule}
            dayIssues={validation.dayIssues}
            employeeIssues={validation.employeeIssues}
            statsByEmployee={validation.statsByEmployee}
            onCellClick={(dayNumber, employeeId) =>
              dispatch({ type: 'CYCLE_CELL', payload: { dayNumber, employeeId } })
            }
          />
        </section>

        <EmployeePanel
          employees={state.employees}
          onAdd={handleAddEmployee}
          onUpdate={handleUpdateEmployee}
          onDelete={handleDeleteEmployee}
        />
      </main>

      <footer className="app__footer">
        <span className={validation.hasIssues ? 'status status--warn' : 'status status--ok'}>
          {validation.hasIssues ? 'דורש תיקון' : 'תקין'}
        </span>
        <span>{message}</span>
      </footer>
    </div>
  );
}
