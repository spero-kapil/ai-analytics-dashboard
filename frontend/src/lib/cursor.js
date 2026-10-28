const METER_ORDER = { 'cursor models': 0, 'other models': 1 };

export const sortCursorMeters = (meters) =>
  [...meters].sort(
    (a, b) => (METER_ORDER[a.label.toLowerCase()] ?? 99) - (METER_ORDER[b.label.toLowerCase()] ?? 99),
  );
