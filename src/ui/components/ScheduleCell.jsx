import { SHIFT_CODES } from '../../engine/constants';
import { normalizeCellText } from '../../engine/textNormalize';

export default function ScheduleCell({ value, onClick }) {
  const normalizedValue = value ? normalizeCellText(value) : value;
  const variantValue = normalizedValue === 'ח' ? SHIFT_CODES.CONSTRAINT : normalizedValue;
  const label =
    normalizedValue === SHIFT_CODES.MORNING
      ? 'ב'
      : normalizedValue === SHIFT_CODES.NIGHT
      ? 'ל'
      : normalizedValue === SHIFT_CODES.CONSTRAINT
      ? 'X'
      : normalizedValue === 'ח'
      ? 'ח'
      : '';

  return (
    <button
      type="button"
      className={`schedule-cell schedule-cell--${variantValue || 'empty'}`}
      onClick={onClick}
    >
      <span className={`schedule-cell__letter schedule-cell__letter--${variantValue || 'empty'}`}>{label}</span>
    </button>
  );
}
