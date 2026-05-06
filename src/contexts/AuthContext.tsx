import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

type UserProfile = {
    cns: string;
    user_id: string;
    role: 'recepcionista' | 'farmacia' | 'profissional_saude';
    name: string;
    cnes?: string;
    ibge?: string;
    specialty?: string;
};

type AuthContextType = {
    session: Session | null;
    profile: UserProfile | null;
    loading: boolean;
};

const AuthContext = createContext<AuthContextType>({ session: null, profile: null, loading: true });

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const fetchProfile = async (userId: string) => {
        // Note: Assuming there's a table called 'profissionais' where roles are stored.
        const { data } = await supabase
            .from('professionals')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (data) {
            setProfile(data as UserProfile);
        }
        setLoading(false);
    };

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            if (session) fetchProfile(session.user.id);
            else setLoading(false);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            if (session) fetchProfile(session.user.id);
            else {
                setProfile(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, []);

    return (
        <AuthContext.Provider value={{ session, profile, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);