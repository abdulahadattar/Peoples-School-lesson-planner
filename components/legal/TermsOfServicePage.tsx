import React from 'react';
import { PhssjLogo } from '../Logo';
import { FileText, ArrowLeft, Mail, School } from 'lucide-react';

export const TermsOfServicePage: React.FC = () => {
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
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-semibold mb-4">
              <FileText className="w-3.5 h-3.5" />
              <span>Terms of Service</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Terms of Service for PHSSJ Portal
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Effective Date: November 2026 · People&apos;s Higher Secondary School Jamshoro (PHSSJ)
            </p>
          </div>

          <div className="prose prose-invert max-w-none space-y-6 text-slate-300 text-sm sm:text-base leading-relaxed">
            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                <School className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>1. Acceptance of Terms</span>
              </h2>
              <p>
                Welcome to the <strong>PHSSJ Portal</strong>. By accessing, logging into, or using this platform, you agree to be bound by these Terms of Service. If you do not agree to these terms, you are not authorized to access or use the portal.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">2. Authorized Use & Restricted Access</h2>
              <p>
                The PHSSJ Portal is strictly restricted to authorized teachers, school administrators, and designated staff members of <strong>People&apos;s Higher Secondary School Jamshoro (PHSSJ)</strong>. The platform is provided solely for official academic, educational, and administrative operations, including lesson planning, examination management, student attendance tracking, and academic recordkeeping.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">3. User Accounts & Security</h2>
              <p>
                Users must authenticate using authorized school credentials or school-approved Google accounts. You are responsible for maintaining the confidentiality of your login credentials and for all activities conducted under your account. Unauthorized sharing of credentials or access by non-staff members is strictly prohibited.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">4. Acceptable Conduct</h2>
              <p>
                Users agree not to misuse the platform, attempt unauthorized access to restricted administrative settings, export student data for non-school purposes, or disrupt the operation of connected Google Sheets and cloud services.
              </p>
            </section>

            <section className="space-y-3">
              <h2 className="text-lg sm:text-xl font-bold text-white">5. Contact Information</h2>
              <p>
                For questions regarding these Terms of Service or portal administration, please contact the school administration:
              </p>
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-3">
                <Mail className="w-5 h-5 text-emerald-400 shrink-0" />
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
