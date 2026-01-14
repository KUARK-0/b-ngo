
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GridCell, Piece, GameState, BlockColor, ThemeConfig, CountryCode, LeaderboardEntry } from './types';
import { GRID_SIZE, SHAPES, COLOR_MAP, FEEDBACK_PHRASES, INITIAL_BACKGROUND, COUNTRIES, VIP_REWARDS } from './constants';
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
  const [showVipRewardsInfo, setShowVipRewardsInfo] = useState(false);
  const [rewardTooltip, setRewardTooltip] = useState<{
    id: string;
    title: string;
    desc: string;
    x: number;
    y: number;
  } | null>(null);

  // Auth State
  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  
  const gridRef = useRef<HTMLDivElement>(null);
  const feedbackTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- THEME STORAGE LOAD ---
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

  // --- AUTH & SCORE SYNC ---
  useEffect(() => {
    // Session kontrolü
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

  // Liderlik Tablosunu Yükle
  const fetchLeaderboard = useCallback(async () => {
      const { data } = await supabase.from('profiles').select('*');
      if (data) {
          // Gelen veriyi LeaderboardEntry formatına dönüştür
          const entries: LeaderboardEntry[] = data.map((u: any) => ({
              id: u.id,
              name: u.display_name,
              score: u.high_score,
              country: u.country as CountryCode,
              avatar: u.avatar,
              isVip: u.isVip
          }));
          // Puana göre sırala
          setLeaderboardData(entries.sort((a, b) => b.score - a.score));
      }
  }, []);

  // Leaderboard sekmesine geçince veriyi yenile
  useEffect(() => {
      if (activeTab === 'leaderboard') {
          fetchLeaderboard();
      }
  }, [activeTab, fetchLeaderboard]);

  // Oturum açıldığında veya değiştiğinde çalışır
  const handleSessionUpdate = (session: any) => {
    setSession(session);
    if (session?.user?.user_metadata) {
      const { display_name, high_score, isVip } = session.user.user_metadata;
      
      // İsmi güncelle
      if (display_name) setDisplayName(display_name);
      
      // VIP Durumunu Senkronize Et (Hesaptan -> Uygulamaya)
      if (isVip && !localStorage.getItem('isVip')) {
          localStorage.setItem('isVip', 'true');
          setGameState(prev => ({ 
              ...prev, 
              isVip: true,
              themeConfig: prev.isVip ? prev.themeConfig : DEFAULT_THEME,
              backgroundUrl: prev.isVip ? prev.backgroundUrl : INITIAL_BACKGROUND
          }));
      }
      
      // Skoru senkronize et (Eğer veritabanındaki skor, yerelden yüksekse onu al)
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

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) return;
    setAuthLoading(true);
    try {
      const { data, error } = await supabase.auth.updateUser({
        data: { display_name: displayName, name_changed: true }
      });
      if (error) throw error;
      if (data?.user) setSession({ ...session, user: data.user });
      showFeedback("PROFİL GÜNCELLENDİ!", true);
      setIsEditingProfile(false);
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

  // --- DRAG AND DROP LOGIC IMPROVED ---
  const handlePointerDown = (e: React.PointerEvent, piece: Piece) => {
    if (isStuck || gameState.isGameOver || activeTab !== 'game') return;
    
    // IMPORTANT: Capture the pointer so we don't lose the drag if moving fast or off-element
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
      
      // Center calculation adjusted for touch
      const pieceWidth = draggedPiece.shape[0].length * cellSize;
      const pieceHeight = draggedPiece.shape.length * cellSize;
      
      // Calculate column and row based on pointer position relative to grid
      // Using a small offset to allow seeing the piece under the finger
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
    // Release capture
    (e.target as Element).releasePointerCapture(e.pointerId);

    if (draggedPiece && previewPos) {
      placePiece(previewPos.r, previewPos.c, draggedPiece);
    }
    
    // Reset state whether placed or not
    setDraggedPiece(null);
    setPreviewPos(null);
  };
  // ------------------------------------

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
              const safeTheme = { ...newThemeConfig, backgroundUrl: undefined };
              const safeThemes = [safeTheme, ...prev].slice(0, 10);
              try {
                localStorage.setItem('savedThemes', JSON.stringify(safeThemes));
                return safeThemes;
              } catch(e2) { return prev; }
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

  const handleSelectTheme = async (theme: ThemeConfig) => {
      setGameState(prev => ({
          ...prev,
          themeConfig: theme,
          backgroundUrl: theme.backgroundUrl || prev.backgroundUrl
      }));

      if (!theme.backgroundUrl && theme.imagePrompt) {
          showFeedback("ARKA PLAN YÜKLENİYOR...", false);
          try {
              const newBg = await generateGameBackground(theme.imagePrompt);
              setGameState(prev => {
                  if (prev.themeConfig.name === theme.name) return { ...prev, backgroundUrl: newBg };
                  return prev;
              });
          } catch (e) { console.error(e); }
      } else {
          showFeedback(`${theme.name.toUpperCase()} SEÇİLDİ`, true);
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

  return (
    <div className="relative w-full h-screen flex flex-col items-center font-sans text-white select-none overflow-hidden bg-[#020617]" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      
      {/* Background Layer with Improved Overlay */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        {gameState.backgroundUrl ? (
          <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-105 opacity-50 blur-[2px]" style={{ backgroundImage: `url(${gameState.backgroundUrl})` }} />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#312e81]" />
        )}
        {/* Richer Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#020617] via-[#020617]/70 to-transparent" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent" />
      </div>

      {/* Main Content Container */}
      <div className="relative z-10 w-full max-w-xl h-full flex flex-col">
        
        {/* Header - Compact & Stylish */}
        <header className="flex justify-between items-center px-6 pt-6 pb-2 shrink-0">
           <div className="glass-button rounded-xl px-4 py-2 flex flex-col items-center min-w-[80px] hover:bg-white/5 transition-colors">
              <span className="text-[10px] text-cyan-400 font-bold tracking-wider">SKOR</span>
              <span className="text-2xl font-black font-['Orbitron'] text-white drop-shadow-md">{gameState.score}</span>
           </div>
           
           <div className="flex flex-col items-center">
              <h1 className="text-3xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-white to-pink-500 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">
                NEON BINGO
              </h1>
              {gameState.isVip && <span className="text-[9px] bg-gradient-to-r from-yellow-400 to-amber-600 text-black px-2 py-0.5 rounded font-black tracking-widest shadow-[0_0_10px_rgba(251,191,36,0.6)]">VIP EDITION</span>}
           </div>

           <div className="glass-button rounded-xl px-4 py-2 flex flex-col items-center min-w-[80px] hover:bg-white/5 transition-colors">
              <span className="text-[10px] text-pink-400 font-bold tracking-wider">REKOR</span>
              <span className="text-2xl font-black font-['Orbitron'] text-white drop-shadow-md">{gameState.highScore}</span>
           </div>
        </header>

        {/* Dynamic Content Area */}
        <main className="flex-1 relative flex flex-col items-center justify-start overflow-hidden w-full">
          
          {/* GAME TAB */}
          {activeTab === 'game' && (
            <div className="w-full h-full flex flex-col items-center justify-center gap-4 p-4 animate-in fade-in duration-500">
              
              {/* Feedback Overlay */}
              <div className="absolute top-[10%] left-0 right-0 z-50 flex justify-center pointer-events-none h-24 items-center">
                {gameState.feedbackMessage && (
                  <div className={`
                    ${isBingo ? 'text-4xl md:text-5xl bingo-text' : 'text-2xl md:text-3xl'} 
                    font-black text-center text-transparent bg-clip-text 
                    bg-gradient-to-b from-white to-cyan-300
                    drop-shadow-[0_0_30px_rgba(34,211,238,0.8)]
                    px-4 py-2 rounded-xl backdrop-blur-sm
                  `}>
                    {gameState.feedbackMessage}
                  </div>
                )}
              </div>

              {/* Game Grid - MATCHED TO SHOP STYLE */}
              <div className="relative w-full aspect-square max-w-[400px] mx-auto">
                <div 
                  ref={gridRef} 
                  className="glass-panel rounded-[2.5rem] p-4 w-full h-full shadow-[0_0_80px_rgba(34,211,238,0.1)] border border-white/10 relative overflow-hidden bg-black/40 backdrop-blur-xl"
                  style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: '6px' }}
                >
                  {/* Subtle Grid Background Effect */}
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 via-transparent to-pink-500/10 pointer-events-none" />

                  {gameState.grid.map((row, rIdx) => row.map((cell, cIdx) => {
                    const isPreview = previewPos && draggedPiece && rIdx >= previewPos.r && rIdx < previewPos.r + draggedPiece.shape.length && cIdx >= previewPos.c && cIdx < previewPos.c + draggedPiece.shape[0].length && draggedPiece.shape[rIdx - previewPos.r][cIdx - previewPos.c];
                    return (
                      <div 
                        key={`${rIdx}-${cIdx}`} 
                        className={`
                          relative w-full h-full rounded-xl flex items-center justify-center transition-all duration-200 z-10
                          ${cell.occupied 
                             ? `bg-gradient-to-br ${gameState.themeConfig.gradients[cell.color]} shadow-lg scale-[0.92] border border-white/20` 
                             : 'bg-white/5 border border-white/5 shadow-inner hover:bg-white/10'}
                          ${cell.exploding ? 'block-explode' : ''} 
                          ${isPreview ? 'bg-white/40 ring-2 ring-white animate-pulse scale-90 opacity-70' : ''}
                        `}
                      >
                        {cell.occupied && <span className="text-xl md:text-2xl drop-shadow-md filter saturate-150">{gameState.themeConfig.icons[cell.color]}</span>}
                      </div>
                    );
                  }))}

                  {isStuck && !gameState.isGameOver && (
                    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/85 backdrop-blur-xl rounded-[2.5rem] p-6 text-center animate-in zoom-in duration-300 border border-white/10">
                      <div className="text-6xl mb-4 animate-bounce">💀</div>
                      <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-600 mb-2 font-['Orbitron']">OYUN BİTTİ</h2>
                      <p className="text-white/60 mb-8 font-mono tracking-wider">SKOR: <span className="text-white font-bold text-xl">{gameState.score}</span></p>
                      
                      <button onClick={restartGame} className="w-full py-5 bg-gradient-to-r from-red-600 to-pink-600 rounded-2xl font-black text-xl shadow-[0_0_30px_rgba(220,38,38,0.4)] hover:scale-105 active:scale-95 transition-all">
                        TEKRAR OYNA ↺
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Pieces Area - UPDATED TO DOCK STYLE */}
              <div className="w-full max-w-[400px] h-36 glass-panel rounded-[2.5rem] flex items-center justify-around p-4 mt-2 border border-white/10 bg-black/30 backdrop-blur-xl shadow-2xl">
                {gameState.availablePieces.map((piece) => (
                  <div key={piece.id} onPointerDown={(e) => handlePointerDown(e, piece)} className="cursor-grab active:cursor-grabbing hover:scale-110 transition-transform touch-none p-2 rounded-2xl hover:bg-white/5">
                    <BlockPiece piece={piece} themeConfig={gameState.themeConfig} isMobile={isMobile} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SHOP TAB */}
          {activeTab === 'shop' && (
            <div className="w-full h-full overflow-y-auto no-scrollbar p-6 space-y-6 pb-24 animate-in slide-in-from-right duration-300">
              <div className="text-center mb-6">
                <h2 className="text-5xl font-black font-['Orbitron'] text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-amber-400 to-orange-500 drop-shadow-lg">VIP MAĞAZA</h2>
                <div className="h-1 w-24 bg-gradient-to-r from-transparent via-yellow-500 to-transparent mx-auto mt-3 rounded-full"/>
              </div>

              {/* VIP Status */}
              <div className="glass-panel p-6 rounded-[2rem] relative overflow-hidden group border border-white/10 hover:border-yellow-500/30 transition-colors">
                <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${gameState.isVip ? 'from-yellow-400 to-amber-800' : 'from-gray-600 to-gray-900'}`} />
                <div className="relative z-10 flex justify-between items-center">
                   <div>
                     <h3 className="text-2xl font-black">{gameState.isVip ? 'PREMIUM ÜYELİK' : 'STANDART ÜYELİK'}</h3>
                     <p className="text-sm text-white/50 mt-1">{gameState.isVip ? 'Tüm ayrıcalıklara sahipsiniz.' : 'AI özellikleri ve özel lig kilitli.'}</p>
                   </div>
                   <div className="text-5xl drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">{gameState.isVip ? '👑' : '🔒'}</div>
                </div>
              </div>

              {/* AI Generator */}
              <div className="glass-panel p-6 rounded-[2rem] space-y-5 border border-white/10">
                 <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-[0_0_20px_rgba(79,70,229,0.4)]">✨</div>
                    <div>
                      <h3 className="font-bold text-lg">AI Tema Oluşturucu</h3>
                      <p className="text-[10px] text-white/40 uppercase font-black tracking-widest">Powered by Gemini 2.5</p>
                    </div>
                 </div>
                 
                 <div className="relative group">
                    <input 
                      type="text" 
                      value={aiPrompt} 
                      onChange={(e) => setAiPrompt(e.target.value)} 
                      placeholder="Örn: Cyberpunk Tokyo, Candy Land..." 
                      className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-indigo-500 focus:outline-none transition-all placeholder:text-white/20 group-hover:bg-black/50"
                      disabled={!gameState.isVip}
                    />
                    {!gameState.isVip && <div className="absolute inset-y-0 right-4 flex items-center text-[10px] text-yellow-500 font-black tracking-widest">VIP GEREKLİ</div>}
                 </div>

                 <button 
                   onClick={handleUpdateTheme}
                   disabled={!gameState.isVip || isAiLoading}
                   className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-lg ${!gameState.isVip ? 'bg-white/5 text-white/30 cursor-not-allowed' : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:scale-[1.02] active:scale-95'}`}
                 >
                   {isAiLoading ? 'OLUŞTURULUYOR...' : 'TEMA OLUŞTUR'}
                 </button>
              </div>

              {/* VIP Code */}
              <div className="glass-panel p-5 rounded-2xl flex gap-3 items-center">
                 <span className="text-xl">🎟️</span>
                 <input 
                   type="text" 
                   value={vipCode}
                   onChange={(e) => setVipCode(e.target.value)}
                   placeholder="Promosyon Kodu" 
                   className="flex-1 bg-transparent text-sm focus:outline-none font-mono text-white/80"
                 />
                 <button onClick={applyVipCode} className="text-[10px] font-black bg-white/10 px-4 py-2 rounded-xl hover:bg-yellow-500 hover:text-black transition-colors">UYGULA</button>
              </div>
            </div>
          )}

          {/* LEADERBOARD TAB - NOW WITH BLUR LOGIC */}
          {activeTab === 'leaderboard' && (
             <div className="w-full h-full overflow-y-auto no-scrollbar p-6 space-y-5 pb-24 animate-in slide-in-from-left duration-300">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-3xl font-black font-['Orbitron'] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">SIRALAMA</h2>
                  <div className="flex bg-white/10 rounded-xl p-1 border border-white/5">
                     <button onClick={() => setLeaderboardType('GLOBAL')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${leaderboardType === 'GLOBAL' ? 'bg-cyan-500 text-black shadow-lg' : 'text-white/50 hover:text-white'}`}>GENEL</button>
                     <button onClick={() => setLeaderboardType('VIP')} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold transition-all ${leaderboardType === 'VIP' ? 'bg-yellow-500 text-black shadow-lg' : 'text-white/50 hover:text-white'}`}>VIP</button>
                  </div>
                </div>

                {/* Country Selector for Global */}
                {leaderboardType === 'GLOBAL' && (
                   <div className="flex justify-end">
                       <button onClick={() => setIsCountryMenuOpen(!isCountryMenuOpen)} className="flex items-center gap-2 text-xs font-bold bg-white/5 px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/10">
                           <span>{COUNTRIES.find(c => c.code === selectedCountry)?.flag}</span>
                           <span>{selectedCountry === 'GLOBAL' ? 'Dünya' : selectedCountry}</span>
                           <span className="opacity-50 text-[10px]">▼</span>
                       </button>
                   </div>
                )}
                {isCountryMenuOpen && (
                   <div className="bg-[#0f172a] border border-white/20 rounded-xl p-2 absolute right-6 z-50 shadow-2xl">
                       {COUNTRIES.map(c => (
                           <div key={c.code} onClick={() => {setSelectedCountry(c.code); setIsCountryMenuOpen(false)}} className="px-3 py-2 hover:bg-white/10 rounded-lg text-xs font-bold flex gap-2 cursor-pointer">
                               <span>{c.flag}</span> <span>{c.name}</span>
                           </div>
                       ))}
                   </div>
                )}

                {/* Leaderboard List Container */}
                <div className="vip-blur-container relative min-h-[300px]">
                   
                   {/* VIP LOCK OVERLAY - Only shows if VIP tab selected AND User NOT VIP */}
                   {leaderboardType === 'VIP' && !gameState.isVip && (
                       <div className="vip-lock-overlay rounded-[2rem] backdrop-blur-[2px]">
                           <div className="bg-black/60 backdrop-blur-md p-8 rounded-[2.5rem] border border-yellow-500/30 flex flex-col items-center text-center shadow-2xl transform scale-100">
                               <div className="text-6xl mb-4 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]">🔒</div>
                               <h3 className="text-2xl font-black text-yellow-400 mb-2">VIP ÖZEL LİGİ</h3>
                               <p className="text-xs text-white/60 mb-6 max-w-[200px]">Bu sıralamayı ve özel ödülleri sadece VIP üyeler görebilir.</p>
                               <button 
                                 onClick={() => setActiveTab('shop')}
                                 className="bg-yellow-500 hover:bg-yellow-400 text-black px-6 py-3 rounded-xl font-bold text-sm shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all active:scale-95"
                               >
                                 VIP OL
                               </button>
                           </div>
                       </div>
                   )}

                   {/* The Content (Blurred if needed via CSS class) */}
                   <div className={`space-y-3 ${leaderboardType === 'VIP' && !gameState.isVip ? 'vip-blurred-content' : ''}`}>
                       {getFilteredLeaderboard().map((entry, idx) => (
                          <div key={entry.id} className={`glass-panel p-4 rounded-2xl flex items-center gap-4 stagger-item ${idx < 3 ? 'border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-transparent' : ''}`}>
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-lg ${idx === 0 ? 'bg-yellow-400 text-black' : idx === 1 ? 'bg-slate-300 text-black' : idx === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-white/40'}`}>
                                {idx + 1}
                             </div>
                             <div className="flex-1">
                                <div className="flex items-center gap-2">
                                   <span className="text-lg">{entry.avatar}</span>
                                   <span className="font-bold text-sm truncate max-w-[120px]">{entry.name}</span>
                                   {entry.isVip && <span className="text-[10px] bg-yellow-500/20 text-yellow-300 px-1.5 py-0.5 rounded border border-yellow-500/30">VIP</span>}
                                </div>
                                <div className="flex items-center gap-1 opacity-40 text-[10px] mt-0.5">
                                    <span>{COUNTRIES.find(c => c.code === entry.country)?.flag}</span>
                                    <span>{entry.country}</span>
                                </div>
                             </div>
                             <div className="text-right">
                                <span className="font-black font-['Orbitron'] text-cyan-400 text-lg drop-shadow-[0_0_5px_rgba(34,211,238,0.5)]">{entry.score.toLocaleString()}</span>
                             </div>
                          </div>
                       ))}
                   </div>
                </div>
             </div>
          )}
          
          {/* ACCOUNT TAB */}
          {activeTab === 'account' && (
             <div className="w-full h-full p-6 flex flex-col justify-center animate-in zoom-in-95 duration-300">
                {session ? (
                   <div className="glass-panel p-8 rounded-[2.5rem] text-center space-y-6 border border-white/10">
                      <div className="w-28 h-28 mx-auto bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full flex items-center justify-center text-5xl shadow-[0_0_40px_rgba(6,182,212,0.4)] ring-4 ring-black/50">
                         {session.user.user_metadata?.avatar || '👤'}
                      </div>
                      <div>
                         <h2 className="text-3xl font-black">{session.user.user_metadata?.display_name || 'Oyuncu'}</h2>
                         <p className="text-sm text-white/40 mt-1 font-mono">{session.user.email}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                         <div className="bg-black/30 p-5 rounded-2xl border border-white/5">
                            <div className="text-[10px] text-white/30 mb-1 font-black uppercase tracking-widest">REKOR</div>
                            <div className="text-2xl font-black text-cyan-400">{gameState.highScore}</div>
                         </div>
                         <div className="bg-black/30 p-5 rounded-2xl border border-white/5">
                             <div className="text-[10px] text-white/30 mb-1 font-black uppercase tracking-widest">ÜYELİK</div>
                             <div className="text-2xl font-black text-yellow-400">{gameState.isVip ? 'VIP' : 'STD'}</div>
                         </div>
                      </div>

                      <button onClick={handleLogout} className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold text-sm transition-colors border border-red-500/10">ÇIKIŞ YAP</button>
                   </div>
                ) : (
                   <div className="glass-panel p-8 rounded-[2.5rem] space-y-6 border border-white/10 shadow-2xl">
                      <div className="text-center">
                         <h2 className="text-3xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-400">HESAP GİRİŞİ</h2>
                         <p className="text-sm text-white/40">Skorlarını kaydetmek ve sıralamaya girmek için giriş yap.</p>
                      </div>

                      <div className="space-y-4">
                         <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="E-Posta" className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-cyan-500 focus:outline-none transition-all" />
                         <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Şifre" className="w-full bg-black/40 border border-white/10 rounded-2xl px-5 py-4 text-sm focus:border-cyan-500 focus:outline-none transition-all" />
                      </div>

                      <div className="flex gap-3">
                         <button onClick={() => setAuthMode('login')} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${authMode === 'login' ? 'bg-cyan-600 text-white shadow-lg' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>GİRİŞ</button>
                         <button onClick={() => setAuthMode('register')} className={`flex-1 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${authMode === 'register' ? 'bg-pink-600 text-white shadow-lg' : 'bg-white/5 text-white/30 hover:bg-white/10'}`}>KAYIT</button>
                      </div>
                      
                      <button onClick={handleAuth} disabled={authLoading} className="w-full py-5 bg-white text-black rounded-2xl font-black text-sm hover:scale-[1.02] transition-transform shadow-[0_0_20px_rgba(255,255,255,0.3)]">
                         {authLoading ? '...' : (authMode === 'login' ? 'GİRİŞ YAP' : 'HESAP OLUŞTUR')}
                      </button>
                   </div>
                )}
             </div>
          )}

          {/* SUPPORT TAB */}
          {activeTab === 'support' && (
             <div className="w-full h-full p-6 pb-24 overflow-y-auto no-scrollbar animate-in slide-in-from-bottom duration-300">
                <h2 className="text-4xl font-black text-center mb-8 font-['Orbitron'] text-white/90">NASIL OYNANIR?</h2>
                <div className="space-y-5">
                   <div className="glass-panel p-5 rounded-[2rem] flex gap-5 items-center border border-white/10">
                      <div className="w-14 h-14 rounded-full bg-cyan-500/20 flex items-center justify-center text-2xl shadow-inner">🧱</div>
                      <div>
                         <h4 className="font-bold text-lg">Blokları Yerleştir</h4>
                         <p className="text-sm text-white/50">Parçaları sürükle ve 7x7 alana bırak.</p>
                      </div>
                   </div>
                   <div className="glass-panel p-5 rounded-[2rem] flex gap-5 items-center border border-white/10">
                      <div className="w-14 h-14 rounded-full bg-pink-500/20 flex items-center justify-center text-2xl shadow-inner">💥</div>
                      <div>
                         <h4 className="font-bold text-lg">Patlat</h4>
                         <p className="text-sm text-white/50">Satır veya sütunları doldurarak yok et.</p>
                      </div>
                   </div>
                   <div className="glass-panel p-5 rounded-[2rem] flex gap-5 items-center border border-white/10">
                      <div className="w-14 h-14 rounded-full bg-yellow-500/20 flex items-center justify-center text-2xl shadow-inner">👑</div>
                      <div>
                         <h4 className="font-bold text-lg">Lider Ol</h4>
                         <p className="text-sm text-white/50">En yüksek puanı yaparak VIP listeye gir.</p>
                      </div>
                   </div>
                </div>
             </div>
          )}

        </main>

        {/* Bottom Navigation Dock - iOS Style & Floating */}
        <div className="shrink-0 px-6 pb-8 pt-2 z-50">
           <nav className="glass-panel rounded-[2.5rem] px-2 py-3 flex justify-around items-center shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 backdrop-blur-2xl">
              <NavButton active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} icon="🏆" label="Lider" />
              <NavButton active={activeTab === 'game'} onClick={() => setActiveTab('game')} icon="🎮" label="Oyun" />
              <NavButton active={activeTab === 'shop'} onClick={() => setActiveTab('shop')} icon="🛒" label="Mağaza" />
              <NavButton active={activeTab === 'account'} onClick={() => setActiveTab('account')} icon="👤" label="Hesap" />
              <NavButton active={activeTab === 'support'} onClick={() => setActiveTab('support')} icon="❓" label="Yardım" />
           </nav>
        </div>
      </div>

      {/* Draggable Piece Overlay */}
      {draggedPiece && (
        <div 
          className="fixed pointer-events-none z-[100]" 
          style={{ 
            left: dragPos.x, 
            top: dragPos.y, 
            transform: 'translate(-50%, -50%) scale(1.5)',
            filter: 'drop-shadow(0 0 25px rgba(255,255,255,0.5))'
          }}
        >
          <BlockPiece piece={draggedPiece} themeConfig={gameState.themeConfig} isMobile={isMobile} />
        </div>
      )}
    </div>
  );
};

// Helper Component for Navigation with Enhanced Glow
const NavButton: React.FC<{ active: boolean; onClick: () => void; icon: string; label: string }> = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick} 
    className={`
      relative flex flex-col items-center justify-center transition-all duration-300 w-12 h-12 hover:bg-white/5 rounded-xl
      ${active ? 'text-cyan-400 scale-110' : 'text-white/40 hover:text-white'}
    `}
  >
    <span className="text-2xl">{icon}</span>
    {active && <span className="absolute -bottom-1 w-1 h-1 bg-cyan-400 rounded-full shadow-[0_0_8px_currentColor]"/>}
  </button>
);

export default App;
