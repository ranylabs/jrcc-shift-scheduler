import { normalizeCellText } from '../../engine/textNormalize';
import ScheduleCell from './ScheduleCell';

export default function CalendarGrid({
  monthDays,
  employees,
  schedule,
  dayEvents = {},
  dayIssues,
  dayShiftCountStatus,
  employeeIssues,
  statsByEmployee,
  onCellClick
}) {
  const columnTemplate = `var(--employee-col-width) repeat(${monthDays.length}, minmax(0, 1fr))`;
  const hasDayAnnotations = monthDays.some((day) => hasVisibleDayAnnotation(dayEvents?.[day.dayNumber]));

  return (
    <div className="calendarWrap">
      <div className="grid" dir="rtl" style={{ gridTemplateColumns: columnTemplate }}>
        {renderHeaderRows(monthDays, 'top', dayEvents)}

        {hasDayAnnotations ? (
          <div className="grid__row grid__eventRow">
            <div className="grid__employeeCell grid__eventLabelCell">יום מיוחד</div>
            {monthDays.map((day) => {
              const event = dayEvents?.[day.dayNumber];
              const symbol = event?.symbol || event?.label?.slice(0, 1) || '';
              return (
                <div
                  key={`event-${day.dayNumber}`}
                  className={getDayCellClassName(day, event, 'grid__eventCell')}
                  style={getDayCellStyle(event)}
                  title={event?.label || event?.symbol || undefined}
                  aria-label={event?.label || event?.symbol || undefined}
                >
                  <span className="grid__eventSymbol">{symbol}</span>
                  <span className="grid__eventText">{event?.label ?? ''}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        {employees.map((employee, rowIndex) => {
          const rowClass = rowIndex % 2 === 0 ? 'is-row-even' : 'is-row-odd';

          return (
            <div key={`row-${employee.id}`} className={`grid__row ${rowClass}`}>
              <div className="grid__employeeCell">
                <div className="grid__employeeName">{employee.name}</div>
                <div className="grid__employeeRole">{employee.role}</div>
                <div className="grid__employeeSummary no-export">{buildSummary(statsByEmployee?.[employee.id])}</div>
                {(employeeIssues[employee.id] ?? []).length > 0 ? (
                  <div className="grid__employeeIssue">{employeeIssues[employee.id][0]}</div>
                ) : null}
              </div>

              {monthDays.map((day) => {
                const event = dayEvents?.[day.dayNumber];
                return (
                  <div
                    key={`${employee.id}-${day.dayNumber}`}
                    className={getDayCellClassName(day, event)}
                    style={getDayCellStyle(event)}
                    title={event?.label || undefined}
                  >
                    <ScheduleCell
                      value={normalizeCellValue(schedule?.[day.dayNumber]?.[employee.id])}
                      onClick={() => onCellClick(day.dayNumber, employee.id)}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}

        {renderHeaderRows(monthDays, 'bottom', dayEvents)}

        <div className="grid__row grid__footerRow">
          <div className="grid__employeeCell">ולידציה</div>
          {monthDays.map((day) => {
            const issues = dayIssues[day.dayNumber] ?? [];
            const event = dayEvents?.[day.dayNumber];
            return (
              <div
                key={`fix-${day.dayNumber}`}
                className={getDayCellClassName(day, event, 'grid__fixCell')}
                style={getDayCellStyle(event)}
                title={[event?.label, issues.join(' | ')].filter(Boolean).join(' | ')}
              >
                {issues.length > 0 ? 'FIX' : ''}
              </div>
            );
          })}
        </div>

        <div className="grid__row grid__footerRow">
          <div className="grid__employeeCell">כמות משמרות</div>
          {monthDays.map((day) => {
            const isValid = dayShiftCountStatus?.[day.dayNumber] === 'ok';
            const event = dayEvents?.[day.dayNumber];
            return (
              <div
                key={`shift-count-${day.dayNumber}`}
                className={getDayCellClassName(day, event, 'grid__fixCell')}
                style={getDayCellStyle(event)}
                title={event?.label || undefined}
              >
                {isValid ? '' : 'FIX'}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderHeaderRows(monthDays, keyPrefix, dayEvents) {
  return (
    <>
      <div className="grid__header" key={`${keyPrefix}-header-days`}>
        <div className="grid__employeeCell">יום</div>
        {monthDays.map((day) => {
          const event = dayEvents?.[day.dayNumber];
          return (
            <div
              key={`${keyPrefix}-day-${day.dayNumber}`}
              className={getDayCellClassName(day, event, 'grid__headerCell grid__dayNumberCell')}
              style={getDayCellStyle(event)}
              title={event?.label || undefined}
            >
              {day.dayNumber}
            </div>
          );
        })}
      </div>

      <div className="grid__header" key={`${keyPrefix}-header-weekdays`}>
        <div className="grid__employeeCell grid__headerCell grid__headerBottom">שם עובד</div>
        {monthDays.map((day) => {
          const event = dayEvents?.[day.dayNumber];
          return (
            <div
              key={`${keyPrefix}-weekday-${day.dayNumber}`}
              className={getDayCellClassName(day, event, 'grid__headerCell grid__headerBottom grid__weekdayLabelCell')}
              style={getDayCellStyle(event)}
              title={event?.label || undefined}
            >
              {day.weekdayLabel}
            </div>
          );
        })}
      </div>
    </>
  );
}

function getDayCellClassName(day, event, extraClass = '') {
  return [
    'grid__dayCell',
    extraClass,
    day.isWeekend ? 'is-weekend' : '',
    event ? 'is-special-day' : ''
  ].filter(Boolean).join(' ');
}

function getDayCellStyle(event) {
  return event ? { '--special-day-bg': event.color ?? '#fff2cc' } : undefined;
}

function hasVisibleDayAnnotation(event) {
  return Boolean(event?.symbol?.trim() || event?.label?.trim());
}

function normalizeCellValue(cell) {
  if (cell && typeof cell === 'object') {
    return normalizeCellTextValue(cell.value);
  }

  return normalizeCellTextValue(cell);
}

function normalizeCellTextValue(value) {
  if (value === '' || value == null) {
    return value ?? '';
  }

  return normalizeCellText(value);
}

function buildSummary(stats) {
  const safe = stats ?? { total: 0, morning: 0, night: 0 };
  return `סה"כ: ${safe.total} | בוקר: ${safe.morning} | לילה: ${safe.night}`;
}
