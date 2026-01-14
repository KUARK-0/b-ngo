
import React from 'react';
import { Piece, ThemeConfig } from '../types';

interface BlockPieceProps {
  piece: Piece;
  themeConfig: ThemeConfig;
  isSelected?: boolean;
  onSelect?: (piece: Piece) => void;
  isMobile: boolean;
}

const BlockPiece: React.FC<BlockPieceProps> = ({ piece, themeConfig, isSelected, onSelect, isMobile }) => {
  const cellSize = isMobile ? 26 : 34;

  return (
    <div
      onClick={() => onSelect?.(piece)}
      className={`
        relative p-2 rounded-2xl transition-all duration-300 cursor-pointer
        ${isSelected ? 'bg-white/20 scale-110 shadow-[0_0_30px_rgba(255,255,255,0.3)] ring-2 ring-white' : 'hover:bg-white/5'}
      `}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${piece.shape[0].length}, ${cellSize}px)`,
        gridTemplateRows: `repeat(${piece.shape.length}, ${cellSize}px)`,
        gap: '5px'
      }}
    >
      {piece.shape.map((row, rIdx) =>
        row.map((cell, cIdx) => (
          <div
            key={`${rIdx}-${cIdx}`}
            className={`
              w-full h-full rounded-lg border border-white/10 flex items-center justify-center text-[18px]
              ${cell ? `bg-gradient-to-br ${themeConfig.gradients[piece.color]} shadow-[inset_0_0_12px_rgba(255,255,255,0.5)]` : 'opacity-0'}
            `}
          >
             {cell && <span className="drop-shadow-[0_2px_2px_rgba(0,0,0,0.5)] select-none leading-none">{themeConfig.icons[piece.color]}</span>}
          </div>
        ))
      )}
    </div>
  );
};

export default BlockPiece;
