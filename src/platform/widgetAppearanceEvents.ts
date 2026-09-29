export const WIDGET_APPEARANCE_CHANGED = 'calendar-app:widget-appearance-changed';

export function notifyWidgetAppearanceChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(WIDGET_APPEARANCE_CHANGED));
}
