
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
              // Eğer yeni VIP olduysa varsayılan temayı yükle
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

  // Yeni rekor kırıldığında veritabanına kaydet
  const saveHighScoreToCloud = async (newHighScore: number) => {
    if (!session) return;
    
    // Sadece skor artmışsa güncelleme isteği at
    const currentCloudScore = session.user.user_metadata?.high_score || 0;
    if (newHighScore > currentCloudScore) {
      await supabase.auth.updateUser({
        data: { high_score: newHighScore }
      });
      // Leaderboard verisini arka planda güncelle (Eğer o an leaderboard açıksa)
      fetchLeaderboard(); 
    }
  };
  // -------------------------

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    
    try {
      if (authMode === 'register') {
        // İsim girmeyi zorunlu kıl (veya varsayılan ata)
        const nameToRegister = email.split('@')[0];
        
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: nameToRegister,
              high_score: gameState.highScore, // Mevcut skoru kaydet
              name_changed: false, // İlk başta isim değiştirilmedi olarak işaretle
              isVip: gameState.isVip // Eğer kayıt olurken zaten VIP ise kaydet
            }
          }
        });
        if (error) throw error;
        
        // Garanti olsun diye manuel güncelleme
        if (data?.session) handleSessionUpdate(data.session);

        showFeedback("KAYIT BAŞARILI! HOŞGELDİN.", true);
        setActiveTab('game');
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        
        // Garanti olsun diye manuel güncelleme
        if (data?.session) handleSessionUpdate(data.session);

        showFeedback("GİRİŞ BAŞARILI! HOŞGELDİN.", true);
        setActiveTab('game');
      }
    } catch (error: any) {
      showFeedback(error.message || "BİR HATA OLUŞTU", false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!displayName.trim()) return;
    setAuthLoading(true);
    try {
      // İsim değiştirildi olarak işaretle (name_changed: true)
      const { data, error } = await supabase.auth.updateUser({
        data: { 
          display_name: displayName,
          name_changed: true 
        }
      });
      
      if (error) throw error;
      
      if (data?.user) {
         setSession({ ...session, user: data.user });
      }

      showFeedback("PROFİL GÜNCELLENDİ!", true);
      setIsEditingProfile(false);
    } catch (error: any) {
      showFeedback(error.message || "GÜNCELLEME HATASI", false);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setDisplayName('');
    showFeedback("HESAP DEĞİŞTİRİLDİ", false);
    // Çıkış yapınca otomatik olarak login formuna düşer (session null olduğu için)
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
      if (isValidMove(gameState.grid, draggedPiece, r, c)) setPreviewPos({ r, c });
      else setPreviewPos(null);
    }
  };

  const handlePointerUp = () => {
    if (draggedPiece && previewPos) placePiece(previewPos.r, previewPos.c, draggedPiece);
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
    
    // Yüksek skor kontrolü
    let updatedHighScore = gameState.highScore;
    if (newScore > gameState.highScore) {
      updatedHighScore = newScore;
      localStorage.setItem('highScore', newScore.toString());
      saveHighScoreToCloud(newScore); // Buluta kaydet
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
      
      const newThemeConfig: ThemeConfig = {
          ...config,
          imagePrompt,
          backgroundUrl
      };

      setGameState(prev => ({ 
        ...prev, 
        themeConfig: newThemeConfig,
        backgroundUrl: backgroundUrl
      }));
      
      // Temayı listeye kaydet
      setSavedThemes(prev => {
          const newThemes = [newThemeConfig, ...prev].slice(0, 10); // Son 10 tema
          
          try {
              localStorage.setItem('savedThemes', JSON.stringify(newThemes));
              return newThemes;
          } catch (e) {
              // Depolama alanı dolduysa, arka planı (büyük veriyi) çıkarıp kaydetmeyi dene
              console.warn("Storage Full - Saving without background data");
              const safeTheme = { ...newThemeConfig, backgroundUrl: undefined };
              const safeThemes = [safeTheme, ...prev].slice(0, 10);
              try {
                  localStorage.setItem('savedThemes', JSON.stringify(safeThemes));
                  return safeThemes;
              } catch (e2) {
                  return prev; // Hiçbir şey yapılamadı
              }
          }
      });

      setAiPrompt("");
      setActiveTab('game');
      showFeedback(`${config.name.toUpperCase()} TEMASI HAZIR!`, true);
    } catch (err) { 
      alert("AI Tema hatası! Lütfen başka bir şey deneyin."); 
    } finally { 
      setIsAiLoading(false); 
    }
  };

  const handleSelectTheme = async (theme: ThemeConfig) => {
      // 1. Temayı hemen uygula (ikonlar, renkler)
      setGameState(prev => ({
          ...prev,
          themeConfig: theme,
          backgroundUrl: theme.backgroundUrl || prev.backgroundUrl
      }));

      // 2. Eğer arka plan silinmişse (depolama tasarrufu için), yeniden oluştur
      if (!theme.backgroundUrl && theme.imagePrompt) {
          showFeedback("ARKA PLAN OLUŞTURULUYOR...", false);
          try {
              const newBg = await generateGameBackground(theme.imagePrompt);
              setGameState(prev => {
                  // Kullanıcı bu arada başka tema seçmediyse uygula
                  if (prev.themeConfig.name === theme.name) {
                      return { ...prev, backgroundUrl: newBg };
                  }
                  return prev;
              });
          } catch (e) {
              console.error("BG Regen Error", e);
          }
      } else {
          showFeedback(`${theme.name.toUpperCase()} YÜKLENDİ`, true);
      }
  };

  const handleDeleteTheme = (e: React.MouseEvent, index: number) => {
      e.stopPropagation();
      setSavedThemes(prev => {
          const updated = prev.filter((_, i) => i !== index);
          localStorage.setItem('savedThemes', JSON.stringify(updated));
          return updated;
      });
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
      
      // VIP kodunu hesaba da işle
      if (session) {
          await supabase.auth.updateUser({
              data: { isVip: true }
          });
      }

      showFeedback("VIP AKTİF EDİLDİ! 👑", true);
      setVipCode("");
    } else {
      showFeedback("GEÇERSİZ KOD!", false);
    }
  };

  const getFilteredLeaderboard = () => {
    let list = leaderboardData; // Artık sahte veri yerine state kullanıyoruz
    
    // Eğer veri henüz gelmediyse boş dön
    if (!list) list = [];

    if (leaderboardType === 'VIP') {
      list = list.filter(p => p.isVip);
    } else {
      list = selectedCountry === 'GLOBAL' 
        ? list 
        : list.filter(p => p.country === selectedCountry);
    }
    
    // Sıralama (Puan yüksekten düşüğe)
    return list.sort((a, b) => b.score - a.score);
  };

  const isMobile = window.innerWidth < 768;

  return (
    <div className="relative w-full h-screen flex flex-col font-sans text-white select-none overflow-hidden" onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      {/* VIP Badge - Top Center */}
      {gameState.isVip && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[100] animate-pulse pointer-events-none">
          <span className="text-2xl font-black bg-gradient-to-b from-yellow-200 via-yellow-500 to-amber-700 bg-clip-text text-transparent drop-shadow-[0_0_15px_rgba(251,191,36,0.8)] tracking-widest">VIP</span>
        </div>
      )}

      {/* Dynamic Background */}
      {gameState.backgroundUrl && (
        <div className="absolute inset-0 bg-cover bg-center transition-all duration-1000 scale-105" style={{ backgroundImage: `url(${gameState.backgroundUrl})`, filter: 'brightness(0.35) blur(1px)' }} />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40" />
      
      <header className="relative z-10 flex justify-between items-center px-6 pt-6 pb-2 shrink-0">
        <div className="flex flex-col">
          <span className="text-[9px] font-black tracking-[0.2em] text-cyan-400 opacity-60 uppercase">SKOR</span>
          <span className="text-4xl font-black tabular-nums drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">{gameState.score}</span>
        </div>
        <div className="text-xl font-black italic tracking-tighter text-white/90">NEON BINGO</div>
        <div className="flex flex-col items-end">
          <span className="text-[9px] font-black tracking-[0.2em] text-pink-400 opacity-60 uppercase">REKOR</span>
          <span className="text-4xl font-black tabular-nums drop-shadow-[0_0_15px_rgba(244,114,182,0.5)]">{gameState.highScore}</span>
        </div>
      </header>

      <main className="relative flex-1 z-10 flex flex-col items-center w-full overflow-hidden">
        {activeTab === 'game' && (
          <div className="w-full max-w-lg h-full flex flex-col items-center justify-center gap-2 px-4 pb-2">
            
            {/* Feedback: Absolute positioned to avoid layout shift */}
            <div className="absolute top-[15%] left-0 right-0 z-50 flex justify-center pointer-events-none">
              {gameState.feedbackMessage && (
                <div className={`
                  ${isBingo ? 'text-5xl bingo-text' : 'text-3xl'} 
                  font-black text-center text-transparent bg-clip-text 
                  bg-gradient-to-r from-yellow-300 via-white to-cyan-300 
                  drop-shadow-[0_0_30px_rgba(255,255,255,0.5)] animate-in zoom-in-50 duration-300
                `}>
                  {gameState.feedbackMessage}
                </div>
              )}
            </div>

            {/* Grid Container */}
            <div className="relative w-full aspect-square max-h-[55vh] flex items-center justify-center shrink-0">
              <div 
                ref={gridRef} 
                className="relative bg-black/30 backdrop-blur-3xl p-3 rounded-[2rem] border-2 border-white/10 shadow-[inset_0_0_30px_rgba(0,0,0,0.5),0_0_50px_rgba(0,0,0,0.8)]" 
                style={{ display: 'grid', gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`, gap: '6px', width: '100%', height: '100%' }}
              >
                {gameState.grid.map((row, rIdx) => row.map((cell, cIdx) => {
                  const isPreview = previewPos && draggedPiece && rIdx >= previewPos.r && rIdx < previewPos.r + draggedPiece.shape.length && cIdx >= previewPos.c && cIdx < previewPos.c + draggedPiece.shape[0].length && draggedPiece.shape[rIdx - previewPos.r][cIdx - previewPos.c];
                  return (
                    <div 
                      key={`${rIdx}-${cIdx}`} 
                      className={`
                        relative aspect-square rounded-xl flex items-center justify-center transition-all duration-300 overflow-hidden
                        ${cell.occupied ? `bg-gradient-to-br ${gameState.themeConfig.gradients[cell.color]} shadow-lg border border-white/20 scale-95` : 'bg-white/5 shadow-inner'} 
                        ${cell.exploding ? 'block-explode' : ''} 
                        ${isPreview ? 'bg-white/40 ring-2 ring-white animate-pulse' : ''}
                      `}
                    >
                      {cell.occupied && <span className="text-2xl select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] flex-shrink-0">{gameState.themeConfig.icons[cell.color]}</span>}
                    </div>
                  );
                }))}
                {isStuck && !gameState.isGameOver && (
                  <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/95 backdrop-blur-xl rounded-[2.3rem] p-8 animate-in fade-in duration-500 text-center">
                    <div className="text-7xl mb-4 animate-bounce">💀</div>
                    <h2 className="text-5xl font-black text-red-500 mb-2 italic drop-shadow-lg">OYUN BİTTİ!</h2>
                    <p className="text-white/60 mb-8 font-mono text-lg">SKORUN: <span className="text-white font-bold">{gameState.score}</span></p>
                    
                    <button onClick={restartGame} className="w-full py-5 bg-gradient-to-r from-red-500 to-pink-600 rounded-2xl font-black text-2xl shadow-[0_0_30px_rgba(220,38,38,0.5)] hover:scale-105 active:scale-95 transition-all mb-4">
                      TEKRAR OYNA ↺
                    </button>
                    <button onClick={() => setActiveTab('leaderboard')} className="w-full py-4 bg-white/10 rounded-2xl font-bold text-sm hover:bg-white/20 transition-all">
                      SIRALAMANI GÖR 🏆
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Pieces Container */}
            <div className="w-full flex justify-around items-center p-4 bg-black/40 backdrop-blur-3xl rounded-[2.5rem] border border-white/10 shadow-2xl shrink-0">
              {gameState.availablePieces.map((piece) => (
                <div key={piece.id} onPointerDown={(e) => handlePointerDown(e, piece)} className="touch-none cursor-grab active:cursor-grabbing hover:scale-110 active:scale-90 transition-all duration-200">
                  <BlockPiece piece={piece} themeConfig={gameState.themeConfig} isMobile={isMobile} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ACCOUNT TAB */}
        {activeTab === 'account' && (
          <div className="w-full max-w-lg h-full overflow-y-auto no-scrollbar p-6 pb-20 space-y-6 animate-in slide-in-from-right duration-300">
             <div className="text-center mb-8">
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 italic">HESABIM</h2>
              <div className="flex items-center justify-center gap-2 mt-2">
                 <p className="text-white/40 text-xs font-black uppercase tracking-widest">Oyuncu Profili</p>
                 {/* @ts-ignore */}
                 {supabase.isMock && (
                     <span className="text-[9px] bg-white/10 text-white/40 border border-white/10 px-2 py-0.5 rounded uppercase font-bold">
                         Çevrimdışı Mod
                     </span>
                 )}
              </div>
            </div>

            {session ? (
              // LOGGED IN VIEW
              <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/10 flex flex-col items-center text-center">
                 <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 mb-4 flex items-center justify-center text-4xl shadow-[0_0_30px_rgba(6,182,212,0.4)]">
                    {session.user.user_metadata?.avatar || '👤'}
                 </div>
                 
                 {/* Profile Name Edit Section */}
                 {isEditingProfile ? (
                   <div className="w-full mb-4 space-y-2">
                     <p className="text-[10px] text-red-400 font-bold uppercase tracking-wide">Dikkat: Sadece 1 kez değiştirilebilir!</p>
                     <input 
                        type="text" 
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full bg-black/40 text-center text-xl font-bold border border-white/20 rounded-xl py-2 focus:border-cyan-400 focus:outline-none"
                        placeholder="İsmini Yaz..."
                        maxLength={15}
                     />
                     <div className="flex gap-2 justify-center">
                       <button onClick={handleUpdateProfile} disabled={authLoading} className="bg-green-600 px-4 py-1 rounded-lg text-xs font-bold hover:bg-green-500">KAYDET</button>
                       <button onClick={() => { setIsEditingProfile(false); setDisplayName(session.user.user_metadata.display_name || '') }} className="bg-red-600/50 px-4 py-1 rounded-lg text-xs font-bold hover:bg-red-500">İPTAL</button>
                     </div>
                   </div>
                 ) : (
                   <div className="flex items-center gap-2 mb-1 justify-center relative w-full">
                     <h3 className="text-2xl font-bold">{session.user.user_metadata?.display_name || 'İsimsiz Oyuncu'}</h3>
                     {/* Check if name has already been changed */}
                     {!session.user.user_metadata?.name_changed ? (
                        <button 
                            onClick={() => setIsEditingProfile(true)} 
                            className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-xs transition-colors"
                            title="İsmi Düzenle"
                        >
                            ✏️
                        </button>
                     ) : (
                        <span className="text-white/30 text-sm" title="İsim değiştirme hakkı doldu">🔒</span>
                     )}
                   </div>
                 )}

                 <p className="text-white/40 text-sm mb-6">{session.user.email}</p>

                 <div className="grid grid-cols-2 gap-4 w-full mb-8">
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                        <span className="block text-2xl font-black text-pink-400">{gameState.highScore}</span>
                        <span className="text-[10px] text-white/40 uppercase tracking-widest">EN YÜKSEK</span>
                    </div>
                    <div className="bg-black/40 rounded-2xl p-4 border border-white/5">
                        <span className="block text-2xl font-black text-yellow-400">{gameState.isVip ? 'VIP' : 'STD'}</span>
                        <span className="text-[10px] text-white/40 uppercase tracking-widest">ÜYELİK</span>
                    </div>
                 </div>

                 <button 
                  onClick={handleLogout}
                  className="w-full py-4 bg-white/10 hover:bg-red-500/20 hover:text-red-400 border border-white/10 hover:border-red-500/50 rounded-2xl font-bold transition-all text-sm"
                 >
                   HESAP DEĞİŞTİR
                 </button>
              </div>
            ) : (
              // LOGIN / REGISTER FORM
              <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
                 <div className="flex bg-black/40 rounded-xl p-1 mb-6">
                    <button 
                      onClick={() => setAuthMode('login')}
                      className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${authMode === 'login' ? 'bg-cyan-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                    >
                      GİRİŞ YAP
                    </button>
                    <button 
                      onClick={() => setAuthMode('register')}
                      className={`flex-1 py-3 rounded-lg text-xs font-bold transition-all ${authMode === 'register' ? 'bg-pink-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                    >
                      KAYIT OL
                    </button>
                 </div>

                 <form onSubmit={handleAuth} className="space-y-4">
                    <div>
                       <label className="block text-[10px] font-black uppercase text-white/40 mb-2 ml-2">E-Posta Adresi</label>
                       <input 
                         type="email" 
                         required
                         value={email}
                         onChange={(e) => setEmail(e.target.value)}
                         className="w-full bg-black/40 border border-white/10 focus:border-cyan-400 rounded-2xl px-4 py-4 outline-none transition-all placeholder:text-white/20"
                         placeholder="ornek@mail.com"
                       />
                    </div>
                    <div>
                       <label className="block text-[10px] font-black uppercase text-white/40 mb-2 ml-2">Şifre</label>
                       <input 
                         type="password" 
                         required
                         value={password}
                         onChange={(e) => setPassword(e.target.value)}
                         className="w-full bg-black/40 border border-white/10 focus:border-cyan-400 rounded-2xl px-4 py-4 outline-none transition-all placeholder:text-white/20"
                         placeholder="••••••••"
                       />
                    </div>

                    <button 
                      type="submit"
                      disabled={authLoading}
                      className={`
                        w-full py-5 mt-4 rounded-2xl font-black text-lg transition-all shadow-xl flex items-center justify-center gap-2
                        ${authMode === 'login' 
                           ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:scale-[1.02]' 
                           : 'bg-gradient-to-r from-pink-600 to-purple-600 hover:scale-[1.02]'}
                        ${authLoading ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      {authLoading ? 'İŞLEM YAPILIYOR...' : (authMode === 'login' ? 'GİRİŞ YAP ➔' : 'HEMEN KAYIT OL ➔')}
                    </button>
                 </form>
                 
                 <p className="text-center text-xs text-white/30 mt-6">
                    {authMode === 'register' 
                      ? 'Kayıt olarak kullanım koşullarını kabul etmiş olursunuz.' 
                      : 'Şifrenizi mi unuttunuz? Henüz bu özellik aktif değil.'}
                 </p>
              </div>
            )}
            
            {!session && (
                 <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-2xl flex items-center gap-4">
                    <span className="text-2xl">💡</span>
                    <p className="text-xs text-yellow-200/80">
                      Hesap oluşturarak skorlarınızı kaydedebilir ve profilinizi kişiselleştirebilirsiniz.
                    </p>
                 </div>
            )}
          </div>
        )}

        {activeTab === 'leaderboard' && (
          <div className="w-full max-w-lg h-full overflow-y-auto no-scrollbar p-6 pb-20 space-y-4 animate-in slide-in-from-left duration-300 relative">
            
            {/* Header and Toggle */}
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-amber-600 italic">LİDERLİK</h2>
                <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.2em]">Sıralama</p>
              </div>
              
              <div className="flex bg-white/10 rounded-xl p-1">
                <button 
                  onClick={() => setLeaderboardType('GLOBAL')} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${leaderboardType === 'GLOBAL' ? 'bg-cyan-500 text-black shadow-lg' : 'text-white/50'}`}
                >
                  KÜRESEL
                </button>
                <button 
                  onClick={() => setLeaderboardType('VIP')} 
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${leaderboardType === 'VIP' ? 'bg-yellow-500 text-black shadow-lg' : 'text-white/50'}`}
                >
                  VIP
                  <span className="text-[10px]">👑</span>
                </button>
              </div>
            </div>

            {/* Country Selector (Only in Global) */}
            {leaderboardType === 'GLOBAL' && (
               <div className="flex justify-end mb-4 relative z-50">
                  <button 
                      onClick={() => setIsCountryMenuOpen(!isCountryMenuOpen)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold border transition-all active:scale-95 ${isCountryMenuOpen ? 'bg-white/20 border-cyan-400/50' : 'bg-white/5 border-white/10 hover:bg-white/15'}`}
                  >
                      <span className="text-xl">{COUNTRIES.find(c => c.code === selectedCountry)?.flag}</span>
                      <span className="text-xs text-white/80">{selectedCountry === 'GLOBAL' ? 'DÜNYA' : selectedCountry}</span>
                      <span className="text-[10px] text-white/40">▼</span>
                  </button>
                  {isCountryMenuOpen && (
                      <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsCountryMenuOpen(false)} />
                          <div className="absolute right-0 top-full mt-2 w-48 bg-[#0f172a] border border-white/20 rounded-2xl shadow-xl z-50 overflow-hidden">
                               <div className="p-1 max-h-56 overflow-y-auto no-scrollbar">
                                  {COUNTRIES.map(country => (
                                    <button 
                                      key={country.code}
                                      onClick={() => { setSelectedCountry(country.code); setIsCountryMenuOpen(false); }}
                                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/10 text-left transition-colors"
                                    >
                                      <span>{country.flag}</span>
                                      <span className="text-xs font-bold">{country.name}</span>
                                    </button>
                                  ))}
                               </div>
                          </div>
                      </>
                  )}
               </div>
            )}

            {/* List Container with conditional Blur for VIP */}
            <div className="relative">
              {leaderboardType === 'VIP' && !gameState.isVip && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center backdrop-blur-md bg-black/40 rounded-3xl border border-yellow-500/20">
                   <span className="text-5xl mb-4 drop-shadow-[0_0_20px_rgba(234,179,8,0.5)]">🔒</span>
                   <h3 className="text-xl font-black text-yellow-400 mb-2">VIP ÖZEL LİGİ</h3>
                   <p className="text-xs text-center text-white/60 mb-6 max-w-[200px]">Bu sıralamayı ve özel ödülleri sadece VIP üyeler görebilir.</p>
                   
                   <button 
                    onClick={() => setShowVipRewardsInfo(true)}
                    className="flex items-center gap-2 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-400 px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95"
                   >
                     <span>ℹ️</span>
                     ÖDÜL BİLGİSİ
                   </button>
                </div>
              )}

              {/* Reward Info Modal */}
              {showVipRewardsInfo && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
                  <div className="bg-[#0f172a] border border-yellow-500/30 w-full max-w-sm rounded-[2rem] p-6 shadow-2xl relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-b from-yellow-500/10 to-transparent pointer-events-none" />
                    <button onClick={() => setShowVipRewardsInfo(false)} className="absolute top-4 right-4 text-white/40 hover:text-white text-xl font-black">✕</button>
                    
                    <h3 className="text-2xl font-black text-yellow-400 mb-1 text-center">VIP ÖDÜL HAVUZU</h3>
                    <p className="text-center text-white/40 text-[10px] uppercase tracking-widest mb-6">Aylık Sıralama Ödülleri</p>
                    
                    <div className="space-y-3">
                      {VIP_REWARDS.map((item, i) => (
                        <div key={i} className="flex items-center gap-4 bg-white/5 p-3 rounded-xl border border-white/5">
                          <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center font-black text-yellow-400 text-xs shadow-lg shadow-yellow-500/10">
                             {item.rank === 10 ? '10+' : item.rank}
                          </div>
                          <div>
                            <div className="font-bold text-yellow-200">{item.reward}</div>
                            <div className="text-[10px] text-white/50">{item.desc}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    <div className="mt-6 text-center">
                       <button onClick={() => setActiveTab('shop')} className="text-xs font-bold text-cyan-400 hover:text-cyan-300 underline">VIP OLMAK İÇİN MAĞAZAYA GİT</button>
                    </div>
                  </div>
                </div>
              )}

              <div className={`space-y-3 pb-24 ${leaderboardType === 'VIP' && !gameState.isVip ? 'opacity-20 pointer-events-none select-none' : ''}`}>
                 {/* Eğer liste boşsa mesaj göster */}
                 {getFilteredLeaderboard().length === 0 && (
                     <div className="text-center py-10 opacity-50">
                         <span className="text-3xl block mb-2">📉</span>
                         Henüz sıralamada kimse yok.
                     </div>
                 )}

                {getFilteredLeaderboard().map((entry, index) => {
                  const rewardItem = leaderboardType === 'VIP' && index < 10 ? VIP_REWARDS.find(r => r.rank >= index + 1) : null;
                  const isCurrentUser = session?.user?.user_metadata?.display_name === entry.name;

                  return (
                    <div 
                      key={entry.id} 
                      className={`
                        flex items-center gap-4 p-4 rounded-2xl border transition-all
                        ${isCurrentUser ? 'bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border-cyan-500/50 scale-[1.02] shadow-[0_0_20px_rgba(6,182,212,0.2)]' : 'bg-white/5 border-white/5'}
                        ${leaderboardType === 'VIP' ? 'border-yellow-500/10 bg-gradient-to-r from-yellow-900/10 to-transparent' : ''}
                      `}
                    >
                      <div className={`
                        w-10 h-10 rounded-full flex items-center justify-center font-black text-lg shrink-0
                        ${index === 0 ? 'bg-yellow-400 text-black shadow-[0_0_15px_rgba(250,204,21,0.5)]' : 
                          index === 1 ? 'bg-slate-300 text-black' : 
                          index === 2 ? 'bg-amber-700 text-white' : 'bg-white/10 text-white/50'}
                      `}>
                        {index + 1}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{entry.avatar}</span>
                          <span className={`font-bold ${isCurrentUser ? 'text-cyan-400' : 'text-white'}`}>{entry.name}</span>
                          {isCurrentUser && <span className="text-[9px] bg-cyan-500 text-black px-1.5 rounded font-black">SEN</span>}
                          {entry.isVip && <span className="text-[10px]">👑</span>}
                        </div>
                        <div className="flex items-center gap-1 opacity-50 text-xs">
                          <span>{COUNTRIES.find(c => c.code === entry.country)?.flag}</span>
                          <span>{COUNTRIES.find(c => c.code === entry.country)?.name}</span>
                        </div>
                      </div>
                      
                      {/* Reward Icon with Tooltip Trigger */}
                      {leaderboardType === 'VIP' && rewardItem && (
                        <div className="relative">
                            <button 
                              onClick={(e) => {
                                  e.stopPropagation();
                                  if (rewardTooltip?.id === entry.id) {
                                      setRewardTooltip(null);
                                  } else {
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      setRewardTooltip({
                                          id: entry.id,
                                          title: rewardItem.reward,
                                          desc: rewardItem.desc,
                                          x: rect.left + rect.width / 2,
                                          y: rect.top
                                      });
                                  }
                              }}
                              className="mr-3 w-8 h-8 flex items-center justify-center rounded-full bg-yellow-500/10 border border-yellow-500/30 hover:bg-yellow-500/20 transition-all active:scale-95"
                            >
                              <span className="text-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.6)]">🎁</span>
                            </button>
                        </div>
                      )}

                      <div className="text-right">
                        <span className="block font-black text-xl tracking-tight text-white/90">{entry.score.toLocaleString()}</span>
                        <span className="text-[9px] font-bold text-white/30 tracking-widest uppercase">PUAN</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          
            {/* Tooltip Overlay */}
            {rewardTooltip && (
               <div 
                 className="fixed z-[9999] pointer-events-none"
                 style={{ top: 0, left: 0, width: '100%', height: '100%' }}
               >
                  <div className="absolute inset-0" onPointerDown={() => setRewardTooltip(null)} style={{ pointerEvents: 'auto' }}></div>
                  
                  <div 
                     className="absolute bg-[#0f172a] border border-yellow-500/50 rounded-xl p-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex flex-col items-center text-center w-40 animate-in zoom-in-95 duration-200"
                     style={{ 
                         top: rewardTooltip.y - 12, 
                         left: rewardTooltip.x, 
                         transform: 'translate(-50%, -100%)' 
                     }}
                  >
                     <div className="text-2xl mb-1">🎉</div>
                     <div className="text-yellow-400 font-black text-xs uppercase tracking-wider mb-1">{rewardTooltip.title}</div>
                     <div className="text-white/60 text-[10px] leading-tight">{rewardTooltip.desc}</div>
                     
                     <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 w-3 h-3 bg-[#0f172a] border-r border-b border-yellow-500/50 rotate-45"></div>
                  </div>
               </div>
            )}
          </div>
        )}

        {activeTab === 'shop' && (
          <div className="w-full max-w-lg h-full overflow-y-auto no-scrollbar p-4 pb-20 space-y-6 animate-in slide-in-from-bottom duration-500">
            <div className="mb-4 text-center">
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 to-orange-500 italic">VIP MAĞAZA</h2>
              <p className="text-white/40 text-[10px] font-black uppercase tracking-[0.3em] mt-2">Premium Ayrıcalıklar</p>
            </div>

            {/* VIP Status Card */}
            <div className={`p-6 rounded-[2.5rem] border-2 transition-all ${gameState.isVip ? 'bg-gradient-to-br from-yellow-500/20 to-amber-900/40 border-yellow-500/50 shadow-[0_0_30px_rgba(251,191,36,0.2)]' : 'bg-white/5 border-white/10'}`}>
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-2xl font-black">{gameState.isVip ? 'ÜYELİK: VIP 👑' : 'ÜYELİK: STANDART'}</h3>
                  <p className="text-xs text-white/50">{gameState.isVip ? 'Tüm premium özellikler açık!' : 'VIP ile AI özelliklerini açın.'}</p>
                </div>
                {!gameState.isVip && <span className="text-4xl grayscale">👑</span>}
                {gameState.isVip && <span className="text-4xl drop-shadow-lg">✨</span>}
              </div>
            </div>

            {/* AI Theme Generator (Locked for non-VIP) */}
            <div className="relative overflow-hidden bg-white/5 backdrop-blur-3xl rounded-[3rem] p-8 border border-white/10 shadow-2xl">
               {!gameState.isVip && (
                 <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-10 flex flex-col items-center justify-center text-center p-6">
                    <span className="text-5xl mb-4">🔒</span>
                    <h4 className="text-xl font-black text-yellow-400">VIP ÖZELLİĞİ</h4>
                    <p className="text-sm text-white/60">AI ile sınırsız tema oluşturmak için VIP olun!</p>
                 </div>
               )}
               <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/30">✨</div>
                  <div>
                    <h3 className="font-black text-xl uppercase tracking-wider">AI Tema Motoru</h3>
                    <p className="text-white/40 text-[10px] font-bold">GEMINI 2.5 FLASH POWERED</p>
                  </div>
               </div>
               
               <div className="space-y-4">
                  <input 
                    type="text" 
                    value={aiPrompt} 
                    onChange={(e) => setAiPrompt(e.target.value)} 
                    placeholder="Örn: Japonya, Antarktika, Cyberpunk..." 
                    className="w-full bg-black/40 rounded-3xl px-6 py-5 text-base border-2 border-white/5 focus:border-cyan-500/50 focus:outline-none transition-all placeholder:text-white/10"
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdateTheme()}
                  />
                  <button 
                    onClick={handleUpdateTheme} 
                    disabled={isAiLoading} 
                    className={`
                      w-full py-5 rounded-3xl font-black text-lg transition-all shadow-xl
                      ${isAiLoading ? 'bg-slate-800 text-white/20 animate-pulse' : 'bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:brightness-110 active:scale-95'}
                    `}
                  >
                    {isAiLoading ? 'TEMA İŞLENİYOR...' : 'YENİ TEMA OLUŞTUR'}
                  </button>
               </div>
            </div>

            {/* Saved Themes Section */}
            {gameState.isVip && savedThemes.length > 0 && (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-2">
                        <span className="text-xl">💾</span>
                        <h4 className="text-xs font-black uppercase tracking-widest text-white/60">Kayıtlı Temalarım</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                        {savedThemes.map((theme, idx) => (
                            <div 
                                key={idx} 
                                onClick={() => handleSelectTheme(theme)}
                                className="group relative bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyan-400/50 rounded-2xl p-3 cursor-pointer transition-all active:scale-95 overflow-hidden"
                            >
                                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button 
                                        onClick={(e) => handleDeleteTheme(e, idx)}
                                        className="w-6 h-6 rounded-full bg-red-500/20 hover:bg-red-500 text-red-200 hover:text-white flex items-center justify-center text-xs font-bold"
                                    >
                                        ✕
                                    </button>
                                </div>
                                
                                {/* Mini Preview Gradient */}
                                <div className={`h-16 rounded-xl mb-3 bg-gradient-to-br ${theme.gradients.pink} shadow-inner flex items-center justify-center`}>
                                    <span className="text-2xl drop-shadow-md">{theme.icons.pink}</span>
                                </div>
                                
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold truncate max-w-[80px]">{theme.name}</span>
                                    {theme.name === gameState.themeConfig.name && <span className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]"></span>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* VIP Code Section */}
            <div className="bg-slate-900/40 rounded-[2.5rem] p-8 border border-white/5">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-4 text-center">Yapımcı VIP Kod Bölümü</h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={vipCode}
                  onChange={(e) => setVipCode(e.target.value)}
                  placeholder="KODU BURAYA YAZ..." 
                  className="flex-1 bg-black/40 rounded-2xl px-4 py-3 text-sm border border-white/10 focus:outline-none focus:border-yellow-500/50 transition-all font-mono"
                />
                <button 
                  onClick={applyVipCode}
                  className="px-6 py-3 bg-white/10 rounded-2xl font-black text-xs hover:bg-yellow-500 hover:text-black transition-all"
                >
                  AKTİF ET
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'support' && (
          <div className="w-full max-w-lg h-full overflow-y-auto no-scrollbar p-6 pb-20 space-y-6 animate-in slide-in-from-bottom duration-500">
            <div className="text-center mb-8">
              <h2 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600 italic">DESTEK & YARDIM</h2>
              <p className="text-white/40 text-xs font-black uppercase tracking-widest mt-2">Nasıl Oynanır?</p>
            </div>

            <div className="bg-white/5 backdrop-blur-3xl rounded-[2.5rem] p-6 border border-white/10 space-y-6">
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-cyan-500/20 flex items-center justify-center shrink-0 text-cyan-400 font-black">1</div>
                <div>
                  <h4 className="font-bold text-lg">Blokları Yerleştir</h4>
                  <p className="text-sm text-white/60">Aşağıdaki 3 bloktan birini seçip 7x7 alana sürükle.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center shrink-0 text-pink-400 font-black">2</div>
                <div>
                  <h4 className="font-bold text-lg">Satır/Sütun Tamamla</h4>
                  <p className="text-sm text-white/60">Bir satırı veya sütunu tamamen doldurduğunda patlar ve puan kazandırır.</p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center shrink-0 text-yellow-400 font-black">3</div>
                <div>
                  <h4 className="font-bold text-lg">BİNGO Yap!</h4>
                  <p className="text-sm text-white/60">Aynı anda birden fazla satırı patlatarak devasa BİNGO puanları topla!</p>
                </div>
              </div>
            </div>

            <div className="bg-indigo-600/20 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-indigo-500/30 text-center">
              <span className="text-4xl mb-4 block">🤖</span>
              <h3 className="text-xl font-bold mb-2">AI Tema İpucu</h3>
              <p className="text-sm text-white/70 italic">"Mağaza bölümünde istediğin her konuyu yazabilirsin. Gemini AI senin için arka planı, ikonları ve renkleri anında tasarlayacaktır!"</p>
            </div>
            
            <div className="text-center py-4">
              <p className="text-[10px] text-white/20 font-black tracking-widest uppercase">Version 2.0.4 • AI-Powered Engine</p>
            </div>
          </div>
        )}
      </main>

      {/* Navigation - Five Tabs */}
      <nav className="relative z-20 flex justify-around items-center px-1 py-4 bg-black/90 backdrop-blur-3xl border-t border-white/10 shrink-0 pb-8">
        <button 
          onClick={() => setActiveTab('leaderboard')} 
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-14 ${activeTab === 'leaderboard' ? 'text-amber-400 scale-110' : 'text-white/20 hover:text-white/40'}`}
        >
          <span className="text-xl drop-shadow-[0_0_10px_currentColor]">{activeTab === 'leaderboard' ? '🏆' : '🏅'}</span>
          <span className="text-[7px] font-black uppercase tracking-widest">LİDER</span>
        </button>
        <button 
          onClick={() => setActiveTab('game')} 
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-14 ${activeTab === 'game' ? 'text-cyan-400 scale-110' : 'text-white/20 hover:text-white/40'}`}
        >
          <span className="text-xl drop-shadow-[0_0_10px_currentColor]">{activeTab === 'game' ? '🎮' : '🕹️'}</span>
          <span className="text-[7px] font-black uppercase tracking-widest">OYUN</span>
        </button>
        <button 
          onClick={() => setActiveTab('shop')} 
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-14 ${activeTab === 'shop' ? 'text-yellow-400 scale-110' : 'text-white/20 hover:text-white/40'}`}
        >
          <span className="text-xl drop-shadow-[0_0_10px_currentColor]">{activeTab === 'shop' ? '🎨' : '🖌️'}</span>
          <span className="text-[7px] font-black uppercase tracking-widest">MAĞAZA</span>
        </button>
        <button 
          onClick={() => setActiveTab('account')} 
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-14 ${activeTab === 'account' ? 'text-green-400 scale-110' : 'text-white/20 hover:text-white/40'}`}
        >
          <span className="text-xl drop-shadow-[0_0_10px_currentColor]">{activeTab === 'account' ? '👤' : '🔒'}</span>
          <span className="text-[7px] font-black uppercase tracking-widest">HESAP</span>
        </button>
        <button 
          onClick={() => setActiveTab('support')} 
          className={`flex flex-col items-center gap-1.5 transition-all duration-300 w-14 ${activeTab === 'support' ? 'text-purple-400 scale-110' : 'text-white/20 hover:text-white/40'}`}
        >
          <span className="text-xl drop-shadow-[0_0_10px_currentColor]">{activeTab === 'support' ? '🆘' : '❓'}</span>
          <span className="text-[7px] font-black uppercase tracking-widest">DESTEK</span>
        </button>
      </nav>

      {/* Dragging Overlay */}
      {draggedPiece && (
        <div 
          className="fixed pointer-events-none z-[9999]" 
          style={{ 
            left: dragPos.x, 
            top: dragPos.y, 
            transform: 'translate(-50%, -50%) scale(1.3)', 
            filter: 'drop-shadow(0 0 30px rgba(255,255,255,0.7))' 
          }}
        >
          <BlockPiece piece={draggedPiece} themeConfig={gameState.themeConfig} isMobile={isMobile} />
        </div>
      )}
    </div>
  );
};

export default App;
