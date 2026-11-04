// eslint-disable-next-line no-unused-vars
import React from 'react';
import { auth, GoogleAuthProvider, signInWithPopup } from './firebase';
import { Radio, ShieldCheck } from 'lucide-react';

export default function Login() {
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error('Authentication Error:', err);
    }
  };

  return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-100 font-mono">
      <div className="max-w-md w-full p-8 bg-slate-900 border border-emerald-500/30 rounded-2xl shadow-2xl shadow-emerald-950/50 flex flex-col items-center text-center">
        <div className="p-3 bg-emerald-600/20 border border-emerald-500/40 rounded-2xl mb-4 text-emerald-400">
          <Radio className="w-10 h-10 animate-pulse" />
        </div>
        <h1 className="text-2xl font-black tracking-wider text-slate-100 mb-2">RADAR AI</h1>
        <p className="text-xs text-emerald-400 mb-8 uppercase tracking-widest">Tactical Telemetry & Multimodal Unit</p>
        <button
          onClick={handleGoogleLogin}
          className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl transition-all shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 text-xs uppercase tracking-wider"
        >
          <ShieldCheck className="w-4 h-4" /> Authenticate Signal Access
        </button>
      </div>
    </div>
  );
}