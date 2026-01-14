import React, { memo } from 'react';
import { Piece, ThemeConfig } from '../types';

interface BlockPieceProps {
  piece: Piece;
  themeConfig: ThemeConfig;
  onSelect?: (piece: Piece, e: React.PointerEvent) => void;
}

const BlockPiece: React.FC<BlockPieceProps> = ({ piece, themeConfig, onSelect }) => {
  return (
    <div
      onPointerDown={(e) => {
        // Mobilde kaydırmayı engelle ve event'i yukarı taşı
        e.preventDefault();
        onSelect?.(piece, e);
      }}
      className="relative p-2 rounded-xl cursor-grab active:cursor-grabbing hover:bg-white/5 transition-transform active:scale-95 touch-none select-none"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${piece.shape[0].length}, 1fr)`,
        gap: '4px',
        width: `${piece.shape[0].length * 32}px` // Genişliği içeriğe göre sabitle
      }}
    >
      {piece.shape.map((row, rIdx) =>
        row.map((cell, cIdx) => (
          <div
            key={`${rIdx}-${cIdx}`}
            className={`
              w-7 h-7 sm:w-8 sm:h-8 aspect-square rounded flex items-center justify-center text-sm shadow-sm
              ${cell ? `bg-gradient-to-br ${themeConfig.gradients[piece.color]} border border-white/10` : 'opacity-0 pointer-events-none'}
            `}
          >
             {cell && <span className="text-base sm:text-lg filter drop-shadow-md select-none">{themeConfig.icons[piece.color]}</span>}
          </div>
        ))
      )}
    </div>
  );
};

export default memo(BlockPiece);