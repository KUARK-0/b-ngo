
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
                      {cell.occupied && <span className="text-2xl select-none drop-shadow-[0_2px_4px_rgba