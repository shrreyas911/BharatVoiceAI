
import React, { useEffect, useRef } from 'react';
import { TranscriptionEntry } from '../types';

interface TranscriptionPanelProps {
  history: TranscriptionEntry[];
  currentInput: string;
  currentOutput: string;
}

export const TranscriptionPanel: React.FC<TranscriptionPanelProps> = ({
  history,
  currentInput,
  currentOutput
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, currentInput, currentOutput]);

  return (
    <div className="flex flex-col h-full bg-slate-900/50 rounded-2xl overflow-hidden border border-slate-800">
      <div className="p-4 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
        <h3 className="text-slate-300 font-semibold flex items-center gap-2">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
          Live Transcription
        </h3>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex-1 p-4 space-y-4 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-700"
      >
        {history.map((entry, i) => (
          <div 
            key={i} 
            className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}
          >
            <span className="text-[10px] text-slate-500 mb-1 uppercase tracking-tighter">
              {entry.role === 'user' ? 'You' : 'AI Assistant'}
            </span>
            <div className={`max-w-[85%] p-3 rounded-2xl text-sm ${
              entry.role === 'user' 
                ? 'bg-blue-600 text-white rounded-tr-none' 
                : 'bg-slate-800 text-slate-200 rounded-tl-none'
            }`}>
              {entry.text}
            </div>
          </div>
        ))}

        {currentInput && (
          <div className="flex flex-col items-end opacity-70">
            <span className="text-[10px] text-slate-500 mb-1 uppercase tracking-tighter">You (speaking...)</span>
            <div className="max-w-[85%] p-3 rounded-2xl text-sm bg-blue-700 text-white rounded-tr-none italic">
              {currentInput}
            </div>
          </div>
        )}

        {currentOutput && (
          <div className="flex flex-col items-start opacity-70">
            <span className="text-[10px] text-slate-500 mb-1 uppercase tracking-tighter">AI Assistant (responding...)</span>
            <div className="max-w-[85%] p-3 rounded-2xl text-sm bg-slate-700 text-slate-200 rounded-tl-none italic">
              {currentOutput}
            </div>
          </div>
        )}

        {history.length === 0 && !currentInput && !currentOutput && (
          <div className="h-full flex items-center justify-center text-slate-600 italic text-sm text-center">
            Transcription will appear here during the call...
          </div>
        )}
      </div>
    </div>
  );
};
