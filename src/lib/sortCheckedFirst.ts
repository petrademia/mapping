export function sortCheckedFirst<T>(
  items: readonly T[],
  isChecked: (item: T) => boolean,
): T[] {
  const checked: T[] = [];
  const unchecked: T[] = [];
  for (const item of items) {
    (isChecked(item) ? checked : unchecked).push(item);
  }
  return checked.concat(unchecked);
}
