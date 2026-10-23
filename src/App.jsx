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
import {
  clearScheduleDirty,
  getScheduleDirtyToken,
  useScheduleStore
} from './state/scheduleState';
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
  const lastSavedSignaturesRef = useRef(new Map());
  const pendingAutoSaveRef = useRef(new Map());
  const autoSaveInFlightRef = useRef(false);
  const autoSaveRetryTimerRef = useRef(null);
  const autoSaveRetryDelayRef = useRef(1000);
  const latestScheduleStateRef = useRef(state);
  latestScheduleStateRef.current = state;
  const renderedDirtyTokenRef = useRef({ monthKey: '', token: '' });
  renderedDirtyTokenRef.current = {
    monthKey: state.monthKey,
    token: getScheduleDirtyToken(state.monthKey)
  };
  const cloudEnabledRef = useRef(cloudEnabled);
  cloudEnabledRef.current = cloudEnabled;
  const authorized = authStatus === 'authorized';
  authorizedRef.current = authorized;
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

  const queueAutoSave = (scheduleState, dirtyToken = getScheduleDirtyToken(scheduleState?.monthKey)) => {
    if (!scheduleState?.monthKey) {
      return;
    }

    pendingAutoSaveRef.current.set(scheduleState.monthKey, {
      monthKey: scheduleState.monthKey,
      schedule: structuredClone(scheduleState.schedule ?? {}),
      scheduleMeta: structuredClone(scheduleState.scheduleMeta ?? {}),
      dayEvents: structuredClone(scheduleState.dayEvents ?? {}),
      signature: serializeScheduleState(
        scheduleState.monthKey,
        scheduleState.schedule ?? {},
        scheduleState.scheduleMeta ?? {},
        scheduleState.dayEvents ?? {}
      ),
      dirtyToken
    });
  };

  const canFlushAutoSave = () =>
    autoSaveReadyRef.current &&
    authorizedRef.current &&
    isFirebaseConfigured &&
    cloudEnabledRef.current &&
    !isCloudDisabled();

  const scheduleAutoSaveRetry = () => {
    if (autoSaveRetryTimerRef.current || !canFlushAutoSave()) {
      return;
    }

    const delay = autoSaveRetryDelayRef.current;
    autoSaveRetryTimerRef.current = setTimeout(() => {
      autoSaveRetryTimerRef.current = null;
      void flushAutoSave();
    }, delay);
    autoSaveRetryDelayRef.current = Math.min(delay * 2, 30000);
  };

  const flushAutoSave = async () => {
    if (autoSaveInFlightRef.current || !canFlushAutoSave()) {
      return;
    }

    if (autoSaveRetryTimerRef.current) {
      clearTimeout(autoSaveRetryTimerRef.current);
      autoSaveRetryTimerRef.current = null;
    }

    autoSaveInFlightRef.current = true;

    try {
      while (pendingAutoSaveRef.current.size > 0 && canFlushAutoSave()) {
        const [monthKey, nextSave] = pendingAutoSaveRef.current.entries().next().value;
        pendingAutoSaveRef.current.delete(monthKey);

        try {
          await saveScheduleByMonth(nextSave.monthKey, {
            schedule: nextSave.schedule,
            scheduleMeta: nextSave.scheduleMeta,
            dayEvents: nextSave.dayEvents
          });

          if (isCloudDisabled()) {
            if (!pendingAutoSaveRef.current.has(monthKey)) {
              pendingAutoSaveRef.current.set(monthKey, nextSave);
            }
            setCloudEnabled(false);
            setMessage('Cloud sync paused (quota reached)  working locally');
            break;
          }

          lastSavedSignaturesRef.current.set(monthKey, nextSave.signature);
          if (nextSave.dirtyToken) {
            clearScheduleDirty(monthKey, nextSave.dirtyToken);
          }
          autoSaveRetryDelayRef.current = 1000;
        } catch {
          if (!pendingAutoSaveRef.current.has(monthKey)) {
            pendingAutoSaveRef.current.set(monthKey, nextSave);
          }
          setMessage('שמירה אוטומטית לענן נכשלה');
          scheduleAutoSaveRetry();
          break;
        }
      }
    } finally {
      autoSaveInFlightRef.current = false;
    }
  };

  const applyCloudSnapshot = (monthKey, loaded) => {
    const currentState = latestScheduleStateRef.current;
    if (currentState.monthKey !== monthKey) {
      return { ignored: true, hasLocalEdits: false };
    }

    const schedule = loaded?.schedule ?? {};
    const scheduleMeta = loaded?.scheduleMeta ?? {};
    const dayEvents = loaded?.dayEvents ?? {};
    const cloudSignature = serializeScheduleState(monthKey, schedule, scheduleMeta, dayEvents);
    lastSavedSignaturesRef.current.set(monthKey, cloudSignature);

    const dirtyToken = getScheduleDirtyToken(monthKey);
    if (dirtyToken) {
      const renderedDirty = renderedDirtyTokenRef.current;
      if (renderedDirty.monthKey === monthKey && renderedDirty.token !== dirtyToken) {
        return { ignored: false, hasLocalEdits: true };
      }

      const localSignature = serializeScheduleState(
        monthKey,
        currentState.schedule,
        currentState.scheduleMeta,
        currentState.dayEvents
      );

      if (localSignature !== cloudSignature) {
        queueAutoSave(currentState, dirtyToken);
        return { ignored: false, hasLocalEdits: true };
      }

      clearScheduleDirty(monthKey, dirtyToken);
      return { ignored: false, hasLocalEdits: false };
    }

    dispatch({
      type: 'LOAD_MONTH',
      payload: { schedule, scheduleMeta, dayEvents }
    });
    return { ignored: false, hasLocalEdits: false };
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
      lastSavedSignaturesRef.current.clear();
      pendingAutoSaveRef.current.clear();
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

    const monthKey = state.monthKey;
    if (
      !cloudEnabled ||
      !monthKey ||
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
      monthKey,
      (loaded) => {
        if (latestScheduleStateRef.current.monthKey !== monthKey) {
          return;
        }

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

        const result = applyCloudSnapshot(monthKey, loaded);

        if (firstSnapshot) {
          if (result.hasLocalEdits) {
            setMessage(`שינויים מקומיים לחודש ${monthKey} נשמרים לענן`);
          } else if (!loaded) {
            setMessage(`לא נמצאו נתונים לחודש ${monthKey}`);
          } else {
            setMessage(`נטען אוטומטית חודש ${monthKey}`);
          }
          setBusy(false);
          firstSnapshot = false;
          autoSaveReadyRef.current = true;
        }

        if (pendingAutoSaveRef.current.size > 0) {
          void flushAutoSave();
        }
      },
      () => {
        if (latestScheduleStateRef.current.monthKey !== monthKey) {
          return;
        }

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
          const currentState = latestScheduleStateRef.current;
          const dirtyToken = getScheduleDirtyToken(monthKey);
          if (currentState.monthKey === monthKey && dirtyToken) {
            queueAutoSave(currentState, dirtyToken);
          }
          void flushAutoSave();
        }
      }
    );

    cloudUnsubRef.current = unsubscribe;

    return () => {
      clearCloudSubscription();
    };
  }, [authorized, cloudEnabled, employeesReady, state.monthKey]);

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

    const dirtyToken = getScheduleDirtyToken(state.monthKey);
    if (!dirtyToken) {
      return;
    }

    const signature = serializeScheduleState(
      state.monthKey,
      state.schedule,
      state.scheduleMeta,
      state.dayEvents
    );
    if (signature === lastSavedSignaturesRef.current.get(state.monthKey)) {
      clearScheduleDirty(state.monthKey, dirtyToken);
      return;
    }

    queueAutoSave(state, dirtyToken);
    void flushAutoSave();
  }, [authorized, cloudEnabled, state, state.monthKey, state.schedule, state.scheduleMeta, state.dayEvents]);

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

    const currentState = latestScheduleStateRef.current;
    const dirtyToken = getScheduleDirtyToken(currentState.monthKey);
    if (dirtyToken) {
      queueAutoSave(currentState, dirtyToken);
      void flushAutoSave();
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

  const handleSaveDayEvent = (dayNumber, dayEvent) => {
    const dayEvents = { ...(state.dayEvents ?? {}) };
    if (dayEvent) {
      dayEvents[dayNumber] = dayEvent;
    } else {
      delete dayEvents[dayNumber];
    }
    dispatch({ type: 'SET_DAY_EVENTS', payload: dayEvents });
    setMessage(dayEvent ? 'נשמר סימון ליום ' + dayNumber : 'הוסר הסימון מיום ' + dayNumber);
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
      const monthLabel = formatPrintMonthLabel(state.monthKey);
      pdf.save(`${monthLabel}.pdf`);
      setMessage(`ה־PDF יוצא עבור ${monthLabel}`);
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
      const result = applyCloudSnapshot(monthKey, {
        schedule: normalizedSchedule,
        scheduleMeta: normalizedMeta,
        dayEvents: loaded.dayEvents ?? {}
      });

      if (result.ignored) {
        return;
      }

      if (result.hasLocalEdits) {
        setMessage(`נשמרים שינויים מקומיים לחודש ${monthKey}`);
        void flushAutoSave();
        return;
      }

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
      <ThemePanel
        open={themePanelOpen}
        authReady={authorized}
        monthKey={state.monthKey}
        monthDays={monthMeta.days}
        dayEvents={state.dayEvents}
        onSaveDayEvent={handleSaveDayEvent}
      />

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
            dayEvents={state.dayEvents}
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

function serializeScheduleState(monthKey, schedule, scheduleMeta, dayEvents = {}) {
  return JSON.stringify({
    monthKey,
    schedule,
    scheduleMeta,
    dayEvents
  });
}





