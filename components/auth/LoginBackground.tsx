import React from 'react';
import { motion } from 'motion/react';

export const LoginBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Dynamic Deep Indigo Mesh Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950" />

      {/* Primary Floating Glow Orb */}
      <motion.div
        animate={{
          x: [0, 40, -30, 0],
          y: [0, -50, 20, 0],
          scale: [1, 1.15, 0.95, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-32 -left-32 w-[600px] h-[600px] rounded-full bg-blue-600/20 blur-[130px]"
      />

      {/* Emerald Accent Orb */}
      <motion.div
        animate={{
          x: [0, -50, 30, 0],
          y: [0, 40, -40, 0],
          scale: [1, 1.2, 0.9, 1],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/2 -right-40 w-[550px] h-[550px] rounded-full bg-emerald-500/15 blur-[140px]"
      />

      {/* Indigo Accent Orb */}
      <motion.div
        animate={{
          x: [0, 30, -20, 0],
          y: [0, -30, 30, 0],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-20 left-1/3 w-[500px] h-[500px] rounded-full bg-indigo-600/20 blur-[130px]"
      />

      {/* Fine Geometric Grid Matrix */}
      <div
        className="absolute inset-0 opacity-[0.035]"
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
  );
};
