import { SHIFT_CODES } from '../../engine/constants';

export default function ScheduleCell({ value, onClick }) {
  const label =
    value === SHIFT_CODES.MORNING
      ? 'ב'
      : value === SHIFT_CODES.NIGHT
      ? 'ל'
      : value === SHIFT_CODES.CONSTRAINT
      ? 'X'
      : '';

  return (
    <button type="button" className={`schedule-cell schedule-cell--${value || 'empty'}`} onClick={onClick}>
      <span className={`schedule-cell__letter schedule-cell__letter--${value || 'empty'}`}>{label}</span>
    </button>
  );
}
