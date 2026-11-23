/** 設定の色見本と画面に共通で使う配色アセット。 */
export const themePalettes = {
  sakura: { label: '桜', colors: ['#fff8fa', '#f8eaf0', '#ffffff', '#35232c', '#72505f', '#ab8998', '#a52c62', '#fbe1ed', '#ffffff', '#e8cbd7', '#b72e2e'] },
  leaf: { label: '若葉', colors: ['#f7fcf6', '#eaf3e7', '#ffffff', '#233322', '#526a4e', '#8fa58b', '#326c36', '#dcefd9', '#ffffff', '#cadfc6', '#b5362b'] },
  ocean: { label: '海', colors: ['#f5fbff', '#e5f1f8', '#ffffff', '#193344', '#476577', '#88a1b0', '#086d9e', '#d8effa', '#ffffff', '#c4dce9', '#b5362b'] },
  lavender: { label: 'ラベンダー', colors: ['#fbf8ff', '#eee8f7', '#ffffff', '#302641', '#665577', '#a192b3', '#7042a8', '#ebe0fa', '#ffffff', '#d9cce8', '#b5362b'] },
  glass: { label: 'ガラス', colors: ['#eef6fb', '#dfeaf3', '#ffffff', '#14283a', '#3e576b', '#869cad', '#0a6fa5', '#d2eaf7', '#ffffff', '#c3d9e8', '#b5362b'] },
  // 磨いた金: 白寄りの明部・温かい金・黒っぽいブロンズの陰影。アクセントは白地で4.5:1以上の濃い金。
  gold: { label: 'ゴールド', colors: ['#f5eddc', '#e9dcc0', '#fffaf0', '#2a1d0c', '#5e4a2a', '#a08f72', '#8a6110', '#f1e2bd', '#ffffff', '#d8c59c', '#b3261e'] },
  // 鏡面の銀: 無彩色の白・グレー・チャコール。色付き予定の意味を変えないよう面は無彩色に保つ。
  silver: { label: 'シルバー', colors: ['#eceef1', '#dde0e5', '#fbfcfd', '#16191e', '#474d57', '#8d939c', '#3f4754', '#dfe3e9', '#ffffff', '#c4c9d1', '#b3261e'] },
} as const;

export const paletteTokens = ['surface-base', 'surface-sunken', 'surface-raised', 'ink-primary', 'ink-secondary', 'ink-disabled', 'accent', 'accent-weak', 'on-accent', 'border-hairline', 'danger'] as const;
export type PaletteName = keyof typeof themePalettes;
