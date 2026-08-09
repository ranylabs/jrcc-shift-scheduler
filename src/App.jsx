import { useEffect, useMemo, useRef, useState } from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { exportEmployeeScheduleToIcs } from './engine/icsExport';
import { getMonthMeta, shiftMonth } from './engine/dateUtils';
import { validateSchedule } from './engine/validation';
import {
  deleteEmployeeById,
  loadEmployeesOnce,
  upsertEmployee
} from './services/employeesRepository';
import { signInWithGoogle, startAuthListener } from './services/authGate';
import { disableCloud, enableCloud, isCloudDisabled } from './services/cloudMode';
import { isFirebaseConfigured } from './services/firebase';
import { loadScheduleByMonth, saveScheduleByMonth, subscribeScheduleByMonth } from './services/scheduleRepository';
import { loadUserTheme } from './services/userSettingsRepository';
import { useScheduleStore } from './state/scheduleState';
import AuthGate from './ui/components/AuthGate';
import CalendarGrid from './ui/components/CalendarGrid';
import EmployeePanel from './ui/components/EmployeePanel';
import ThemePanel from './ui/components/ThemePanel';
import Toolbar from './ui/components/Toolbar';

const PDF_EXPORT_WIDTH_PX = 1122;

function formatPrintMonthLabel(monthKey) {
  if (!monthKey) {
    return '';
  }

  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' }).format(date);
}

function formatPrintDate(date) {
  const parts = new Intl.DateTimeFormat('he-IL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).formatToParts(date);
  const day = parts.find((part) => part.type == 'day')?.value ?? '';
  const month = parts.find((part) => part.type == 'month')?.value ?? '';
  const year = parts.find((part) => part.type == 'year')?.value ?? '';
  return `${day}/${month}/${year}`;
}
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
  const [cloudEnabled, setCloudEnabled] = useState(() => !isCloudDisabled());
  const exportRef = useRef(null);
  const startupLoadedUidRef = useRef('');
  const cloudUnsubRef = useRef(null);
  const authorizedRef = useRef(false);
  const employeesReadyRef = useRef(false);
  const autoSaveReadyRef = useRef(false);
  const lastSavedSignatureRef = useRef('');
  const pendingAutoSaveRef = useRef(null);
  const autoSaveInFlightRef = useRef(false);
  const authorized = authStatus === 'authorized';
  const cloudDisabled = !cloudEnabled || isCloudDisabled();

  const monthMeta = useMemo(() => getMonthMeta(state.monthKey), [state.monthKey]);
  const validation = useMemo(() => validateSchedule(state), [state]);
  const selectedEmployee = useMemo(
    () => state.employees.find((employee) => employee.id === state.selectedEmployeeId) ?? null,
    [state.employees, state.selectedEmployeeId]
  );
  const printMonthLabel = formatPrintMonthLabel(state.monthKey);
  const printDateLabel = formatPrintDate(new Date());

  useEffect(() => {
    authorizedRef.current = authorized;
  }, [authorized]);

  useEffect(() => {
    employeesReadyRef.current = employeesReady;
  }, [employeesReady]);

  const clearCloudSubscription = () => {
    if (cloudUnsubRef.current) {
      cloudUnsubRef.current();
      cloudUnsubRef.current = null;
    }
  };

  const flushAutoSave = async () => {
    if (autoSaveInFlightRef.current || !pendingAutoSaveRef.current) {
      return;
    }

    autoSaveInFlightRef.current = true;

    while (pendingAutoSaveRef.current) {
      const nextSave = pendingAutoSaveRef.current;
      pendingAutoSaveRef.current = null;

      try {
        await saveScheduleByMonth(nextSave.monthKey, {
          schedule: nextSave.schedule,
          scheduleMeta: nextSave.scheduleMeta
        });
        lastSavedSignatureRef.current = nextSave.signature;

        if (isCloudDisabled()) {
          setCloudEnabled(false);
          setMessage('Cloud sync paused (quota reached)  working locally');
          break;
        }
      } catch {
        setMessage('שמירה אוטומטית לענן נכשלה');
        break;
      }
    }

    autoSaveInFlightRef.current = false;
  };

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
      autoSaveReadyRef.current = false;
      lastSavedSignatureRef.current = '';
      pendingAutoSaveRef.current = null;
      return () => {};
    }

    if (!isFirebaseConfigured) {
      setEmployeesReady(true);
      return () => {};
    }

    if (isCloudDisabled()) {
      setEmployeesReady(true);
      setMessage('Cloud sync paused (quota reached)  working locally');
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
    clearCloudSubscription();
    autoSaveReadyRef.current = false;

    if (
      !cloudEnabled ||
      !state.monthKey ||
      !isFirebaseConfigured ||
      !authorizedRef.current ||
      !employeesReadyRef.current ||
      isCloudDisabled()
    ) {
      setBusy(false);
      if (!cloudEnabled || isCloudDisabled()) {
        setMessage('Cloud sync paused (quota reached)  working locally');
      }
      return () => {
        clearCloudSubscription();
      };
    }

    setBusy(true);
    let firstSnapshot = true;

    const unsubscribe = subscribeScheduleByMonth(
      state.monthKey,
      (loaded) => {
        if (isCloudDisabled()) {
          setCloudEnabled(false);
          if (firstSnapshot) {
            setMessage('Cloud sync paused (quota reached)  working locally');
            setBusy(false);
            firstSnapshot = false;
          }
          clearCloudSubscription();
          return;
        }

        if (loaded) {
          lastSavedSignatureRef.current = serializeScheduleState(
            state.monthKey,
            loaded.schedule ?? {},
            loaded.scheduleMeta ?? {}
          );
          dispatch({
            type: 'LOAD_MONTH',
            payload: {
              schedule: loaded.schedule ?? {},
              scheduleMeta: loaded.scheduleMeta ?? {}
            }
          });
        } else {
          lastSavedSignatureRef.current = serializeScheduleState(state.monthKey, {}, {});
        }

        if (firstSnapshot) {
          if (!loaded) {
            setMessage(`לא נמצאו נתונים לחודש ${state.monthKey}`);
          } else {
            setMessage(`נטען אוטומטית חודש ${state.monthKey}`);
          }
          setBusy(false);
          firstSnapshot = false;
          autoSaveReadyRef.current = true;
        }
      },
      () => {
        if (isCloudDisabled()) {
          setCloudEnabled(false);
          setMessage('Cloud sync paused (quota reached)  working locally');
          setBusy(false);
          clearCloudSubscription();
          firstSnapshot = false;
          return;
        }

        if (firstSnapshot) {
          setMessage('טעינה אוטומטית מהענן נכשלה');
          setBusy(false);
          firstSnapshot = false;
          autoSaveReadyRef.current = true;
        }
      }
    );

    cloudUnsubRef.current = unsubscribe;

    return () => {
      clearCloudSubscription();
    };
  }, [cloudEnabled, state.monthKey]);

  useEffect(() => {
    if (
      !autoSaveReadyRef.current ||
      !authorized ||
      !isFirebaseConfigured ||
      !cloudEnabled ||
      isCloudDisabled()
    ) {
      return;
    }

    const signature = serializeScheduleState(state.monthKey, state.schedule, state.scheduleMeta);
    if (signature === lastSavedSignatureRef.current) {
      return;
    }

    pendingAutoSaveRef.current = {
      monthKey: state.monthKey,
      schedule: structuredClone(state.schedule),
      scheduleMeta: structuredClone(state.scheduleMeta),
      signature
    };

    void flushAutoSave();
  }, [authorized, cloudEnabled, state.monthKey, state.schedule, state.scheduleMeta]);

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

  const handleLoad = async () => {
    if (!authorized) {
      setMessage('אין הרשאה למערכת');
      return;
    }

    if (!isFirebaseConfigured) {
      setMessage('הענן לא מוגדר. יש למלא משתני פיירבייס.');
      return;
    }

    if (isCloudDisabled()) {
      setCloudEnabled(false);
      setMessage('Cloud sync paused (quota reached)  working locally');
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

    const previousWidth = exportRef.current.style.width;
    const previousMaxWidth = exportRef.current.style.maxWidth;
    const previousOverflow = exportRef.current.style.overflow;

    setMessage('מייצא PDF...');
    setExportMode(true);
    setPdfExportMode(true);
    try {
      exportRef.current.style.width = `${PDF_EXPORT_WIDTH_PX}px`;
      exportRef.current.style.maxWidth = `${PDF_EXPORT_WIDTH_PX}px`;
      exportRef.current.style.overflow = 'visible';

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
      exportRef.current.style.width = previousWidth;
      exportRef.current.style.maxWidth = previousMaxWidth;
      exportRef.current.style.overflow = previousOverflow;
      setExportMode(false);
      setPdfExportMode(false);
    }
  };

  const handleExportCalendar = () => {
    if (!selectedEmployee) {
      setMessage('יש לבחור עובד לפני ייצוא ליומן');
      return;
    }

    const result = exportEmployeeScheduleToIcs({
      monthKey: state.monthKey,
      employee: selectedEmployee,
      schedule: state.schedule
    });

    if (!result.hasEvents) {
      setMessage(`אין משמרות לייצוא עבור ${selectedEmployee.name} בחודש ${state.monthKey}`);
      return;
    }

    setMessage(`יומן אישי יוצא עבור ${selectedEmployee.name}`);
  };

  const cloudStatus = busy ? 'מסנכרן...' : isFirebaseConfigured ? 'מחובר לענן' : 'לא מחובר לענן';

  async function loadScheduleForMonth(monthKey, isAutoLoad) {
    setBusy(true);
    setMessage(isAutoLoad ? 'טעינה אוטומטית מהענן...' : 'נטען מהענן...');

    try {
      const loaded = await loadScheduleByMonth(monthKey);

      if (isCloudDisabled()) {
        setCloudEnabled(false);
        setMessage('Cloud sync paused (quota reached)  working locally');
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
        selectedEmployeeName={selectedEmployee?.name ?? ''}
        onMonthChange={setMonth}
        onMonthShift={(delta) => setMonth(shiftMonth(state.monthKey, delta))}
        onUndo={undo}
        onRedo={redo}
        onAutoFill={() => dispatch({ type: 'GENERATE_SCHEDULE' })}
        onClearGenerated={() => dispatch({ type: 'CLEAR_GENERATED' })}
        compactMode={compactMode}
        onToggleCompactMode={() => setCompactMode((current) => !current)}
        onToggleThemePanel={() => setThemePanelOpen((current) => !current)}
        onLoad={handleLoad}
        onExportPdf={handleExportPdf}
        onExportCalendar={handleExportCalendar}
      />
      {cloudDisabled ? (
        <div className="cloudBanner no-print" dir="rtl">
          <span>Cloud sync paused (quota reached)  working locally</span>
          <button
            type="button"
            onClick={() => {
              enableCloud();
              setCloudEnabled(true);
            }}
          >
            Enable Cloud
          </button>
        </div>
      ) : (
        <div className="cloudBanner no-print" dir="rtl">
          <button
            type="button"
            onClick={() => {
              disableCloud('manual');
              setCloudEnabled(false);
              clearCloudSubscription();
              setMessage('Cloud sync paused (quota reached)  working locally');
            }}
          >
            Disable Cloud
          </button>
        </div>
      )}
      <ThemePanel open={themePanelOpen} authReady={authorized} />

      <main className="app__main">
        <section className={`board ${exportMode ? 'exportMode' : ''}`} ref={exportRef}>
          <div className="print-header">
            <div className="print-header__title">{printMonthLabel}</div>
            <div className="print-header__date">תאריך הדפסה: {printDateLabel}</div>
          </div>
          <CalendarGrid
            monthDays={monthMeta.days}
            employees={state.employees}
            schedule={state.schedule}
            dayIssues={validation.dayIssues}
            dayShiftCountStatus={validation.dayShiftCountStatus}
            employeeIssues={validation.employeeIssues}
            statsByEmployee={validation.statsByEmployee}
            onCellClick={(dayNumber, employeeId) =>
              dispatch({ type: 'CYCLE_CELL', payload: { dayNumber, employeeId } })
            }
          />
        </section>

        <EmployeePanel
          employees={state.employees}
          selectedEmployeeId={state.selectedEmployeeId}
          onSelectEmployee={(employeeId) => dispatch({ type: 'SET_SELECTED_EMPLOYEE', payload: employeeId })}
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

function serializeScheduleState(monthKey, schedule, scheduleMeta) {
  return JSON.stringify({
    monthKey,
    schedule,
    scheduleMeta
  });
}





