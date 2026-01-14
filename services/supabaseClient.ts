
import { createClient } from '@supabase/supabase-js';

// Ortam değişkenlerini al
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

// URL ve Key kontrolü
const isValidConfig = supabaseUrl && supabaseKey && supabaseUrl.startsWith('http');

let client;

if (isValidConfig) {
  // 1. SEÇENEK: Gerçek Supabase Bağlantısı (Anahtarlar varsa)
  client = createClient(supabaseUrl as string, supabaseKey as string);
} else {
  // 2. SEÇENEK: Yerel Depolama (Local Storage) Simülasyonu
  // Anahtarlar yoksa uygulama bozulmaz, tarayıcı hafızasını veritabanı gibi kullanır.
  console.warn("⚠️ Supabase anahtarları bulunamadı. Yerel Depolama Modu (Local Mode) aktif edildi.");

  const STORAGE_KEY_USERS = 'neon_bingo_users_db';
  const STORAGE_KEY_SESSION = 'neon_bingo_active_session';

  // Yardımcı fonksiyonlar
  const getUsers = () => JSON.parse(localStorage.getItem(STORAGE_KEY_USERS) || '[]');
  const saveUsers = (users: any[]) => localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  const getSession = () => JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION) || 'null');
  const setSession = (session: any) => localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));

  client = {
    auth: {
      getSession: async () => {
        const session = getSession();
        return { data: { session }, error: null };
      },
      onAuthStateChange: (callback: any) => {
        // İlk yüklemede session durumunu tetikle
        const session = getSession();
        callback('SIGNED_IN', session);
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      signUp: async ({ email, password, options }: any) => {
        const users = getUsers();
        const existing = users.find((u: any) => u.email === email);
        
        if (existing) {
          return { data: null, error: { message: "Bu e-posta adresi zaten kayıtlı!" } };
        }

        const newUser = {
          id: 'user_' + Math.random().toString(36).substr(2, 9),
          email,
          password, // Gerçek uygulamada şifreler hashlenmeli, bu sadece simülasyon.
          user_metadata: options?.data || {},
          created_at: new Date().toISOString()
        };

        users.push(newUser);
        saveUsers(users);

        // Otomatik giriş yap
        const session = { 
          access_token: 'local_token_' + Math.random(), 
          user: newUser 
        };
        setSession(session);

        return { data: { user: newUser, session }, error: null };
      },
      signInWithPassword: async ({ email, password }: any) => {
        const users = getUsers();
        const user = users.find((u: any) => u.email === email && u.password === password);

        if (!user) {
          return { data: null, error: { message: "Hatalı e-posta veya şifre!" } };
        }

        const session = { 
          access_token: 'local_token_' + Math.random(), 
          user 
        };
        setSession(session);

        return { data: { user, session }, error: null };
      },
      signOut: async () => {
        localStorage.removeItem(STORAGE_KEY_SESSION);
        return { error: null };
      },
      updateUser: async ({ data }: any) => {
        const currentSession = getSession();
        if (!currentSession) return { data: null, error: { message: "Oturum yok." } };

        const users = getUsers();
        const userIndex = users.findIndex((u: any) => u.id === currentSession.user.id);

        if (userIndex === -1) return { data: null, error: { message: "Kullanıcı bulunamadı." } };

        // Kullanıcıyı güncelle
        users[userIndex].user_metadata = { ...users[userIndex].user_metadata, ...data };
        saveUsers(users);

        // Session'ı güncelle
        const updatedUser = users[userIndex];
        const newSession = { ...currentSession, user: updatedUser };
        setSession(newSession);

        return { data: { user: updatedUser }, error: null };
      },
    },
    // Bu istemci bir "Mock" istemcidir
    isMock: true
  } as any;
}

export const supabase = client;
