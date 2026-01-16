
import React from 'react';
import { SUPPORTED_LANGUAGES } from '../constants';
import { Language } from '../types';

interface LanguageSelectorProps {
  selectedLanguage: Language;
  onLanguageChange: (lang: Language) => void;
  disabled?: boolean;
}

export const LanguageSelector: React.FC<LanguageSelectorProps> = ({
  selectedLanguage,
  onLanguageChange,
  disabled
}) => {
  return (
    <div className="flex flex-col space-y-2">
      <label className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
        AI Assistant Language
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            disabled={disabled}
            onClick={() => onLanguageChange(lang)}
            className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
              selectedLanguage.code === lang.code
                ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:border-slate-500'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          >
            <span className="text-sm font-medium">{lang.name}</span>
            <span className="text-xs opacity-70">{lang.nativeName}</span>
          </button>
        ))}
      </div>
    </div>
  );
};
