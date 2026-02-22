import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { getMonthMeta, shiftMonth } from './engine/dateUtils';
import { validateSchedule } from './engine/validation';
import {
  deleteEmployeeById,
  loadEmployeesOnce,
  upsertEmployee
} from './services/employeesRepository';
import { signInWithGoogle, startAuthListener } from './services/authGate';
import { isFirebaseConfigured } from './services/firebase';
import { loadScheduleByMonth, saveScheduleByMonth, subscribeScheduleByMonth } from './services/scheduleRepository';
import { loadUserTheme } from './services/userSettingsRepository';
import { useScheduleStore } from './state/scheduleState';
import AuthGate from './ui/components/AuthGate';
import CalendarGrid from './ui/components/CalendarGrid';
import EmployeePanel from './ui/components/EmployeePanel';
import ThemePanel from './ui/components/ThemePanel';
import Toolbar from './ui/components/Toolbar';

export default function App() {
  const { state, dispatch, undo, redo, canUndo, canRedo } = useScheduleStore();
  const [authStatus, setAuthStatus] = useState('checking');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [deniedEmail, setDeniedEmail] = useState('');
  const [authUser, setAuthUser] = useState(null);
  const [busy, setBusy] = useState(false);
  const [compactMode, setCompactMode] = useState(true);
  const [themePanelOpen, setThemePanelOpen] = useState(false);
  const [exportMode, setExportMode] = useState(false);
  const [pdfExportMode, setPdfExportMode] = useState(false);
  const [message, setMessage] = useState('לחיצה על תא מחליפה בין: ריק -> בוקר -> לילה -> X');
  const [employeesReady, setEmployeesReady] = useState(false);
  const [userTheme, setUserTheme] = useState(null);
  const exportRef = useRef(null);
  const startupLoadedUidRef = useRef('');
  const authorized = authStatus === 'authorized';

  const monthMeta = useMemo(() => getMonthMeta(state.monthKey), [state.monthKey]);
  const validation = useMemo(() => validateSchedule(state), [state]);

  useEffect(() => {
    const unsubscribe = startAuthListener((nextState) => {
      setAuthStatus(nextState.status);
      setDeniedEmail(nextState.deniedEmail ?? '');
      setAuthError(nextState.error ?? null);
      setAuthUser(nextState.user ?? null);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!authorized) {
      setEmployeesReady(false);
      setUserTheme(null);
      startupLoadedUidRef.current = '';
      return () => {};
    }

    if (!isFirebaseConfigured) {
      setEmployeesReady(true);
      return () => {};
    }

    const uid = authUser?.uid;
    if (!uid) {
      return () => {};
    }

    if (startupLoadedUidRef.current === uid) {
      return () => {};
    }

    startupLoadedUidRef.current = uid;
    let cancelled = false;

    (async () => {
      try {
        const [employees, theme] = await Promise.all([loadEmployeesOnce(), loadUserTheme(uid)]);
        if (cancelled) {
          return;
        }

        dispatch({ type: 'SET_EMPLOYEES', payload: employees });
        setUserTheme(theme);
        setEmployeesReady(true);
      } catch {
        if (cancelled) {
          return;
        }

        setMessage('טעינת עובדים והגדרות מהענן נכשלה');
        setEmployeesReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authorized, authUser?.uid, dispatch]);

  useEffect(() => {
    if (!authorized || !isFirebaseConfigured || !employeesReady) {
      return () => {};
    }

    setBusy(true);
    let firstSnapshot = true;

    const unsubscribe = subscribeScheduleByMonth(
      state.monthKey,
      (loaded) => {
        if (loaded) {
          dispatch({
            type: 'LOAD_MONTH',
            payload: {
              schedule: loaded.schedule ?? {},
              scheduleMeta: loaded.scheduleMeta ?? {}
            }
          });
        }

        if (firstSnapshot) {
          if (!loaded) {
            setMessage(`לא נמצאו נתונים לחודש ${state.monthKey}`);
          } else {
            setMessage(`נטען אוטומטית חודש ${state.monthKey}`);
          }
          setBusy(false);
          firstSnapshot = false;
        }
      },
      () => {
        if (firstSnapshot) {
          setMessage('טעינה אוטומטית מהענן נכשלה');
          setBusy(false);
          firstSnapshot = false;
        }
      }
    );

    return () => {
      unsubscribe();
    };
  }, [authorized, state.monthKey, employeesReady, dispatch]);

  const handleSignIn = async () => {
    setAuthBusy(true);
    setAuthError(null);
    try {
      await signInWithGoogle();
    } catch {
      setAuthError('signin-failed');
    } finally {
      setAuthBusy(false);
    }
  };

  const setMonth = (monthKey) => {
    if (!monthKey) {
      return;
    }
    dispatch({ type: 'SET_MONTH', payload: monthKey });
  };

  const handleSave = async () => {
    if (!authorized) {
      setMessage('אין הרשאה למערכת');
      return;
    }

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
    if (!authorized) {
      setMessage('אין הרשאה למערכת');
      return;
    }

    if (!isFirebaseConfigured) {
      setMessage('הענן לא מוגדר. יש למלא משתני פיירבייס.');
      return;
    }

    await loadScheduleForMonth(state.monthKey, false);
  };

  const handleAddEmployee = async (payload) => {
    if (!authorized) {
      setMessage('אין הרשאה למערכת');
      return;
    }

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
    if (!authorized) {
      setMessage('אין הרשאה למערכת');
      return;
    }

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
    if (!authorized) {
      setMessage('אין הרשאה למערכת');
      return;
    }

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
    setPdfExportMode(true);
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
      setPdfExportMode(false);
    }
  };

  const cloudStatus = busy ? 'מסנכרן...' : isFirebaseConfigured ? 'מחובר לענן' : 'לא מחובר לענן';

  async function loadScheduleForMonth(monthKey, isAutoLoad) {
    setBusy(true);
    setMessage(isAutoLoad ? 'טעינה אוטומטית מהענן...' : 'נטען מהענן...');

    try {
      const loaded = await loadScheduleByMonth(monthKey);

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
      setMessage(isAutoLoad ? 'טעינה אוטומטית מהענן נכשלה' : 'טעינה מהענן נכשלה');
    } finally {
      setBusy(false);
    }
  }

  if (!authorized) {
    return (
      <AuthGate
        status={authStatus}
        deniedEmail={deniedEmail}
        authError={authError}
        onSignIn={handleSignIn}
        busy={authBusy}
      />
    );
  }

  return (
    <div className={`app ${compactMode ? 'compactMode' : ''} ${pdfExportMode ? 'pdf-export' : ''}`} dir="rtl">
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
