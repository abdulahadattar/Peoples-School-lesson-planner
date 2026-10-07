import React from 'react';
import { motion } from 'motion/react';
import {
  GraduationCap,
  CalendarCheck,
  BookOpen,
  FileSpreadsheet,
  Clock,
} from 'lucide-react';

export const HIGHLIGHT_MODULES = [
  {
    icon: CalendarCheck,
    title: 'Daily Attendance Register',
    badge: '868 Students',
    desc: 'Automated boys/girls breakdown, absentee counts & Google Sheets live backup.',
    color: 'from-blue-500 to-indigo-600',
  },
  {
    icon: BookOpen,
    title: 'Sindh Board SLO Lesson Plans',
    badge: 'Grades 9–12',
    desc: 'Structured 40-minute lesson plans with 5E instructional phases & DOK levels.',
    color: 'from-emerald-500 to-teal-600',
  },
  {
    icon: FileSpreadsheet,
    title: 'Board Exam Paper Generator',
    badge: 'Section A, B, C',
    desc: 'Bilingual questions, rubrics, answer keys & instant PDF/DOCX formatting.',
    color: 'from-violet-500 to-purple-600',
  },
  {
    icon: Clock,
    title: 'Live Timetable & Roster',
    badge: '21 Faculty',
    desc: 'Real-time proxy substitution and teacher load allocation.',
    color: 'from-amber-500 to-orange-600',
  },
];

export interface LoginFeaturePillsProps {
  activeTab: number;
  setActiveTab: (idx: number) => void;
}

export const LoginFeaturePills: React.FC<LoginFeaturePillsProps> = ({
  activeTab,
  setActiveTab,
}) => {
  return (
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
  );
};
