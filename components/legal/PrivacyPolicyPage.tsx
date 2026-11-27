import React from 'react';
import { PhssjLogo } from '../Logo';
import { Shield, ArrowLeft, Mail, School } from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-4 sm:px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center p-1 shadow-md">
            <PhssjLogo className="w-full h-full rounded-lg" />
          </div>
          <div>
            <span className="text-sm font-bold tracking-tight text-white block">PHSSJ Portal</span>
            <span className="text-[11px] text-slate-400">Peoples Higher Secondary School Jamshoro</span>
          </div>
        </div>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors active:scale-95"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Portal</span>
        </a>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="space-y-8">
          <div className="border-b border-slate-800 pb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold mb-4">
              <Shield className="w-3.5 h-3.5" />
              <span>Official Privacy Policy</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Privacy Policy for PHSSJ Portal
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Effective Date: November 2026 · People&apos;s Higher Secondary School Jamshoro (PHSSJ)
            </p>
          </div>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm sm:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <School className="w-5 h-5 text-blue-400 shrink-0" />
                <span>1. Overview & Institutional Purpose</span>
              </h2>
              <p>
                The <strong>PHSSJ Portal</strong> is an internal academic and administrative platform operated by{' '}
                <strong>People&apos;s Higher Secondary School Jamshoro (PHSSJ)</strong>. The portal is used exclusively by authorized school faculty, teachers, and administrators to manage curriculum lesson plans, exam papers, daily student attendance, marksheets, and student records aligned with the Sindh Textbook Board (STBB) curriculum.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">2. Information We Access & Process</h2>
              <p>
                To provide seamless institutional workflows, the portal requests access only to necessary educational and verification data:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>
                  <strong>Google Sign-In Profile Data:</strong> Basic profile information (name and school email address) used strictly to verify authorized staff identity and secure administrative access.
                </li>
                <li>
                  <strong>Google Sheets:</strong> Read and write access to school-authorized Google Sheets containing class rosters, student records, and attendance registries explicitly connected and synchronized by school administrators.
                </li>
                <li>
                  <strong>Google Drive (Optional / User-Initiated):</strong> Access to specific Google Drive folders or files strictly when explicitly selected and linked by authorized staff for student document ingestion and verification.
                </li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">3. How Information Is Used & Protected</h2>
              <p>
                All data accessed through Google APIs or stored within the portal is used solely for internal educational administration at PHSSJ. We adhere to strict security protocols:
              </p>
              <ul className="list-disc pl-6 space-y-2 text-slate-300">
                <li>Data is never sold, traded, rented, or shared with external commercial entities.</li>
                <li>Access is restricted exclusively to authenticated school personnel.</li>
                <li>Data transmission is encrypted using secure HTTPS connections and industry-standard protocols.</li>
              </ul>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">4. Contact & Support</h2>
              <p>
                If you have any questions, concerns, or requests regarding this Privacy Policy or institutional data practices, please contact the school administration or system administrator at:
              </p>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
                <Mail className="w-5 h-5 text-blue-400 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block">Primary Contact Email</span>
                  <a href="mailto:abdul7762ahad@gmail.com" className="font-semibold text-white hover:underline">
                    abdul7762ahad@gmail.com
                  </a>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-4xl mx-auto px-4 sm:px-6 py-8 border-t border-slate-800 text-center text-xs text-slate-500">
        &copy; {new Date().getFullYear()} People&apos;s Higher Secondary School Jamshoro. All Rights Reserved.
      </footer>
    </div>
  );
};
