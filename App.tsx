
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GridCell, Piece, GameState, BlockColor, ThemeConfig, CountryCode, LeaderboardEntry } from './types';
import { GRID_SIZE, SHAPES, COLOR_MAP, FEEDBACK_PHRASES, INITIAL_BACKGROUND, COUNTRIES } from './constants';
import BlockPiece from './components/BlockPiece';
import { generateGameBackground, generateThemeConfig } from './services/geminiService';
import { supabase } from './services/supabaseClient';

const DEFAULT_THEME: ThemeConfig = {
  name: 'Klasik Neon',
  icons: { pink: '💎', cyan: '💠', lime: '🍀', orange: '🔥', purple: '🔮', yellow: '⭐', none: '' },
  gradients: COLOR_MAP
};

const SIMPLE_THEME: ThemeConfig = {
  name: 'Sade Mod',
  icons: { pink: '', cyan: '', lime: '', orange: '', purple: '', yellow: '', none: '' },
  gradients: COLOR_MAP
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(() => {
    const savedVip = localStorage.getItem('isVip') === 'true';
    return {
      grid: Array(GRID_SIZE).fill(null).map(() => 
        Array(GRID_SIZE).fill(null).map(() => ({ occupied: false, color: 'none' as BlockColor }))
      ),
      score: 0,
      highScore: parseInt(localStorage.getItem('highScore') || '0'),
      availablePieces: [],
      feedbackMessage: null,
      isGameOver: false,
      backgroundUrl: savedVip ? INITIAL_BACKGROUND : '',
      themeConfig: savedVip ? DEFAULT_THEME : SIMPLE_THEME,
      isVip: savedVip,
      powerUps: { bomb: 3, refresh: 3 }
    };
  });

  const [activeTab, setActiveTab] = useState<'game' | 'shop' | 'leaderboard' | 'support' | 'account'>('game');
  const [draggedPiece, setDraggedPiece] = useState<Piece | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [previewPos, setPreviewPos] = useState<{ r: number, c: number } | null>(null);
  const [isStuck, setIsStuck] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [vipCode, setVipCode] = useState("");
  const [isBingo, setIsBingo] = useState(false);
  
  // Theme Storage State
  const [savedThemes, setSavedThemes] = useState<ThemeConfig[]>([]);

  // Leaderboard State
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<CountryCode>('GLOBAL');
  const [isCountryMenuOpen, setIsCountryMenuOpen] = useState(false);
  const [leaderboardType, setLeaderboardType] = useState<'GLOBAL' | 'VIP'>('GLOBAL');

  // Auth State
  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const storedThemes = localStorage.getItem('savedThemes');
      if (storedThemes) {
        setSavedThemes(JSON.parse(storedThemes));
      }
    } catch (e) {
      console.error("Tema yükleme hatası:", e);
    }
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      handleSessionUpdate(session);
    };

    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      handleSessionUpdate(session);
    });

    // @ts-ignore
    return () => subscription?.unsubscribe && subscription.unsubscribe();
  }, []);

  const fetchLeaderboard = useCallback(async () => {
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
          const entries: LeaderboardEntry[] = data.map((u: any) => ({
              id: u.id,
              name: u.display_name,
              score: u.high_score,
              country: u.country as CountryCode,
              avatar: u.avatar,
              isVip: u.isVip
          }));
          setLeaderboardData(entries.sort((a, b) => b.score - a.score));
      }
  }, []);

  useEffect(() => {
      if (activeTab === 'leaderboard') {
          fetchLeaderboard();
      }
  }, [activeTab, fetchLeaderboard]);

  const handleSessionUpdate = (session: any) => {
    setSession(session);
    if (session?.user?.user_metadata) {
      const { display_name, high_score, isVip } = session.user.user_metadata;
      
      if (display_name) setDisplayName(display_name);
      
      if (isVip && !localStorage.getItem('isVip')) {
          localStorage.setItem('isVip', 'true');
          setGameState(prev => ({ 
              ...prev, 
              isVip: true,
              themeConfig: prev.isVip ? prev.themeConfig : DEFAULT_THEME,
              backgroundUrl: prev.isVip ? prev.backgroundUrl : INITIAL_BACKGROUND
          }));
      }
      
      if (high_score && high_score > parseInt(localStorage.getItem('highScore') || '0')) {
        localStorage.setItem('highScore', high_score.toString());
        setGameState(prev => ({ ...prev, highScore: high_score }));
      }
    }
  };

  const saveHighScoreToCloud = async (newHighScore: number) => {
    if (!session) return;
    const currentCloudScore = session.user.user_metadata?.high_score || 0;
    if (newHighScore > currentCloudScore) {
      await supabase.auth.updateUser({
        data: { high_score: newHighScore }
      });
      fetchLeaderboard(); 
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    try {
      if (authMode === 'register') {
        const nameToRegister = email.split('@')[0];
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: nameToRegister,
              high_score: gameState.highScore, 
              name_changed: false,
              isVip: gameState.isVip
            }
          }
        });
        if (error) throw error;
        if (data?.session) handleSessionUpdate(data.session);
        showFeedback("KAYIT BAŞARILI!", true);
        setActiveTab('game');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data?.session) handleSessionUpdate(data.session);
        showFeedback("GİRİŞ BAŞARILI!", true);
        setActiveTab('game');
      }
    } catch (error: any) {
      showFeedback(error.message || "HATA", false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setDisplayName('');
    showFeedback("ÇIKIŞ YAPILDI", false);
  };

  const generateNewPieces = useCallback(() => {
    const colors: BlockColor[] = ['pink', 'cyan', 'lime', 'orange', 'purple', 'yellow'];
    return Array(3).fill(null).map(() => ({
      id: Math.random().toString(36).substr(2, 9),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
  }, []);

  const initializeGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      grid: Array(GRID_SIZE).fill(null).map(() => 
        Array(GRID_SIZE).fill(null).map(() => ({ occupied: false, color: 'none' as BlockColor }))
      ),
      score: 0,
      availablePieces: generateNewPieces(),
      isGameOver: false,
      feedbackMessage: null
    }));
    setIsStuck(false);
    setIsBingo(false);
  }, [generateNewPieces]);

  const restartGame = useCallback(() => {
    initializeGame();
  }, [initializeGame]);

  useEffect(() => {
    if (gameState.availablePieces.length === 0) {
      setGameState(prev => ({ ...prev, availablePieces: generateNewPieces() }));
    }
  }, [gameState.availablePieces, generateNewPieces]);

  useEffect(() => {
    initializeGame();
  }, [initializeGame]);

  const showFeedback = (message: string, isBig = false) => {
    if (feedbackTimeout.current) clearTimeout(feedbackTimeout.current);
    if (isBig) setIsBingo(true);
    setGameState(prev => ({ ...prev, feedbackMessage: message }));
    if (navigator.vibrate) navigator.vibrate(isBig ? [150, 50, 150] : 60);
    feedbackTimeout.current = setTimeout(() => {
      setGameState(prev => ({ ...prev, feedbackMessage: null }));
      setIsBingo(false);
    }, 2000);
  };

  const isValidMove = (grid: GridCell[][], piece: Piece, r: number, c: number) => {
    if (r < 0 || c < 0 || r + piece.shape.length > GRID_SIZE || c + piece.shape[0].length > GRID_SIZE) return false;
    for (let pr = 0; pr < piece.shape.length; pr++) {
      for (let pc = 0; pc < piece.shape[0].length; pc++) {
        if (piece.shape[pr][pc] && grid[r + pr][c + pc].occupied) return false;
      }
    }
    return true;
  };

  const checkStuck = (grid: GridCell[][], pieces: Piece[]) => {
    for (const piece of pieces) {
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (isValidMove(grid, piece, r, c)) return false;
        }
      }
    }
    return true;
  };

  const handlePointerDown = (e: React.PointerEvent, piece: Piece) => {
    if (isStuck || gameState.isGameOver || activeTab !== 'game') return;
    (e.target as Element).setPointerCapture(e.pointerId);
    setDraggedPiece(piece);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggedPiece) return;
    setDragPos({ x: e.clientX, y: e.clientY });
    
    if (gridRef.current) {
      const rect = gridRef.current.getBoundingClientRect();
      const cellSize = rect.width / GRID_SIZE;
      const pieceWidth = draggedPiece.shape[0].length * cellSize;
      const pieceHeight = draggedPiece.shape.length * cellSize;
      const c = Math.floor((e.clientX - rect.left - pieceWidth / 2 + cellSize / 2) / cellSize);
      const r = Math.floor((e.clientY - rect.top - pieceHeight / 2 + cellSize / 2) / cellSize);
      
      if (isValidMove(gameState.grid, draggedPiece, r, c)) {
        setPreviewPos({ r, c });
      } else {
        setPreviewPos(null);
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (draggedPiece && previewPos) {
      placePiece(previewPos.r, previewPos.c, draggedPiece);
    }
    setDraggedPiece(null);
    setPreviewPos(null);
  };

  const placePiece = (r: number, c: number, piece: Piece) => {
    const newGrid = gameState.grid.map(row => row.map(cell => ({ ...cell })));
    for (let pr = 0; pr < piece.shape.length; pr++) {
      for (let pc = 0; pc < piece.shape[0].length; pc++) {
        if (piece.shape[pr][pc]) newGrid[r + pr][c + pc] = { occupied: true, color: piece.color };
      }
    }

    const rowsToDelete = new Set<number>();
    const colsToDelete = new Set<number>();
    for (let i = 0; i < GRID_SIZE; i++) {
      if (newGrid[i].every(cell => cell.occupied)) rowsToDelete.add(i);
      if (newGrid.every(row => row[i].occupied)) colsToDelete.add(i);
    }

    let clearedCount = 0;
    if (rowsToDelete.size > 0 || colsToDelete.size > 0) {
      rowsToDelete.forEach(ridx => { for (let j = 0; j < GRID_SIZE; j++) newGrid[ridx][j].exploding = true; clearedCount++; });
      colsToDelete.forEach(cidx => { for (let i = 0; i < GRID_SIZE; i++) newGrid[i][cidx].exploding = true; clearedCount++; });
      const isMegaBingo = (rowsToDelete.size + colsToDelete.size) >= 2;
      showFeedback(isMegaBingo ? "İŞTE BEN BUNA BİNGO DERİM!" : FEEDBACK_PHRASES[Math.floor(Math.random() * FEEDBACK_PHRASES.length)], isMegaBingo);
    }

    const newScore = gameState.score + (piece.shape.flat().filter(x => x).length * 10) + (clearedCount * 120);
    
    let updatedHighScore = gameState.highScore;
    if (newScore > gameState.highScore) {
      updatedHighScore = newScore;
      localStorage.setItem('highScore', newScore.toString());
      saveHighScoreToCloud(newScore);
    }

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      score: newScore,
      highScore: Math.max(newScore, prev.highScore),
      availablePieces: prev.availablePieces.filter(p => p.id !== piece.id)
    }));

    setTimeout(() => {
      setGameState(prev => {
        const cleanedGrid = prev.grid.map(row => row.map(cell => cell.exploding ? { occupied: false, color: 'none' as BlockColor } : cell));
        const finalPieces = prev.availablePieces.length === 0 ? generateNewPieces() : prev.availablePieces;
        if (checkStuck(cleanedGrid, finalPieces)) setIsStuck(true);
        return { ...prev, grid: cleanedGrid, availablePieces: finalPieces };
      });
    }, 400);
  };

  const handleUpdateTheme = async () => {
    if (!gameState.isVip) {
      showFeedback("AI TEMA İÇİN VIP GEREKLİ!", true);
      return;
    }
    if (!aiPrompt.trim()) return;
    setIsAiLoading(true);
    try {
      const { config, imagePrompt } = await generateThemeConfig(aiPrompt);
      const backgroundUrl = await generateGameBackground(imagePrompt);
      
      const newThemeConfig: ThemeConfig = { ...config, imagePrompt, backgroundUrl };

      setGameState(prev => ({ 
        ...prev, 
        themeConfig: newThemeConfig,
        backgroundUrl: backgroundUrl
      }));
      
      setSavedThemes(prev => {
          const newThemes = [newThemeConfig, ...prev].slice(0, 10);
          try {
              localStorage.setItem('savedThemes', JSON.stringify(newThemes));
              return newThemes;
          } catch (e) {
              return prev;
          }
      });

      setAiPrompt("");
      setActiveTab('game');
      showFeedback(`${config.name.toUpperCase()} HAZIR!`, true);
    } catch (err) { 
      alert("Hata oluştu."); 
    } finally { 
      setIsAiLoading(false); 
    }
  };

  const applyVipCode = async () => {
    if (vipCode === "babapromen") {
      setGameState(prev => ({ 
        ...prev, 
        isVip: true,
        themeConfig: DEFAULT_THEME,
        backgroundUrl: INITIAL_BACKGROUND
      }));
      localStorage.setItem('isVip', 'true');
      if (session) await supabase.auth.updateUser({ data: { isVip: true } });
      showFeedback("VIP AKTİF! 👑", true);
      setVipCode("");
    } else {
      showFeedback("GEÇERSİZ KOD", false);
    }
  };

  const getFilteredLeaderboard = () => {
    let list = leaderboardData || [];
    if (leaderboardType === 'VIP') {
      list = list.filter(p => p.isVip);
    } else {
      list = selectedCountry === 'GLOBAL' ? list : list.filter(p => p.country === selectedCountry);
    }
    return list.sort((a, b) => b.score - a.score);
  };

  const isMobile = window.innerWidth < 768;

  // Render Logic
  return (
    <div className="relative w-full h-screen flex overflow-hidden bg-[#020617] text-white select-none font-sans" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {gameState.backgroundUrl ? (
          <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-105 opacity-40 blur-[4px]" style={{ backgroundImage: `url(${gameState.backgroundUrl})` }} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
        )}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      {/* --- LEFT SIDEBAR (Navigation) --- */}
      <div className="relative z-20 w-24 h-full glass-panel border-r border-white/10 flex flex-col items-center py-8 gap-8 shadow-2xl">
         <div className="text-3xl animate-pulse">🌌</div>
         <nav className="flex-1 flex flex-col gap-6 w-full px-2">
            <NavButton active={activeTab === 'game'} onClick={() => setActiveTab('game')} icon="🎮" label="Oyun" />
            <NavButton active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} icon="🏆" label="Lider" />
            <NavButton active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} icon="🛒" label="Mağaza" />
            <NavButton active={activeTab === 'account'} onClick={() => setActiveTab('account')} icon="👤" label="Profil" />
            <NavButton active={activeTab === 'support'} onClick={() => setActiveTab('support')} icon="❓" label="Yardım" />
         </nav>
         <div className="text-[10px] text-white/20 font-mono rotate-90 mb-4 whitespace-nowrap">V 1.0.2 DESKTOP</div>
      </div>

      {/* --- CENTER AREA (Main Content) --- */}
      <div className="flex-1 relative z-10 h-full flex items-center justify-center p-8">
        
        {/* GAME VIEW */}
        {activeTab === 'game' && (
          <div className="flex w-full h-full max-w-7xl gap-8 items-center justify-center">
             
             {/* Main Grid Container */}
             <div className="relative h-[85vh] aspect-square">
                <div 
                  ref={gridRef} 
                  className="glass-panel rounded-[2.5rem] p-6 w-full h-full shadow-[0_0_100px_rgba(34,211,238,0.15)] border border-white/10 relative overflow-hidden bg-black/40 backdrop-blur-xl"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: '8px' }}
                >
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-pink-500/5 pointer-events-none" />
                  {gameState.grid.map((row, rIdx) => row.map((cell, cIdx) => {
                    const isPreview = previewPos && draggedPiece && rIdx >= previewPos.r && rIdx < previewPos.r + draggedPiece.shape.length && cIdx >= previewPos.c && cIdx < previewPos.c + draggedPiece.shape[0].length && draggedPiece.shape[rIdx - previewPos.r][cIdx - previewPos.c];
                    return (
                      <div 
                        key={`${rIdx}-${cIdx}`} 
                        className={`
                          relative w-full h-full rounded-xl flex items-center justify-center transition-all duration-200 z-10
                          ${cell.occupied 
                             ? `bg-gradient-to-br ${gameState.themeConfig.gradients[cell.color]} shadow-lg scale-[0.95] border border-white/20` 
                             : 'bg-white/5 border border-white/5 shadow-inner hover:bg-white/10'}
                          ${cell.exploding ? 'block-explode' : ''} 
                          ${isPreview ? 'bg-white/40 ring-4 ring-white animate-pulse scale-95 opacity-70' : ''}
                        `}
                      >
                        {cell.occupied && <span className="text-3xl md:text-4xl drop-shadow-md filter saturate-150">{gameState.themeConfig.icons[cell.color]}</span>}
                      </div>
                    );
                  }))}

                  {/* Game Over Overlay */}
                  {isStuck && !gameState.isGameOver && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-2xl rounded-[2.5rem] border border-white/10 animate-in zoom-in">
                      <h2 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-600 mb-6 font-['Orbitron']">OYUN BİTTİ</h2>
                      <p className="text-white/60 mb-10 text-2xl font-mono">SKOR: <span className="text-white font-bold">{gameState.score}</span></p>
                      <button onClick={restartGame} className="px-12 py-6 bg-gradient-to-r from-red-600 to-pink-600 rounded-2xl font-black text-2xl shadow-[0_0_50px_rgba(220,38,38,0.5)] hover:scale-105 transition-all">TEKRAR OYNA</button>
                    </div>
                  )}
                </div>
             </div>

             {/* Right Side: Pieces & Stats */}
             <div className="w-80 h-[85vh] flex flex-col gap-6">
                
                {/* Score Cards */}
                <div className="glass-panel p-6 rounded-3xl border border-white/10 flex flex-col gap-4">
                   <div>
                      <div className="text-xs text-cyan-400 font-bold tracking-widest uppercase mb-1">SKOR</div>
                      <div className="text-4xl font-black font-['Orbitron'] text-white drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">{gameState.score}</div>
                   </div>
                   <div className="w-full h-px bg-white/10" />
                   <div>
                      <div className="text-xs text-pink-400 font-bold tracking-widest uppercase mb-1">REKOR</div>
                      <div className="text-2xl font-black font-['Orbitron'] text-white/80">{gameState.highScore}</div>
                   </div>
                </div>

                {/* Available Pieces */}
                <div className="flex-1 glass-panel rounded-3xl border border-white/10 p-4 flex flex-col items-center justify-center gap-8 bg-black/20">
                    <h3 className="text-xs font-bold text-white/30 uppercase tracking-widest">SIRADAKİ BLOKLAR</h3>
                    {gameState.availablePieces.map((piece) => (
                      <div key={piece.id} onPointerDown={(e) => handlePointerDown(e, piece)} className="cursor-grab active:cursor-grabbing hover:scale-105 transition-transform p-4 rounded-2xl hover:bg-white/5 bg-black/20 border border-white/5 w-full flex justify-center">
                        <BlockPiece piece={piece} themeConfig={gameState.themeConfig} isMobile={false} />
                      </div>
                    ))}
                </div>

             </div>
          </div>
        )}

        {/* FEEDBACK OVERLAY (Floating) */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
            {gameState.feedbackMessage && (
                <div className={`
                ${isBingo ? 'text-6xl bingo-text' : 'text-4xl'} 
                font-black text-center text-transparent bg-clip-text 
                bg-gradient-to-b from-white to-cyan-300
                drop-shadow-[0_0_50px_rgba(34,211,238,0.8)]
                px-8 py-4 rounded-2xl backdrop-blur-sm
                transition-all duration-300
                `}>
                {gameState.feedbackMessage}
                </div>
            )}
        </div>

        {/* OTHER TABS (Simplified for Desktop View) */}
        {activeTab === 'shop' && (
           <div className="w-full max-w-4xl glass-panel p-12 rounded-[3rem] h-[80vh] overflow-y-auto no-scrollbar border border-white/10">
               <div className="flex justify-between items-center mb-12">
                   <h2 className="text-6xl font-black font-['Orbitron'] text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500">VIP MAĞAZA</h2>
                   <div className="text-4xl">👑</div>
               </div>
               
               <div className="grid grid-cols-2 gap-8">
                   <div className="space-y-6">
                        <h3 className="text-2xl font-bold">Tema Motoru</h3>
                        <div className="glass-panel p-8 rounded-3xl bg-black/40">
                             <input 
                               type="text" 
                               value={aiPrompt} 
                               onChange={(e) => setAiPrompt(e.target.value)} 
                               placeholder="Hayalindeki temayı yaz..." 
                               className="w-full bg-black/50 border border-white/10 rounded-xl px-6 py-5 text-lg focus:border-indigo-500 outline-none mb-4"
                               disabled={!gameState.isVip}
                             />
                             <button 
                               onClick={handleUpdateTheme}
                               className={`w-full py-5 rounded-xl font-bold text-lg shadow-lg ${gameState.isVip ? 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-[1.02]' : 'bg-white/5 text-white/20 cursor-not-allowed'}`}
                             >
                               {isAiLoading ? 'YAPAY ZEKA ÇALIŞIYOR...' : 'OLUŞTUR'}
                             </button>
                        </div>
                   </div>
                   
                   <div className="space-y-6">
                       <h3 className="text-2xl font-bold">Promosyon Kodu</h3>
                       <div className="glass-panel p-8 rounded-3xl bg-black/40 flex flex-col gap-4">
                           <input 
                             type="text" 
                             value={vipCode}
                             onChange={(e) => setVipCode(e.target.value)}
                             placeholder="Kodu giriniz" 
                             className="w-full bg-black/50 border border-white/10 rounded-xl px-6 py-5 text-lg outline-none"
                           />
                           <button onClick={applyVipCode} className="w-full py-5 bg-yellow-500 text-black font-bold rounded-xl hover:bg-yellow-400">KODU KULLAN</button>
                       </div>
                   </div>
               </div>
           </div>
        )}

        {activeTab === 'leaderboard' && (
            <div className="w-full max-w-4xl glass-panel p-10 rounded-[3rem] h-[80vh] overflow-y-auto no-scrollbar border border-white/10">
                <div className="flex justify-between items-end mb-8">
                    <h2 className="text-5xl font-black font-['Orbitron']">LİDER TABLOSU</h2>
                    <div className="flex gap-2 bg-white/5 p-1 rounded-xl">
                        <button onClick={() => setLeaderboardType('GLOBAL')} className={`px-6 py-2 rounded-lg font-bold ${leaderboardType === 'GLOBAL' ? 'bg-cyan-500 text-black' : 'text-white/50'}`}>GENEL</button>
                        <button onClick={() => setLeaderboardType('VIP')} className={`px-6 py-2 rounded-lg font-bold ${leaderboardType === 'VIP' ? 'bg-yellow-500 text-black' : 'text-white/50'}`}>VIP</button>
                    </div>
                </div>
                
                <div className="space-y-4">
                    {getFilteredLeaderboard().map((entry, idx) => (
                        <div key={entry.id} className="glass-panel p-6 rounded-2xl flex items-center gap-6 hover:bg-white/5 transition-colors">
                            <div className="text-3xl font-black w-12 text-center text-white/30">{idx + 1}</div>
                            <div className="text-4xl">{entry.avatar}</div>
                            <div className="flex-1">
                                <div className="text-xl font-bold">{entry.name} {entry.isVip && '👑'}</div>
                                <div className="text-sm opacity-50">{COUNTRIES.find(c => c.code === entry.country)?.name}</div>
                            </div>
                            <div className="text-3xl font-black text-cyan-400 font-['Orbitron']">{entry.score.toLocaleString()}</div>
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Account & Support tabs would follow similar desktop patterns... */}
        {(activeTab === 'account' || activeTab === 'support') && (
            <div className="glass-panel p-12 rounded-[3rem] text-center max-w-2xl">
                <h2 className="text-4xl font-bold mb-4">{activeTab === 'account' ? 'PROFİL' : 'DESTEK'}</h2>
                <p className="opacity-50">Bu bölüm masaüstü için optimize edildi.</p>
                {activeTab === 'account' && !session && (
                    <div className="mt-8 flex flex-col gap-4">
                        <input className="p-4 rounded-xl bg-white/5 border border-white/10" placeholder="E-Posta" value={email} onChange={e=>setEmail(e.target.value)} />
                        <input className="p-4 rounded-xl bg-white/5 border border-white/10" type="password" placeholder="Şifre" value={password} onChange={e=>setPassword(e.target.value)} />
                        <button onClick={handleAuth} className="p-4 bg-cyan-600 rounded-xl font-bold">Giriş Yap / Kayıt Ol</button>
                    </div>
                )}
                {activeTab === 'account' && session && (
                    <div className="mt-8">
                        <div className="text-2xl mb-4">Hoşgeldin, {session.user.user_metadata?.display_name}</div>
                        <button onClick={handleLogout} className="px-8 py-3 bg-red-500/20 text-red-400 rounded-xl">Çıkış Yap</button>
                    </div>
                )}
            </div>
        )}

      </div>

      {/* DRAG OVERLAY */}
      {draggedPiece && (
        <div 
          className="fixed pointer-events-none z-[100]" 
          style={{ 
            left: dragPos.x, 
            top: dragPos.y, 
            transform: 'translate(-50%, -50%) scale(1.2)',
            filter: 'drop-shadow(0 0 40px rgba(255,255,255,0.4))'
          }}
        >
          <BlockPiece piece={draggedPiece} themeConfig={gameState.themeConfig} isMobile={false} />
        </div>
      )}

    </div>
  );
};

// Desktop Nav Button
const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`
      w-full flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 group
      ${active ? 'bg-white/10 text-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'text-white/40 hover:bg-white/5 hover:text-white'}
    `}
  >
    <span className="text-2xl group-hover:scale-110 transition-transform">{icon}</span>
    <span className="font-bold tracking-wider text-sm">{label}</span>
  </button>
);

export default App;
