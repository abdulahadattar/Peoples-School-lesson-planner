import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhssjLogo, ZiauddinLogo } from '../Logo';
import { loginWithGoogle, getCurrentUser } from '../../services/googleAuth';
import { ADMIN_EMAILS } from '../../services/adminService';
import { User } from 'firebase/auth';
import {
  ShieldCheck,
  GraduationCap,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  FileSpreadsheet,
  Clock,
  CheckCircle2,
  Lock,
  Layers,
  HelpCircle,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

interface AnimatedLoginPageProps {
  onLoginSuccess: (user: User) => void;
  onContinueAsGuest: () => void;
}

const HIGHLIGHT_MODULES = [
  {
    icon: CalendarCheck,
    title: 'Daily Attendance Register',
    badge: '868 Students',
    desc: 'Automated boys/girls breakdown, absentee counts & Google Sheets live backup.',
    color: 'from-blue-500 to-indigo-600',
    lightBg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60',
  },
  {
    icon: BookOpen,
    title: 'Sindh Board SLO Lesson Plans',
    badge: 'Grades 9–12',
    desc: 'Structured 40-minute lesson plans with 5E instructional phases & DOK levels.',
    color: 'from-emerald-500 to-teal-600',
    lightBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60',
  },
  {
    icon: FileSpreadsheet,
    title: 'Board Exam Paper Generator',
    badge: 'Section A, B, C',
    desc: 'Bilingual questions, rubrics, answer keys & instant PDF/DOCX formatting.',
    color: 'from-violet-500 to-purple-600',
    lightBg: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60',
  },
  {
    icon: Clock,
    title: 'Live Timetable & Roster',
    badge: '21 Faculty',
    desc: 'Real-time proxy substitution and teacher load allocation.',
    color: 'from-amber-500 to-orange-600',
    lightBg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
  },
];

export const AnimatedLoginPage: React.FC<AnimatedLoginPageProps> = ({
  onLoginSuccess,
  onContinueAsGuest,
}) => {
  const [isSigningIn, setIsSigningIn] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<number>(0);
  const [interactiveStep, setInteractiveStep] = useState<'welcome' | 'adminInfo' | 'help'>('welcome');

  // Auto cycle highlights gently
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTab((prev) => (prev + 1) % HIGHLIGHT_MODULES.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    setErrorMessage(null);
    try {
      const user = await loginWithGoogle();
      if (user) {
        onLoginSuccess(user);
      } else {
        // User may have cancelled popup or it was closed
        setIsSigningIn(false);
      }
    } catch (err: any) {
      console.warn('Authentication error:', err);
      setErrorMessage(
        err?.code === 'auth/popup-blocked'
          ? 'Sign-in pop-up was blocked. Please allow popups or open in a new tab.'
          : err?.message || 'Sign in encountered an issue. You may continue in Guest Mode.'
      );
      setIsSigningIn(false);
    }
  };

  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-between overflow-hidden bg-[#070b14] text-slate-100 font-sans selection:bg-blue-500 selection:text-white">
      {/* ── Motion Graphics Dynamic Background ──────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        {/* Ambient flowing liquid orbs */}
        <motion.div
          animate={{
            x: [0, 50, -40, 0],
            y: [0, -60, 40, 0],
            scale: [1, 1.15, 0.95, 1],
          }}
          transition={{
            duration: 22,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
          className="absolute -top-32 -left-32 w-[520px] h-[520px] rounded-full bg-gradient-to-br from-blue-600/30 via-indigo-600/20 to-transparent blur-[120px]"
        />

        <motion.div
          animate={{
            x: [0, -60, 50, 0],
            y: [0, 70, -30, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{
            duration: 26,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 2,
          }}
          className="absolute -bottom-40 -right-40 w-[600px] h-[600px] rounded-full bg-gradient-to-tl from-emerald-600/25 via-teal-500/15 to-transparent blur-[130px]"
        />

        <motion.div
          animate={{
            x: [0, 40, -30, 0],
            y: [0, 40, -40, 0],
            scale: [1, 1.1, 0.92, 1],
          }}
          transition={{
            duration: 18,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 4,
          }}
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full bg-gradient-to-r from-violet-600/20 to-blue-600/15 blur-[100px]"
        />

        {/* Apple-style fine geometric motion mesh grid */}
        <div
          className="absolute inset-0 opacity-[0.07] dark:opacity-[0.09]"
          style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)`,
            backgroundSize: '36px 36px',
          }}
        />

        {/* Subtle diagonal glowing light sweep */}
        <motion.div
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: '200%', opacity: [0, 0.12, 0] }}
          transition={{
            duration: 8,
            repeat: Infinity,
            repeatDelay: 5,
            ease: 'easeInOut',
          }}
          className="absolute top-0 bottom-0 w-[400px] bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-[-25deg]"
        />
      </div>

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
            <span className="text-xs font-bold tracking-tight text-white flex items-center gap-1.5">
              PHSSJ Portal
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
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
            className="text-xs font-medium text-slate-300 hover:text-white px-3.5 py-1.5 rounded-full hover:bg-white/10 transition-all border border-transparent hover:border-white/10 active:scale-95"
          >
            Explore as Guest
          </button>
        </motion.div>
      </header>

      {/* ── Main Dynamic Stage ──────────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-5xl px-4 sm:px-6 py-8 md:py-12 my-auto flex flex-col lg:flex-row items-center justify-center gap-10 lg:gap-14">
        {/* Left Column: Vision & Dynamic Motion Feature Carousel */}
        <div className="w-full lg:w-1/2 flex flex-col space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-3"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/30 text-blue-300 text-xs font-medium backdrop-blur-md">
              <GraduationCap className="w-3.5 h-3.5 text-blue-400" />
              <span>School Portal</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-[1.15]">
              Peoples Higher Secondary School
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-teal-300 to-emerald-400">
                Jamshoro
              </span>
            </h1>

            <p className="text-sm sm:text-base text-slate-300/90 leading-relaxed font-normal max-w-lg">
              Sign in to manage lesson plans, exam papers, student records and attendance.
            </p>
          </motion.div>

          {/* iOS Fluid Interactive Feature Pills */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="space-y-2.5 pt-2"
          >
            {HIGHLIGHT_MODULES.map((item, idx) => {
              const isActive = activeTab === idx;
              const Icon = item.icon;
              return (
                <motion.div
                  key={item.title}
                  onClick={() => setActiveTab(idx)}
                  whileHover={{ scale: 1.015 }}
                  whileTap={{ scale: 0.985 }}
                  className={`cursor-pointer relative p-3.5 rounded-2xl border transition-all duration-300 ${
                    isActive
                      ? 'bg-white/10 border-blue-400/40 shadow-lg shadow-blue-500/10 backdrop-blur-xl'
                      : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 ${
                        isActive
                          ? `bg-gradient-to-br ${item.color} text-white shadow-md scale-105`
                          : 'bg-white/5 text-slate-400'
                      }`}
                    >
                      <Icon className="w-4.5 h-4.5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-xs sm:text-sm font-semibold truncate ${
                            isActive ? 'text-white' : 'text-slate-300'
                          }`}
                        >
                          {item.title}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-white/10 text-slate-300 border border-white/10 whitespace-nowrap">
                          {item.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">
                        {item.desc}
                      </p>
                    </div>
                  </div>

                  {isActive && (
                    <motion.div
                      layoutId="activeModuleGlow"
                      className="absolute inset-0 rounded-2xl ring-1 ring-blue-400/30 pointer-events-none"
                      transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                    />
                  )}
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Right Column: Apple-Class Glassmorphic Authentication Card */}
        <div className="w-full lg:w-[420px] max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="relative rounded-[32px] p-6 sm:p-8 bg-slate-900/80 border border-white/15 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-white/10"
          >
            {/* Top Subtle Specular Light Highlight */}
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />

            {/* School Crest Presentation with Soft Luminescence */}
            <div className="flex flex-col items-center text-center mb-6">
              <div className="relative group">
                <motion.div
                  animate={{
                    boxShadow: [
                      '0 0 20px rgba(59, 130, 246, 0.25)',
                      '0 0 40px rgba(16, 185, 129, 0.35)',
                      '0 0 20px rgba(59, 130, 246, 0.25)',
                    ],
                  }}
                  transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-18 h-18 rounded-2xl bg-white p-2 flex items-center justify-center shadow-2xl ring-4 ring-white/10"
                >
                  <PhssjLogo className="w-full h-full rounded-xl" />
                </motion.div>
                <div className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center ring-2 ring-slate-900 shadow-md">
                  <ShieldCheck className="w-3.5 h-3.5" />
                </div>
              </div>

              <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
                Faculty & Admin Sign In
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Peoples Higher Secondary School Jamshoro
              </p>
            </div>

            {/* Error Notification */}
            <AnimatePresence>
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, height: 0, mb: 0 }}
                  animate={{ opacity: 1, height: 'auto', mb: 16 }}
                  exit={{ opacity: 0, height: 0, mb: 0 }}
                  className="p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="flex-1">{errorMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Google OAuth Action Button */}
            <div className="space-y-3.5">
              <motion.button
                id="google-signin-animated-btn"
                type="button"
                disabled={isSigningIn}
                onClick={handleGoogleSignIn}
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="w-full group relative flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-semibold text-sm shadow-xl shadow-white/5 transition-all cursor-pointer overflow-hidden border border-white"
              >
                {/* Subtle sheen highlight */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

                {isSigningIn ? (
                  <div className="flex items-center gap-2 text-slate-700">
                    <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span>Authenticating with Google...</span>
                  </div>
                ) : (
                  <>
                    {/* Official Google multi-color SVG icon */}
                    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                      <path
                        fill="#4285F4"
                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                      />
                    </svg>
                    <span>Sign In with Google</span>
                    <ArrowRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform ml-auto" />
                  </>
                )}
              </motion.button>

              {/* Guest Explore Mode */}
              <motion.button
                id="guest-access-animated-btn"
                type="button"
                onClick={onContinueAsGuest}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 font-medium text-xs border border-white/10 transition-colors"
              >
                <span>Continue in Guest / Demo Mode</span>
                <span className="text-[11px] text-slate-400">(Read-Only Access)</span>
              </motion.button>
            </div>

            {/* Admin Authorization Badge */}
            <div className="mt-6 pt-5 border-t border-white/10 flex flex-col items-center gap-2 text-center">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 font-medium">
                <Lock className="w-3 h-3 text-blue-400" />
                <span>Authorized Admin: {ADMIN_EMAILS[0]}</span>
              </div>
              <p className="text-[11px] text-slate-500">
                School enrollment ledger changes require verified administrator credentials.
              </p>
            </div>
          </motion.div>
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="relative z-10 w-full max-w-6xl px-4 sm:px-8 py-5 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500 border-t border-white/5">
        <div className="flex items-center gap-3">
          <span>&copy; {new Date().getFullYear()} Peoples Higher Secondary School Jamshoro</span>
          <span className="hidden sm:inline text-slate-600">&bull;</span>
          <span className="hidden sm:inline">All Rights Reserved</span>
        </div>
        <div className="flex items-center gap-4 text-slate-400">
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span>Sindh Board Compliant</span>
          </span>
          <span>&bull;</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
            <span>Firebase Cloud Secure</span>
          </span>
        </div>
      </footer>
    </div>
  );
};
