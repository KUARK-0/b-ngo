
import { createClient } from '@supabase/supabase-js';

// Kullanıcının sağladığı bağlantı dizesinden çıkarılan URL
const PROJECT_URL = 'https://scvvkmrqypippyipldma.supabase.co';

// Güvenli ortam değişkeni okuma
const getEnv = (key: string) => {
  try {
    return process.env[key];
  } catch (e) {
    return undefined;
  }
};

const supabaseKey = getEnv('SUPABASE_ANON_KEY');

let client;

// Eğer Anon Key varsa gerçek bağlantıyı kur, yoksa Yerel Mod'a geç
if (supabaseKey && PROJECT_URL) {
  client = createClient(PROJECT_URL, supabaseKey);
} else {
  console.log("⚠️ Anon Key eksik. Gelişmiş Yerel Depolama Modu aktif.");

  // !!! ÖNEMLİ: BU ANAHTARLARI DEĞİŞTİRMEYİN !!!
  // Bu anahtarlar değiştirilirse, önceki güncellemelerde kayıt olan kullanıcıların verileri silinir/görünmez olur.
  // Veri kalıcılığı için 'neon_bingo_users_v2' sabit kalmalıdır.
  const STORAGE_KEY_USERS = 'neon_bingo_users_v2';
  const STORAGE_KEY_SESSION = 'neon_bingo_session_v2';

  // --- Yardımcı Fonksiyonlar ---
  const getUsers = () => {
    try { 
      const data = localStorage.getItem(STORAGE_KEY_USERS);
      return data ? JSON.parse(data) : []; 
    } catch { 
      return []; 
    }
  };
  const saveUsers = (users: any[]) => localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
  
  const getSession = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_SESSION) || 'null'); } catch { return null; }
  };
  const setSession = (session: any) => {
    if (session) localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY_SESSION);
  };

  // --- Olay Bildirim Sistemi (Event Bus) ---
  let authSubscribers: Function[] = [];
  const notifySubscribers = (event: string, session: any) => {
    authSubscribers.forEach(cb => {
        try { cb(event, session); } catch(e) { console.error(e); }
    });
  };

  client = {
    // Veritabanı Sorgu Simülasyonu (Liderlik Tablosu için)
    from: (table: string) => {
      return {
        select: async (columns: string) => {
          if (table === 'profiles' || table === 'users') {
             const users = getUsers();
             // Güvenlik: Şifreleri ve hassas verileri temizle, sadece leaderboard için gerekenleri dön
             const cleanUsers = users.map((u: any) => ({
                id: u.id,
                display_name: u.user_metadata?.display_name || 'İsimsiz',
                high_score: u.user_metadata?.high_score || 0,
                country: u.user_metadata?.country || 'TR',
                avatar: u.user_metadata?.avatar || '👤',
                isVip: u.user_metadata?.isVip || false
             }));
             return { data: cleanUsers, error: null };
          }
          return { data: [], error: null };
        }
      };
    },
    auth: {
      getSession: async () => {
        const session = getSession();
        return { data: { session }, error: null };
      },
      onAuthStateChange: (callback: any) => {
        const session = getSession();
        authSubscribers.push(callback);
        callback(session ? 'SIGNED_IN' : 'SIGNED_OUT', session);
        return { data: { subscription: { unsubscribe: () => {
            authSubscribers = authSubscribers.filter(cb => cb !== callback);
        } } } };
      },
      signUp: async ({ email, password, options }: any) => {
        const users = getUsers();
        
        // 1. E-posta Kontrolü
        const existingEmail = users.find((u: any) => u.email === email);
        if (existingEmail) {
          return { data: null, error: { message: "Bu e-posta zaten kullanımda!" } };
        }

        // 2. Kullanıcı Adı Benzersizlik Kontrolü
        const requestedName = options?.data?.display_name;
        if (requestedName) {
            const existingName = users.find((u: any) => u.user_metadata?.display_name === requestedName);
            if (existingName) {
                return { data: null, error: { message: "Bu kullanıcı ismi zaten alındı!" } };
            }
        }

        const newUser = {
          id: 'user_' + Math.random().toString(36).substr(2, 9),
          email,
          password, 
          user_metadata: {
            ...options?.data,
            high_score: 0,
            country: 'TR', // Varsayılan
            avatar: '👤',
            isVip: false
          },
          created_at: new Date().toISOString()
        };

        users.push(newUser);
        saveUsers(users);

        const session = { access_token: 'local_' + Math.random(), user: newUser };
        setSession(session);
        notifySubscribers('SIGNED_IN', session);

        return { data: { user: newUser, session }, error: null };
      },
      signInWithPassword: async ({ email, password }: any) => {
        const users = getUsers();
        const user = users.find((u: any) => u.email === email && u.password === password);

        if (!user) {
          return { data: null, error: { message: "E-posta veya şifreniz yanlış!" } };
        }

        const session = { access_token: 'local_' + Math.random(), user };
        setSession(session);
        notifySubscribers('SIGNED_IN', session);

        return { data: { user, session }, error: null };
      },
      signOut: async () => {
        setSession(null);
        notifySubscribers('SIGNED_OUT', null);
        return { error: null };
      },
      updateUser: async ({ data }: any) => {
        const currentSession = getSession();
        if (!currentSession) return { data: null, error: { message: "Oturum yok." } };

        const users = getUsers();
        const userIndex = users.findIndex((u: any) => u.id === currentSession.user.id);

        if (userIndex === -1) return { data: null, error: { message: "Kullanıcı bulunamadı." } };

        // Kullanıcı Adı Değişikliği Varsa Benzersizlik Kontrolü
        if (data.display_name) {
             const nameExists = users.find((u: any) => 
                 u.user_metadata?.display_name === data.display_name && 
                 u.id !== currentSession.user.id
             );
             if (nameExists) {
                 return { data: null, error: { message: "Bu kullanıcı ismi zaten alındı!" } };
             }
        }

        // Metadata güncelle
        users[userIndex].user_metadata = { 
          ...users[userIndex].user_metadata, 
          ...data 
        };
        
        saveUsers(users);

        const updatedUser = users[userIndex];
        const newSession = { ...currentSession, user: updatedUser };
        setSession(newSession);
        notifySubscribers('USER_UPDATED', newSession);

        return { data: { user: updatedUser }, error: null };
      },
    },
    isMock: true
  } as any;
}

export const supabase = client;
