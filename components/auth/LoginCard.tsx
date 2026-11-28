import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhssjLogo } from '../Logo';
import { ADMIN_EMAILS } from '../../services/adminService';
import {
  ShieldCheck,
  ArrowRight,
  Lock,
  AlertCircle,
} from 'lucide-react';

export interface LoginCardProps {
  isSigningIn: boolean;
  errorMessage: string | null;
  onGoogleSignIn: () => void;
  onContinueAsGuest: () => void;
}

export const LoginCard: React.FC<LoginCardProps> = ({
  isSigningIn,
  errorMessage,
  onGoogleSignIn,
  onContinueAsGuest,
}) => {
  return (
    <div className="w-full lg:w-[420px] max-w-md animate-softSettle">
      <div className="relative rounded-[32px] p-6 sm:p-8 bg-slate-900/90 border border-white/15 backdrop-blur-2xl shadow-2xl overflow-hidden ring-1 ring-white/10">
        {/* Top Subtle Specular Light Highlight */}
        <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-blue-400/50 to-transparent" />

        {/* School Crest Presentation with Soft Luminescence */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="relative group">
            <div className="w-18 h-18 rounded-2xl bg-white p-2 flex items-center justify-center shadow-[0_0_24px_rgba(59,130,246,0.28)] ring-4 ring-white/10">
              <PhssjLogo className="w-full h-full rounded-xl" />
            </div>
            <div className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center ring-2 ring-slate-900 shadow-md">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
            </div>
          </div>

          <h2 className="mt-4 text-xl font-bold tracking-tight text-white">
            Faculty & Admin Sign In
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            Peoples Higher Secondary School Jamshoro
          </p>
        </div>

        <AnimatePresence>
          {errorMessage && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="mb-4 p-3 bg-red-900/30 border border-red-500/40 rounded-xl text-xs text-red-200 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span className="flex-1">{errorMessage}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Google OAuth Action Button */}
        <div className="space-y-3.5">
          <button
            id="google-signin-animated-btn"
            type="button"
            disabled={isSigningIn}
            onClick={onGoogleSignIn}
            className="w-full group relative flex items-center justify-center gap-3 px-6 py-3.5 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-semibold text-sm shadow-xl shadow-white/5 transition-[background-color,transform] active:scale-[0.98] cursor-pointer overflow-hidden border border-white"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />

            {isSigningIn ? (
              <div className="flex items-center gap-2 text-slate-700">
                <svg className="animate-spin h-5 w-5 text-blue-600" viewBox="0 0 24 24" aria-hidden="true">
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
                <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
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
                <ArrowRight className="w-4 h-4 text-slate-600 group-hover:translate-x-1 transition-transform ml-auto" aria-hidden="true" />
              </>
            )}
          </button>

          {/* Guest Explore Mode */}
          <button
            id="guest-access-animated-btn"
            type="button"
            onClick={onContinueAsGuest}
            className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-white/[0.08] hover:bg-white/[0.14] text-slate-100 font-medium text-xs border border-white/15 transition-[background-color,transform] active:scale-[0.99] cursor-pointer"
          >
            <span>Continue in Guest / Demo Mode</span>
            <span className="text-[11px] text-slate-300">(Read-Only Access)</span>
          </button>
        </div>

        {/* Admin Authorization Badge */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-col items-center gap-2 text-center">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/15 border border-blue-400/25 text-[11px] text-blue-200 font-medium">
            <Lock className="w-3 h-3 text-blue-300" aria-hidden="true" />
            <span>Authorized Admin: {ADMIN_EMAILS[0]}</span>
          </div>
          <p className="text-[11px] text-slate-300">
            School enrollment ledger changes require verified administrator credentials.
          </p>
        </div>
      </div>
    </div>
  );
};
