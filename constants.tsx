
import { Piece, BlockColor, LeaderboardEntry, CountryCode } from './types';

export const GRID_SIZE = 7;

export const COLOR_MAP: Record<BlockColor, string> = {
  pink: 'from-pink-500 to-rose-600',
  cyan: 'from-cyan-400 to-blue-500',
  lime: 'from-lime-400 to-emerald-500',
  orange: 'from-orange-400 to-amber-600',
  purple: 'from-purple-500 to-indigo-600',
  yellow: 'from-yellow-300 to-orange-400',
  none: 'bg-slate-800/30'
};

export const SHAPES: number[][][] = [
  [[1]], // Dot
  [[1, 1]], // 1x2 Horizontal
  [[1], [1]], // 1x2 Vertical
  [[1, 1, 1]], // 1x3 Horizontal
  [[1], [1], [1]], // 1x3 Vertical
  [[1, 1], [1, 1]], // 2x2 Square
  [[1, 1, 1], [0, 1, 0]], // T-Shape
  [[1, 0], [1, 0], [1, 1]], // L-Shape
  [[1, 1, 1], [1, 1, 1], [1, 1, 1]], // 3x3 Block
  [[1, 1, 0], [0, 1, 1]], // Z-Shape
];

export const FEEDBACK_PHRASES = [
  "HARİKASIN!",
  "İŞTE BEN BUNA BİNGO DERİM!",
  "MUHTEŞEM HAMLE!",
  "RENK ŞÖLENİ!",
  "BLOĞUN EFENDİSİ!",
  "DURDURULAMAZSIN!",
  "BİNGOOO!",
  "HARİKA KOMBO!"
];

export const INITIAL_BACKGROUND = "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?auto=format&fit=crop&q=80&w=1000";

export const COUNTRIES: { code: CountryCode; name: string; flag: string }[] = [
  { code: 'GLOBAL', name: 'Dünya Geneli', flag: '🌍' },
  { code: 'TR', name: 'Türkiye', flag: '🇹🇷' },
  { code: 'US', name: 'ABD', flag: '🇺🇸' },
  { code: 'DE', name: 'Almanya', flag: '🇩🇪' },
  { code: 'BR', name: 'Brezilya', flag: '🇧🇷' },
  { code: 'JP', name: 'Japonya', flag: '🇯🇵' },
];

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { id: '1', name: 'NeonMaster', score: 15420, country: 'TR', avatar: '😎', isVip: true },
  { id: '2', name: 'BlockQueen', score: 14200, country: 'US', avatar: '👑', isVip: true },
  { id: '3', name: 'HanzGlück', score: 12850, country: 'DE', avatar: '🍺', isVip: false },
  { id: '4', name: 'SamuraiX', score: 11000, country: 'JP', avatar: '⚔️', isVip: true },
  { id: '5', name: 'RioDancer', score: 10500, country: 'BR', avatar: '💃', isVip: false },
  { id: '6', name: 'Mehmet_Pro', score: 9800, country: 'TR', avatar: '🧿', isVip: true },
  { id: '7', name: 'JohnDoe', score: 8500, country: 'US', avatar: '🤠', isVip: false },
  { id: '8', name: 'Ayşe_19', score: 8200, country: 'TR', avatar: '🌺', isVip: false },
  { id: '9', name: 'TechnoViking', score: 7900, country: 'DE', avatar: '🎧', isVip: true },
  { id: '10', name: 'Sakura', score: 7500, country: 'JP', avatar: '🌸', isVip: true },
];

export const VIP_REWARDS = [
  { rank: 1, reward: "📱 Akıllı Telefon", desc: "Son Model Pro Serisi" },
  { rank: 2, reward: "🎮 Oyun Konsolu", desc: "Next-Gen Konsol" },
  { rank: 3, reward: "🎧 Premium Kulaklık", desc: "Gürültü Engelleyici" },
  { rank: 4, reward: "💳 2.000₺ Çek", desc: "Dijital Hediye Kartı" },
  { rank: 5, reward: "🎒 Özel Merch", desc: "Hoodie & Şapka Seti" },
  { rank: 10, reward: "👑 1 Ay VIP", desc: "Üyelik Uzatma" }
];
