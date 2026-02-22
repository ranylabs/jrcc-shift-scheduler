import ScheduleCell from './ScheduleCell';

export default function CalendarGrid({
  monthDays,
  employees,
  schedule,
  dayIssues,
  employeeIssues,
  statsByEmployee,
  onCellClick
}) {
  const columnTemplate = `var(--employee-col-width) repeat(${monthDays.length}, minmax(0, 1fr))`;

  return (
    <div className="calendarWrap">
      <div className="grid" dir="rtl" style={{ gridTemplateColumns: columnTemplate }}>
        {renderHeaderRows(monthDays, 'top')}

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

              {monthDays.map((day) => (
                <div
                  key={`${employee.id}-${day.dayNumber}`}
                  className={day.isWeekend ? 'grid__dayCell is-weekend' : 'grid__dayCell'}
                >
                  <ScheduleCell
                    value={normalizeCellValue(schedule?.[day.dayNumber]?.[employee.id])}
                    onClick={() => onCellClick(day.dayNumber, employee.id)}
                  />
                </div>
              ))}
            </div>
          );
        })}

        {renderHeaderRows(monthDays, 'bottom')}

        <div className="grid__row grid__footerRow">
          <div className="grid__employeeCell">ולידציה</div>
          {monthDays.map((day) => {
            const issues = dayIssues[day.dayNumber] ?? [];
            return (
              <div
                key={`fix-${day.dayNumber}`}
                className={day.isWeekend ? 'grid__dayCell grid__fixCell is-weekend' : 'grid__dayCell grid__fixCell'}
                title={issues.join(' | ')}
              >
                {issues.length > 0 ? 'FIX' : ''}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function renderHeaderRows(monthDays, keyPrefix) {
  return (
    <>
      <div className="grid__header" key={`${keyPrefix}-header-days`}>
        <div className="grid__employeeCell">עובד</div>
        {monthDays.map((day) => (
          <div
            key={`${keyPrefix}-day-${day.dayNumber}`}
            className={day.isWeekend ? 'grid__dayCell grid__headerCell is-weekend' : 'grid__dayCell grid__headerCell'}
          >
            {day.dayNumber}
          </div>
        ))}
      </div>

      <div className="grid__header" key={`${keyPrefix}-header-weekdays`}>
        <div className="grid__employeeCell grid__headerCell grid__headerBottom">תפקיד</div>
        {monthDays.map((day) => (
          <div
            key={`${keyPrefix}-weekday-${day.dayNumber}`}
            className={
              day.isWeekend
                ? 'grid__dayCell grid__headerCell grid__headerBottom grid__weekdayLabelCell is-weekend'
                : 'grid__dayCell grid__headerCell grid__headerBottom grid__weekdayLabelCell'
            }
          >
            {day.weekdayLabel}
          </div>
        ))}
      </div>
    </>
  );
}

function normalizeCellValue(cell) {
  if (cell && typeof cell === 'object') {
    return cell.value ?? '';
  }

  return cell ?? '';
}

function buildSummary(stats) {
  const safe = stats ?? { total: 0, morning: 0, night: 0 };
  return `סה"כ: ${safe.total} | בוקר: ${safe.morning} | לילה: ${safe.night}`;
}
