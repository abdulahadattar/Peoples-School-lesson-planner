import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { PhssjLogo, ZiauddinLogo } from '../Logo';
import { loginWithGoogle, getCurrentUser } from '../../services/googleAuth';
import { User } from 'firebase/auth';
import {
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { LoginBackground } from './LoginBackground';
import { LoginFeaturePills } from './LoginFeaturePills';
import { LoginCard } from './LoginCard';
import { toUserErrorMessage } from '../../utils/userMessage';

interface AnimatedLoginPageProps {
  onLoginSuccess: (user: User) => void;
  onContinueAsGuest: () => void;
}

export const AnimatedLoginPage: React.FC<AnimatedLoginPageProps> = ({
  onLoginSuccess,
  onContinueAsGuest,
}) => {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    const existing = getCurrentUser();
    if (existing) {
      onLoginSuccess(existing);
    }
  }, [onLoginSuccess]);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      const user = await loginWithGoogle();
      if (user) {
        onLoginSuccess(user);
      }
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.message?.includes('closed-by-user')) {
        setErrorMessage('Sign-in cancelled. Please click "Sign In with Google" again.');
      } else {
        setErrorMessage(
          toUserErrorMessage(err, 'Unable to sign in with Google. You can continue as guest.')
        );
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col justify-between bg-slate-950 font-sans selection:bg-blue-500 selection:text-white overflow-x-hidden">
      <LoginBackground />

      {/* ── Top Floating Navigation Pill ────────────────────────────────────── */}
      <header className="relative z-10 w-full max-w-6xl px-4 sm:px-8 pt-6 flex items-center justify-between">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3 px-4 py-2 rounded-full bg-white/5 border border-white/10 backdrop-blur-xl shadow-xl"
        >
          <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center p-0.5 shadow-md">
            <PhssjLogo className="w-full h-full rounded-full" />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold tracking-tight text-white">
              PHSSJ Portal
            </span>
            <span className="text-[10px] text-slate-400">Peoples Higher Secondary School</span>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center gap-3"
        >
          <div className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs text-slate-300 backdrop-blur-md">
            <ZiauddinLogo className="h-4 w-auto brightness-200" />
            <span className="text-[11px] text-slate-400">Affiliated with Ziauddin Univ</span>
          </div>

          <button
            onClick={onContinueAsGuest}
            id="login-explore-guest-top-btn"
            className="text-xs font-medium text-slate-300 hover:text-white px-3.5 py-1.5 rounded-full hover:bg-white/10 transition-[color,background-color,border-color,transform] border border-transparent hover:border-white/10 active:scale-95"
          >
            Explore as Guest
          </button>
        </motion.div>
      </header>

      {/* ── Main Dynamic Stage ──────────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-5xl px-4 sm:px-6 py-4 sm:py-8 md:py-12 my-auto flex flex-col lg:flex-row items-center justify-center gap-6 sm:gap-10 lg:gap-14">
        <div className="w-full lg:w-1/2 order-2 lg:order-1">
          <LoginFeaturePills activeTab={activeTab} setActiveTab={setActiveTab} />
        </div>
        <div className="w-full lg:w-[420px] max-w-md order-1 lg:order-2 flex justify-center">
          <LoginCard
            isSigningIn={isSigningIn}
            errorMessage={errorMessage}
            onGoogleSignIn={handleGoogleSignIn}
            onContinueAsGuest={onContinueAsGuest}
          />
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full max-w-6xl px-4 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 border-t border-white/5">
        <div className="flex flex-wrap items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Peoples Higher Secondary School Jamshoro</span>
          <span className="hidden sm:inline text-slate-600">&bull;</span>
          <a href="/privacy" className="text-slate-400 hover:text-white transition-colors underline underline-offset-2">Privacy Policy</a>
          <span className="text-slate-600">&bull;</span>
          <a href="/terms" className="text-slate-400 hover:text-white transition-colors underline underline-offset-2">Terms of Service</a>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sindh Board Compliant</span>
          </span>
          <span>&bull;</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>School Account Sign-In</span>
          </span>
        </div>
      </footer>
    </div>
  );
};
