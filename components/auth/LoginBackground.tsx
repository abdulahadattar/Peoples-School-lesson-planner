import React from 'react';

export const LoginBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Deep Indigo Mesh Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950" />

      {/* Static radial glows (compositor-friendly, zero ongoing main-thread work) */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(600px circle at 12% 10%, rgba(37, 99, 235, 0.22), transparent 70%), radial-gradient(550px circle at 92% 58%, rgba(16, 185, 129, 0.16), transparent 70%), radial-gradient(500px circle at 45% 95%, rgba(79, 70, 229, 0.2), transparent 70%)',
        }}
      />

      {/* Fine Geometric Grid Matrix */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, #ffffff 1px, transparent 0)',
          backgroundSize: '36px 36px',
        }}
      />
    </div>
  );
};
