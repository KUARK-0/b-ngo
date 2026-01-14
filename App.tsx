
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GridCell, Piece, GameState, BlockColor, ThemeConfig, LeaderboardEntry } from './types';
import { GRID_SIZE, SHAPES, COLOR_MAP, FEEDBACK_PHRASES, INITIAL_BACKGROUND } from './constants';
import BlockPiece from './components/BlockPiece';
import { generateGameBackground, generateThemeConfig } from './services/geminiService';
import { supabase } from './services/supabaseClient';

// --- STATİK VERİLER ---
const DEFAULT_THEME: ThemeConfig = {
  name: 'Neon',
  icons: { pink: '💎', cyan: '💠', lime: '🍀', orange: '🔥', purple: '🔮', yellow: '⭐', none: '' },
  gradients: COLOR_MAP
};
const SIMPLE_THEME: ThemeConfig = {
  name: 'Sade',
  icons: { pink: '', cyan: '', lime: '', orange: '', purple: '', yellow: '', none: '' },
  gradients: COLOR_MAP
};

const TOUCH_OFFSET_Y = 85; // Parmağın bloğu kapatmasını önlemek için yukarı kaydırma miktarı

const App: React.FC = () => {
  // --- STATE ---
  const [gameState, setGameState] = useState<GameState>(() => ({
    grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill({ occupied: false, color: 'none' })),
    score: 0,
    highScore: parseInt(localStorage.getItem('highScore') || '0'),
    availablePieces: [],
    feedbackMessage: null,
    isGameOver: false,
    backgroundUrl: localStorage.getItem('bgUrl') || '',
    themeConfig: localStorage.getItem('isVip') === 'true' ? DEFAULT_THEME : SIMPLE_THEME,
    isVip: localStorage.getItem('isVip') === 'true',
    powerUps: { bomb: 3, refresh: 3 }
  }));

  const [activeTab, setActiveTab] = useState('game');
  const [draggedPiece, setDraggedPiece] = useState<Piece | null>(null);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const [previewPos, setPreviewPos] = useState<{ r: number, c: number } | null>(null);
  
  // Mobil Simülasyon Modu (Toggle)
  const [simulationMode, setSimulationMode] = useState(false);
  
  // UI State
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardEntry[]>([]);
  const [session, setSession] = useState<any>(null);
  
  // Auth State
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [authForm, setAuthForm] = useState({ email: '', password: '', username: '' });

  // Refs
  const gridRef = useRef<HTMLDivElement>(null);
  const gridRectRef = useRef<DOMRect | null>(null); 
  const feedbackTimeout = useRef<any>(null);

  // --- OYUN MANTIĞI ---

  const generateNewPieces = useCallback(() => {
    const colors: BlockColor[] = ['pink', 'cyan', 'lime', 'orange', 'purple', 'yellow'];
    return Array(3).fill(null).map(() => ({
      id: Math.random().toString(36).substr(2, 5),
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      color: colors[Math.floor(Math.random() * colors.length)]
    }));
  }, []);

  const initializeGame = useCallback(() => {
    setGameState(prev => ({
      ...prev,
      grid: Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill({ occupied: false, color: 'none' })),
      score: 0,
      availablePieces: generateNewPieces(),
      isGameOver: false,
      feedbackMessage: null
    }));
  }, [generateNewPieces]);

  useEffect(() => {
    initializeGame();
    supabase.auth.getSession().then(({ data: { session } }) => { if(session) setSession(session); });
  }, [initializeGame]);

  // --- SÜRÜKLE BIRAK ---

  const handlePointerDown = (e: React.PointerEvent, piece: Piece) => {
    if (gameState.isGameOver || activeTab !== 'game') return;
    
    // Grid konumunu güncelle (Resize vb. durumlara karşı taze bilgi)
    if (gridRef.current) {
        gridRectRef.current = gridRef.current.getBoundingClientRect();
    }

    // Pointer capture önemli: parmak hızlı hareket etse bile olayı kaçırmamalı
    (e.target as Element).setPointerCapture(e.pointerId);

    setDraggedPiece(piece);
    setDragPos({ x: e.clientX, y: e.clientY });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggedPiece) return;
    
    // Sürükleme pozisyonunu güncelle
    setDragPos({ x: e.clientX, y: e.clientY });

    // Eğer grid bilgisi yoksa (örn. oyun başlamadıysa) çık
    if (!gridRectRef.current) return;

    const rect = gridRectRef.current;
    const cellSize = rect.width / GRID_SIZE;
    
    // Fare/Parmak pozisyonu
    const mouseX = e.clientX - rect.left;
    // Y ekseninde offset uyguluyoruz ki parmak bloğu kapatmasın (daha iyi görüş)
    const mouseY = (e.clientY - TOUCH_OFFSET_Y) - rect.top;

    // Grid sınırları içinde mi? (Biraz toleranslı)
    if (mouseX > -cellSize && mouseX < rect.width + cellSize && mouseY > -cellSize && mouseY < rect.height + cellSize) {
        const pieceW = draggedPiece.shape[0].length * cellSize;
        const pieceH = draggedPiece.shape.length * cellSize;

        // Bloğun merkezini hesapla ve hücreye snap et
        const c = Math.floor((mouseX - pieceW / 2 + cellSize / 2) / cellSize);
        const r = Math.floor((mouseY - pieceH / 2 + cellSize / 2) / cellSize);
        
        if (isValidMove(gameState.grid, draggedPiece, r, c)) {
            setPreviewPos({ r, c });
            return;
        }
    }
    setPreviewPos(null);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as Element).releasePointerCapture(e.pointerId);
    if (draggedPiece && previewPos) {
      placePiece(previewPos.r, previewPos.c, draggedPiece);
    }
    setDraggedPiece(null);
    setPreviewPos(null);
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

  const placePiece = (r: number, c: number, piece: Piece) => {
    const newGrid = gameState.grid.map(row => [...row]);
    
    for (let pr = 0; pr < piece.shape.length; pr++) {
      for (let pc = 0; pc < piece.shape[0].length; pc++) {
        if (piece.shape[pr][pc]) newGrid[r + pr][c + pc] = { occupied: true, color: piece.color };
      }
    }

    const rowsDel = new Set<number>();
    const colsDel = new Set<number>();
    
    for (let i = 0; i < GRID_SIZE; i++) {
      if (newGrid[i].every(cell => cell.occupied)) rowsDel.add(i);
      if (newGrid.every(row => row[i].occupied)) colsDel.add(i);
    }

    let points = piece.shape.flat().filter(x=>x).length * 10;
    
    if (rowsDel.size > 0 || colsDel.size > 0) {
       rowsDel.forEach(ridx => { for(let j=0; j<GRID_SIZE; j++) newGrid[ridx][j] = { ...newGrid[ridx][j], exploding: true }; });
       colsDel.forEach(cidx => { for(let i=0; i<GRID_SIZE; i++) newGrid[i][cidx] = { ...newGrid[i][cidx], exploding: true }; });
       
       const count = rowsDel.size + colsDel.size;
       points += count * 120;
       showFeedback(count > 1 ? "BİNGO!" : FEEDBACK_PHRASES[Math.floor(Math.random()*FEEDBACK_PHRASES.length)]);
    }

    const newPieces = gameState.availablePieces.filter(p => p.id !== piece.id);
    const finalPieces = newPieces.length === 0 ? generateNewPieces() : newPieces;
    const finalScore = gameState.score + points;
    
    let isGameOver = false;
    const checkStuck = () => {
        for (const p of finalPieces) {
            for (let rr = 0; rr < GRID_SIZE; rr++) {
                for (let cc = 0; cc < GRID_SIZE; cc++) {
                    if (isValidMove(newGrid, p, rr, cc)) return false;
                }
            }
        }
        return true;
    };
    if (rowsDel.size === 0 && colsDel.size === 0) {
        isGameOver = checkStuck();
    }

    setGameState(prev => ({
        ...prev,
        grid: newGrid,
        score: finalScore,
        highScore: Math.max(finalScore, prev.highScore),
        availablePieces: finalPieces,
        isGameOver
    }));

    if (finalScore > gameState.highScore) localStorage.setItem('highScore', finalScore.toString());

    if (rowsDel.size > 0 || colsDel.size > 0) {
        setTimeout(() => {
            setGameState(prev => {
                const cleanGrid = prev.grid.map(row => row.map(cell => cell.exploding ? { occupied: false, color: 'none' as BlockColor } : cell));
                return { ...prev, grid: cleanGrid };
            });
        }, 300);
    }
  };

  const showFeedback = (msg: string) => {
      clearTimeout(feedbackTimeout.current);
      setGameState(prev => ({ ...prev, feedbackMessage: msg }));
      feedbackTimeout.current = setTimeout(() => setGameState(prev => ({ ...prev, feedbackMessage: null })), 1500);
  };

  const handleAiTheme = async () => {
      if(!gameState.isVip || !aiPrompt) return;
      setIsAiLoading(true);
      try {
          const { config, imagePrompt } = await generateThemeConfig(aiPrompt);
          const bg = await generateGameBackground(imagePrompt);
          setGameState(prev => ({ ...prev, themeConfig: config, backgroundUrl: bg }));
          localStorage.setItem('bgUrl', bg);
      } catch { showFeedback("Hata!"); }
      setIsAiLoading(false);
  };

  const handleAuth = async () => {
      const { email, password, username } = authForm;
      if (!email || !password) return showFeedback("Bilgileri doldur!");

      if (isLoginMode) {
          const { error } = await supabase.auth.signInWithPassword({ email, password });
          if (error) showFeedback(error.message);
          else window.location.reload();
      } else {
          if (!username) return showFeedback("Kullanıcı adı gerekli!");
          const { error } = await supabase.auth.signUp({ 
              email, 
              password,
              options: { data: { display_name: username } }
          });
          if (error) showFeedback(error.message);
          else {
              showFeedback("Kayıt Başarılı!");
              setTimeout(() => window.location.reload(), 1000);
          }
      }
  };

  // --- LAYOUT HELPERS ---
  const desktopSidebarClass = simulationMode ? 'hidden' : 'hidden md:flex';
  const mobileHeaderClass = simulationMode ? 'flex' : 'md:hidden';
  const mobileNavClass = simulationMode ? 'flex' : 'md:hidden';
  const contentWrapperClass = simulationMode ? '' : 'md:left-24';
  const gameLayoutClass = simulationMode ? 'flex-col' : 'flex-col md:flex-row';
  const gridContainerClass = simulationMode ? 'w-[95vw] max-w-full' : 'w-[95vw] md:w-auto';
  const rightPanelClass = simulationMode ? 'w-full h-32' : 'w-full md:w-80 h-32 md:h-[80vh]';

  // --- RENDER ---
  return (
    <div className={`fixed inset-0 bg-[#020617] text-white font-sans overflow-hidden select-none flex justify-center transition-colors ${simulationMode ? 'items-center bg-black/90' : ''}`}
         onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
      
      {/* Simulation Wrapper */}
      <div className={`w-full h-full relative transition-all duration-300 ease-out 
          ${simulationMode ? 'max-w-[420px] max-h-[850px] border-[8px] border-gray-800 rounded-[2.5rem] overflow-hidden shadow-2xl bg-[#020617] ring-4 ring-gray-700' : ''}`}>

        {/* --- TOGGLE BUTTON (Mobil Uyarlama Tuşu) --- */}
        <button 
             onClick={() => setSimulationMode(!simulationMode)} 
             className={`absolute top-4 right-4 z-[99] p-2 rounded-full transition-all duration-300 shadow-lg backdrop-blur-sm
                ${simulationMode ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-black/20 text-white/30 hover:text-white hover:bg-black/40'}`}
             title={simulationMode ? "Masaüstü Moduna Dön" : "Mobil Görünümü Aç"}
        >
             {simulationMode ? '💻' : '📱'}
        </button>

        {/* Background */}
        <div className="absolute inset-0 z-0 pointer-events-none opacity-40 transition-opacity duration-1000 ease-in-out" 
             style={{ backgroundImage: `url(${gameState.backgroundUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
        <div className="absolute inset-0 z-0 bg-black/40 pointer-events-none" />

        {/* --- DESKTOP SOL BAR --- */}
        <div className={`${desktopSidebarClass} fixed left-0 top-0 h-full w-24 glass-panel border-r border-white/10 z-30 flex-col items-center py-8 gap-8`}>
           <div className="text-3xl animate-pulse cursor-default">🌌</div>
           <nav className="flex flex-col gap-6 w-full px-2">
               {['game', 'leaderboard', 'shop', 'account'].map(tab => (
                   <button key={tab} onClick={() => setActiveTab(tab)} 
                      className={`w-full aspect-square rounded-xl flex items-center justify-center transition-all group ${activeTab === tab ? 'bg-cyan-500/20 text-cyan-400' : 'text-white/40 hover:bg-white/5 hover:text-white'}`}>
                      <span className="text-2xl group-hover:scale-110 transition-transform">
                          {tab === 'game' ? '🎮' : tab === 'leaderboard' ? '🏆' : tab === 'shop' ? '🛒' : '👤'}
                      </span>
                   </button>
               ))}
           </nav>
        </div>

        {/* --- ANA İÇERİK --- */}
        <div className={`absolute inset-0 ${contentWrapperClass} flex flex-col transition-all duration-300`}>
          
          {/* MOBİL ÜST HEADER (Skor) */}
          <div className={`${mobileHeaderClass} h-16 w-full flex-shrink-0 flex items-center justify-between px-4 glass-panel border-b border-white/10 z-20`}>
               <div className="flex flex-col">
                   <span className="text-[10px] text-cyan-400 font-bold tracking-widest">SKOR</span>
                   <span className="text-2xl font-black leading-none font-['Orbitron']">{gameState.score}</span>
               </div>
               <div className="text-2xl animate-pulse">🌌</div>
               <div className="flex flex-col items-end">
                   <span className="text-[10px] text-pink-400 font-bold tracking-widest">REKOR</span>
                   <span className="text-xl font-bold leading-none text-white/80">{gameState.highScore}</span>
               </div>
          </div>

          {/* ORTA ALAN */}
          <div className="flex-1 relative w-full h-full flex items-center justify-center overflow-hidden">
              
              {/* OYUN GÖRÜNÜMÜ */}
              <div className={`w-full h-full ${gameLayoutClass} items-center justify-center gap-4 md:gap-8 p-2 md:p-8 
                  ${activeTab === 'game' ? 'flex' : desktopSidebarClass} transition-opacity duration-300`}>
                  
                  {/* OYUN IZGARASI */}
                  <div className={`relative z-10 ${gridContainerClass} md:h-[80vh] aspect-square flex-shrink-0 max-h-[55vh] md:max-h-none`}> 
                      <div ref={gridRef} 
                           className="w-full h-full glass-panel rounded-2xl p-2 grid gap-1 relative shadow-2xl bg-black/40 backdrop-blur-sm"
                           style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}>
                          {gameState.grid.map((row, r) => row.map((cell, c) => {
                              const isPrev = previewPos && draggedPiece && 
                                             r >= previewPos.r && r < previewPos.r + draggedPiece.shape.length && 
                                             c >= previewPos.c && c < previewPos.c + draggedPiece.shape[0].length &&
                                             draggedPiece.shape[r-previewPos.r][c-previewPos.c];
                              return (
                                  <div key={`${r}-${c}`} className={`
                                      w-full h-full rounded-md md:rounded-lg flex items-center justify-center transition-all duration-150
                                      ${cell.occupied ? `bg-gradient-to-br ${gameState.themeConfig.gradients[cell.color]} shadow-md scale-95 border border-white/20` : 'bg-white/5 border border-white/5'}
                                      ${cell.exploding ? 'block-explode' : ''}
                                      ${isPrev ? 'bg-white/20 scale-90 opacity-70 border-2 border-white/50' : ''}
                                  `}>
                                      {cell.occupied && <span className="text-xl md:text-4xl filter drop-shadow-lg">{gameState.themeConfig.icons[cell.color]}</span>}
                                  </div>
                              );
                          }))}
                          
                          {gameState.isGameOver && (
                              <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center rounded-2xl z-50 animate-in zoom-in">
                                  <h2 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-600 mb-4 font-['Orbitron']">BİTTİ</h2>
                                  <p className="text-white/60 mb-6 font-mono">SKOR: <span className="text-white font-bold">{gameState.score}</span></p>
                                  <button onClick={initializeGame} className="px-8 py-3 bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:scale-105 transition-transform">TEKRAR OYNA</button>
                              </div>
                          )}
                      </div>
                  </div>

                  {/* SAĞ PANEL / ALT PANEL */}
                  <div className={`${rightPanelClass} flex flex-col gap-4 flex-shrink-0 z-10`}>
                      
                      {/* Desktop Skor Paneli */}
                      <div className={`${desktopSidebarClass} flex-col glass-panel p-6 rounded-3xl border border-white/10 bg-black/20`}>
                          <div className="flex justify-between items-end border-b border-white/10 pb-4 mb-4">
                              <span className="text-cyan-400 font-bold tracking-widest text-sm">SKOR</span>
                              <span className="text-4xl font-black font-['Orbitron']">{gameState.score}</span>
                          </div>
                          <div className="flex justify-between items-end">
                              <span className="text-pink-400 font-bold tracking-widest text-sm">REKOR</span>
                              <span className="text-2xl text-white/70 font-['Orbitron']">{gameState.highScore}</span>
                          </div>
                      </div>

                      {/* Parça Havuzu */}
                      <div className="flex-1 glass-panel rounded-2xl md:rounded-3xl flex md:flex-col items-center justify-center gap-4 p-2 md:p-4 bg-black/20 border border-white/10 overflow-hidden relative">
                           {gameState.availablePieces.length === 0 && (
                              <div className="absolute inset-0 flex items-center justify-center text-white/20 animate-pulse text-xs">YENİLENİYOR...</div>
                           )}
                           {gameState.availablePieces.map(p => (
                              <div key={p.id} className="relative z-10 transition-transform hover:scale-105 active:scale-95">
                                  {/* Event'i yukarıya doğru şekilde taşıyoruz */}
                                  <BlockPiece piece={p} themeConfig={gameState.themeConfig} onSelect={(pp, e) => handlePointerDown(e, pp)} />
                              </div>
                          ))}
                      </div>
                  </div>
              </div>

              {/* DİĞER SEKME İÇERİKLERİ */}
              {activeTab !== 'game' && (
                  <div className={`absolute inset-0 z-20 bg-[#020617]/90 md:bg-transparent backdrop-blur-xl md:backdrop-blur-none p-4 ${simulationMode ? 'static w-full h-full' : 'md:static md:w-full md:h-full'} flex items-center justify-center`}>
                     <div className="glass-panel w-full max-w-2xl h-full md:h-[80vh] rounded-2xl md:rounded-[2.5rem] p-6 md:p-10 overflow-y-auto no-scrollbar border border-white/10">
                          <h2 className="text-3xl md:text-5xl font-black mb-8 uppercase text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 font-['Orbitron']">
                              {activeTab === 'shop' ? 'MAĞAZA' : activeTab === 'leaderboard' ? 'LİDERLER' : 'PROFİL'}
                          </h2>

                          {activeTab === 'shop' && (
                              <div className="space-y-6">
                                  <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                      <h3 className="font-bold text-xl mb-4 flex items-center gap-2">✨ AI Tema Oluşturucu <span className="text-xs bg-yellow-500 text-black px-2 py-0.5 rounded font-black">VIP</span></h3>
                                      <input value={aiPrompt} onChange={e=>setAiPrompt(e.target.value)} placeholder="Örn: Cyberpunk orman, neon şehir..." className="w-full p-4 bg-black/50 rounded-xl border border-white/10 mb-4 focus:border-cyan-500 outline-none" />
                                      <button onClick={handleAiTheme} disabled={!gameState.isVip || isAiLoading} className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl font-bold disabled:opacity-50 shadow-lg hover:shadow-purple-500/20 transition-all">
                                          {isAiLoading ? 'Sihir Yapılıyor...' : 'OLUŞTUR'}
                                      </button>
                                  </div>
                              </div>
                          )}

                          {activeTab === 'leaderboard' && (
                              <div className="space-y-2">
                                  <button onClick={() => supabase.from('profiles').select('*').then(({data}: any) => setLeaderboardData(data))} className="text-cyan-400 text-sm font-bold mb-4 hover:underline">Yenile ↻</button>
                                  {leaderboardData.map((l, i) => (
                                      <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                                          <div className="flex items-center gap-4">
                                              <span className="font-black text-white/20 w-6 text-center">{i+1}</span>
                                              <div className="flex flex-col">
                                                  <span className="font-bold">{l.name}</span>
                                                  <span className="text-xs text-white/40">{l.country}</span>
                                              </div>
                                          </div>
                                          <span className="font-mono font-bold text-cyan-400">{l.score.toLocaleString()}</span>
                                      </div>
                                  ))}
                              </div>
                          )}

                          {activeTab === 'account' && (
                              <div className="space-y-4 max-w-sm mx-auto mt-10">
                                  {!session ? (
                                  <div className="flex flex-col gap-4">
                                      <h3 className="text-xl font-bold text-center mb-2">{isLoginMode ? 'Giriş Yap' : 'Kayıt Ol'}</h3>
                                      
                                      {!isLoginMode && (
                                        <input value={authForm.username} onChange={e=>setAuthForm({...authForm, username:e.target.value})} placeholder="Kullanıcı Adı" className="p-4 rounded-xl bg-black/40 border border-white/10 focus:border-cyan-500 outline-none transition-colors" />
                                      )}
                                      
                                      <input value={authForm.email} onChange={e=>setAuthForm({...authForm, email:e.target.value})} placeholder="E-Posta" className="p-4 rounded-xl bg-black/40 border border-white/10 focus:border-cyan-500 outline-none transition-colors" />
                                      <input type="password" value={authForm.password} onChange={e=>setAuthForm({...authForm, password:e.target.value})} placeholder="Şifre" className="p-4 rounded-xl bg-black/40 border border-white/10 focus:border-cyan-500 outline-none transition-colors" />
                                      
                                      <button onClick={handleAuth} className="p-4 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-xl font-bold hover:scale-105 transition-transform shadow-lg shadow-cyan-500/20">
                                          {isLoginMode ? 'GİRİŞ YAP' : 'KAYIT OL'}
                                      </button>

                                      <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-sm text-white/50 hover:text-white transition-colors mt-2">
                                          {isLoginMode ? "Hesabın yok mu? Hemen Kayıt Ol" : "Zaten hesabın var mı? Giriş Yap"}
                                      </button>
                                  </div>
                                  ) : (
                                  <div className="text-center animate-in fade-in">
                                      <div className="text-6xl mb-4">{session.user.user_metadata?.avatar || '😎'}</div>
                                      <div className="text-xl mb-2">Hoşgeldin,</div>
                                      <div className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-400 mb-8 font-['Orbitron']">
                                          {session.user.user_metadata?.display_name}
                                      </div>
                                      
                                      <div className="grid grid-cols-2 gap-4 mb-8">
                                          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                              <div className="text-xs text-white/40 mb-1">EN YÜKSEK SKOR</div>
                                              <div className="text-xl font-bold">{gameState.highScore}</div>
                                          </div>
                                          <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
                                              <div className="text-xs text-white/40 mb-1">ÜYELİK</div>
                                              <div className="text-xl font-bold text-yellow-500">{gameState.isVip ? 'VIP' : 'Standart'}</div>
                                          </div>
                                      </div>

                                      <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="w-full px-8 py-4 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl font-bold hover:bg-red-500/20 transition-colors">
                                          ÇIKIŞ YAP
                                      </button>
                                  </div>
                                  )}
                              </div>
                          )}
                     </div>
                  </div>
              )}
          </div>

          {/* MOBİL ALT NAVİGASYON */}
          <div className={`${mobileNavClass} h-20 w-full glass-panel border-t border-white/10 flex items-center justify-around px-2 z-30 pb-4`}>
              {['game', 'leaderboard', 'shop', 'account'].map(tab => (
                   <button key={tab} onClick={() => setActiveTab(tab)} 
                      className={`flex flex-col items-center justify-center w-16 h-full gap-1 transition-all active:scale-90 ${activeTab === tab ? 'text-cyan-400' : 'text-white/30'}`}>
                      <span className="text-2xl">{tab === 'game' ? '🎮' : tab === 'leaderboard' ? '🏆' : tab === 'shop' ? '🛒' : '👤'}</span>
                      <span className="text-[10px] font-bold uppercase">{tab === 'game' ? 'Oyun' : tab === 'leaderboard' ? 'Lider' : tab === 'shop' ? 'Market' : 'Ben'}</span>
                   </button>
              ))}
          </div>

        </div>
      </div>

      {/* FEEDBACK OVERLAY */}
      {gameState.feedbackMessage && (
          <div className="fixed top-1/3 left-0 w-full flex justify-center pointer-events-none z-[60]">
              <div className="bingo-text text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-cyan-300 drop-shadow-[0_0_30px_rgba(34,211,238,0.8)] px-6 py-2 rounded-2xl backdrop-blur-sm">
                  {gameState.feedbackMessage}
              </div>
          </div>
      )}

      {/* SÜRÜKLENEN PARÇA (HAYALET) */}
      {draggedPiece && (
        <div 
            style={{ 
                position: 'fixed', 
                left: dragPos.x, 
                // Parmağın bloğu kapatmaması için görseli yukarı kaydırıyoruz
                top: dragPos.y - TOUCH_OFFSET_Y, 
                transform: 'translate(-50%, -50%) scale(1.1)', 
                pointerEvents: 'none', 
                zIndex: 100,
                filter: 'drop-shadow(0 0 20px rgba(34,211,238,0.5))' 
            }}
        >
           <BlockPiece piece={draggedPiece} themeConfig={gameState.themeConfig} />
        </div>
      )}
    </div>
  );
};

export default App;
