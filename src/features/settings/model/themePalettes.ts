/** 設定の色見本と画面に共通で使う配色アセット。 */
export const themePalettes = {
  sakura: { label: '桜', colors: ['#fff8fa', '#f8eaf0', '#ffffff', '#35232c', '#72505f', '#ab8998', '#a52c62', '#fbe1ed', '#ffffff', '#e8cbd7', '#b72e2e'] },
  leaf: { label: '若葉', colors: ['#f7fcf6', '#eaf3e7', '#ffffff', '#233322', '#526a4e', '#8fa58b', '#326c36', '#dcefd9', '#ffffff', '#cadfc6', '#b5362b'] },
  ocean: { label: '海', colors: ['#f5fbff', '#e5f1f8', '#ffffff', '#193344', '#476577', '#88a1b0', '#086d9e', '#d8effa', '#ffffff', '#c4dce9', '#b5362b'] },
  lavender: { label: 'ラベンダー', colors: ['#fbf8ff', '#eee8f7', '#ffffff', '#302641', '#665577', '#a192b3', '#7042a8', '#ebe0fa', '#ffffff', '#d9cce8', '#b5362b'] },
} as const;

export const paletteTokens = ['surface-base', 'surface-sunken', 'surface-raised', 'ink-primary', 'ink-secondary', 'ink-disabled', 'accent', 'accent-weak', 'on-accent', 'border-hairline', 'danger'] as const;
export type PaletteName = keyof typeof themePalettes;
