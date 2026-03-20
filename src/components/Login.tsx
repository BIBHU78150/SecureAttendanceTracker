import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AlertCircle, Mail, Lock } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import logo from '../logo.png';

const Login: React.FC = () => {
  const { session, profile, loading, deviceError } = useAuth();
  const [activeTab, setActiveTab] = useState<'volunteer' | 'admin'>('volunteer');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [volRoll, setVolRoll] = useState('');
  const [volPassword, setVolPassword] = useState('');
  const [adminError, setAdminError] = useState('');
  const [volError, setVolError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [volunteerMode, setVolunteerMode] = useState<'google' | 'roll'>('google');

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin
      }
    });
  };

  const handleRollLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setVolError('');
    setAuthLoading(true);

    try {
      console.log("Attempting Roll Login for:", volRoll);
      // 1. Look up the whitelisted email
      const { data: mappedEmail, error: rpcError } = await supabase.rpc('get_email_by_roll', { roll_no: volRoll });
      console.log("Mapped Email from RPC:", mappedEmail);
      
      if (rpcError || !mappedEmail) {
        console.error("RPC Error or No Email:", rpcError);
        setVolError('Roll Number not found in whitelist.');
        setAuthLoading(false);
        return;
      }

      // 2. Try standard Login 
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: mappedEmail,
        password: volPassword
      });

      // 3. If login fails (user might not exist yet), check if admin-assigned password matches
      if (authError) {
        console.log("Initial Sign-in failed (expected if new):", authError.message);
        
        if (authError.message.toLowerCase().includes('invalid login credentials')) {
          const { data: isInitialPassMatch, error: passError } = await supabase.rpc('check_whitelist_password', { 
            roll_no: volRoll, 
            pass: volPassword 
          });
          
          console.log("Initial password match check result:", isInitialPassMatch);
          if (passError) console.error("Pass RPC Error:", passError.message);

          if (isInitialPassMatch) {
            console.log("Password matched! Attempting auto-signup for:", mappedEmail);
            // Auto Sign Up using the whitelisted email and assigned password
            const { error: signUpError } = await supabase.auth.signUp({
              email: mappedEmail,
              password: volPassword,
              options: {
                data: { full_name: `Student ${volRoll}` }
              }
            });
            if (signUpError) {
              console.error("SignUp Error:", signUpError.message);
              setVolError(`Final activation failed: ${signUpError.message}`);
            } else {
              console.log("SignUp successful! Waiting 1.5s for session sync...");
              // 1.5-second delay to avoid race condition on new signups
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              console.log("Attempting final login...");
              // Now explicitly sign in to establish the session
              const { error: finalLoginError } = await supabase.auth.signInWithPassword({
                 email: mappedEmail,
                 password: volPassword
              });
              if (finalLoginError) {
                console.warn("Manual signin after signup failed:", finalLoginError.message);
                if (finalLoginError.message.includes('Email not confirmed')) {
                  setVolError('Activation successful! Please check your email to verify and then login.');
                } else if (finalLoginError.message.includes('Invalid login credentials')) {
                  setVolError('Conflict detected: This email already has an account. Please ask your administrator to reset your account in Supabase Auth.');
                } else {
                  setVolError(`Activation worked, but login failed: ${finalLoginError.message}`);
                }
              } else {
                console.log("Final Login successful! Redirecting...");
              }
            }
          } else {
            console.warn("Initial password did NOT match.");
            setVolError('Invalid Roll Number or Password.');
          }
        } else {
          setVolError(`Authentication failed: ${authError.message}`);
        }
      }
    } catch (err: any) {
      console.error("Unexpected catch block error:", err);
      setVolError('An unexpected error occurred during login.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminError('');
    setAuthLoading(true);
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    
    if (error) {
      setAdminError(error.message);
    }
    
    setAuthLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center">
          <div className="h-12 w-12 bg-blue-500 rounded-full mb-4"></div>
          <p className="text-slate-500 font-medium">Authenticating securely...</p>
        </div>
      </div>
    );
  }

  // Redirect if already logged in and profile loaded
  if (session && profile) {
    if (profile.role === 'admin') {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white/70 backdrop-blur-xl border border-white/20 shadow-2xl rounded-3xl p-8 transform transition-all hover:scale-[1.01]">
        
        <div className="text-center mb-8">
          <div className="mx-auto flex items-center justify-center mb-6">
            <img src={logo} alt="Event Portal Logo" className="h-40 w-auto object-contain" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Event Portal</h1>
          <p className="text-slate-500">Secure attendance tracking</p>
        </div>

        {deviceError && (
          <div className="mb-6 p-4 bg-red-50/50 border border-red-200 rounded-2xl flex items-start text-red-700">
            <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
            <p className="text-sm font-medium">{deviceError}</p>
          </div>
        )}

        <div className="flex bg-slate-100 p-1 rounded-2xl mb-8">
          <button
            onClick={() => setActiveTab('volunteer')}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
              activeTab === 'volunteer' 
                ? 'bg-white text-blue-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Volunteer
          </button>
          <button
            onClick={() => setActiveTab('admin')}
            className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
              activeTab === 'admin' 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Administrator
          </button>
        </div>

        {activeTab === 'volunteer' ? (
          <div>
            <div className="flex bg-slate-100 p-1 rounded-2xl mb-6">
              <button
                onClick={() => setVolunteerMode('google')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  volunteerMode === 'google' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Google Auth
              </button>
              <button
                onClick={() => setVolunteerMode('roll')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                  volunteerMode === 'roll' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                Roll Number
              </button>
            </div>

            {volunteerMode === 'google' ? (
              <>
                <button
                  onClick={handleGoogleLogin}
                  className="w-full relative group overflow-hidden rounded-2xl bg-white border border-slate-200 px-6 py-4 text-slate-700 font-semibold shadow-sm hover:shadow-md transition-all hover:-translate-y-0.5"
                >
                  <div className="absolute inset-0 w-full h-full bg-slate-50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  <div className="relative flex items-center justify-center">
                    <img 
                      src="https://www.svgrepo.com/show/475656/google-color.svg" 
                      alt="Google" 
                      className="w-6 h-6 mr-3" 
                    />
                    Continue with Google
                  </div>
                </button>
                <p className="mt-6 text-center text-sm text-slate-400">
                  Volunteers must use their registered Google Account to bind their device and log location.
                </p>
              </>
            ) : (
              <form onSubmit={handleRollLogin} className="space-y-4">
                {volError && (
                  <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                    {volError}
                  </div>
                )}
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={volRoll}
                    onChange={(e) => setVolRoll(e.target.value)}
                    placeholder="23CSEAIML057"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={volPassword}
                    onChange={(e) => setVolPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all"
                  />
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full mt-2 bg-gradient-to-r from-blue-600 to-cyan-500 text-white font-semibold py-3 rounded-xl shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:hover:translate-y-0"
                >
                  {authLoading ? 'Verifying...' : 'Sign in with Roll Number'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <form onSubmit={handleAdminLogin} className="space-y-4">
            {adminError && (
              <div className="p-3 bg-red-50 text-red-600 text-sm rounded-xl border border-red-100">
                {adminError}
              </div>
            )}
            
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Admin Email ID"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            </div>
            
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full mt-2 bg-gradient-to-r from-indigo-600 to-blue-600 text-white font-semibold py-3 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {authLoading ? 'Signing in...' : 'Sign In as Admin'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default Login;
