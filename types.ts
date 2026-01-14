
export type BlockColor = 'pink' | 'cyan' | 'lime' | 'orange' | 'purple' | 'yellow' | 'none';

export type CountryCode = 'TR' | 'US' | 'DE' | 'BR' | 'JP' | 'GLOBAL';

export interface ThemeConfig {
  icons: Record<BlockColor, string>;
  gradients: Record<BlockColor, string>;
  name: string;
}

export interface Piece {
  id: string;
  shape: number[][];
  color: BlockColor;
}

export interface GridCell {
  occupied: boolean;
  color: BlockColor;
  exploding?: boolean;
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  country: CountryCode;
  avatar: string;
  isVip?: boolean;
}

export interface GameState {
  grid: GridCell[][];
  score: number;
  highScore: number;
  availablePieces: Piece[];
  feedbackMessage: string | null;
  isGameOver: boolean;
  backgroundUrl: string;
  themeConfig: ThemeConfig;
  isVip: boolean;
  powerUps: {
    bomb: number;
    refresh: number;
  };
}
