import React from 'react';

export const LoginBackground: React.FC = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Deep Indigo Mesh Gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950" />

      {/* Compositor-only floating ambient radial glows */}
      <div
        className="absolute -inset-12 animate-orb-float-a"
        style={{
          backgroundImage:
            'radial-gradient(620px circle at 16% 16%, rgba(37, 99, 235, 0.24), transparent 68%), radial-gradient(520px circle at 48% 92%, rgba(79, 70, 229, 0.22), transparent 68%)',
        }}
      />
      <div
        className="absolute -inset-12 animate-orb-float-b"
        style={{
          backgroundImage:
            'radial-gradient(560px circle at 88% 58%, rgba(16, 185, 129, 0.17), transparent 68%)',
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
