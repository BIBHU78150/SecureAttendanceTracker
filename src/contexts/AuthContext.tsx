import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

// Helper to get or create a device token
const getDeviceToken = () => {
  let token = localStorage.getItem('device_token');
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('device_token', token);
  }
  return token;
};

type Profile = {
  id: string;
  email: string;
  full_name?: string;
  roll_number?: string;
  role: 'admin' | 'volunteer';
  team_id?: string;
  team_ids?: string[];
  device_token?: string;
};

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
  deviceError: string | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  useEffect(() => {
    // Initial fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      setLoading(true);
      setDeviceError(null);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error) {
        // Strict whitelist enforcement per PRD: 
        // "System checks if the Google email exists... If no, deny access and sign out."
        if (error.code === 'PGRST116') {
          // Profile doesn't exist (trigger failed or not whitelisted)
          await supabase.auth.signOut();
          setDeviceError("You are not authorized or whitelisted for this event.");
        }
        console.error('Error fetching profile:', error.message);
        setProfile(null);
      } else {
        // Enforce Device Token Rule
        if (data.role !== 'admin') {
          const localToken = getDeviceToken();
          if (!data.device_token) {
            // First time login for volunteer, bind token
            await supabase.from('profiles').update({ device_token: localToken }).eq('id', userId);
            setProfile({ ...data, device_token: localToken });
          } else if (data.device_token !== localToken) {
            // Block access entirely
            await supabase.auth.signOut();
            setDeviceError("Device mismatch! You cannot log in from a different device.");
            setProfile(null);
          } else {
            setProfile(data);
          }
        } else {
          // Admin bypass
          setProfile(data);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, loading, signOut, deviceError }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
