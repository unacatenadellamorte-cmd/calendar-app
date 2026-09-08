import type { ShiftTemplate } from '@/data/shift-templates';

interface ShiftTemplateChipProps {
  template: ShiftTemplate;
  onTap: (template: ShiftTemplate) => void;
}

/**
 * お気に入りシフトのピル(UX-DR8)。「シフト名 + 時間帯」+ 色ドット。
 * 色だけで区別させないため、名前と時間帯を必ず併記する。
 */
export function ShiftTemplateChip({ template, onTap }: ShiftTemplateChipProps) {
  return (
    <button
      type="button"
      onClick={() => onTap(template)}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-hairline bg-surface-raised px-3.5 text-left text-meta text-ink-primary"
    >
      <span
        aria-hidden="true"
        className="h-2.5 w-2.5 flex-none rounded-full"
        style={{ backgroundColor: template.color }}
      />
      <span className="font-medium">{template.name}</span>
      <span className="tabular text-ink-secondary">
        {template.startLocal}–{template.endLocal}
      </span>
    </button>
  );
}
