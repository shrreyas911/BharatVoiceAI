
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { CallStatus, Language, TranscriptionEntry } from './types';
import { SUPPORTED_LANGUAGES, AUDIO_SAMPLE_RATE_INPUT, AUDIO_SAMPLE_RATE_OUTPUT, GEMINI_MODEL } from './constants';
import { LanguageSelector } from './components/LanguageSelector';
import { AudioVisualizer } from './components/AudioVisualizer';
import { TranscriptionPanel } from './components/TranscriptionPanel';
import { decode, decodeAudioData, createPcmBlob } from './services/audioUtils';

const App: React.FC = () => {
  const [status, setStatus] = useState<CallStatus>(CallStatus.IDLE);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>(SUPPORTED_LANGUAGES[0]);
  const [history, setHistory] = useState<TranscriptionEntry[]>([]);
  const [currentInputText, setCurrentInputText] = useState('');
  const [currentOutputText, setCurrentOutputText] = useState('');

  // Audio Refs
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef(0);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);

  // Gemini Session Ref
  const sessionRef = useRef<any>(null);

  const stopAudio = useCallback(() => {
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
    if (micStreamRef.current) micStreamRef.current.getTracks().forEach(track => track.stop());
    if (inputAudioContextRef.current) inputAudioContextRef.current.close();
    if (outputAudioContextRef.current) outputAudioContextRef.current.close();
    
    audioSourcesRef.current.forEach(source => {
      try { source.stop(); } catch (e) {}
    });
    audioSourcesRef.current.clear();

    inputAudioContextRef.current = null;
    outputAudioContextRef.current = null;
    micStreamRef.current = null;
    scriptProcessorRef.current = null;
    analyzerRef.current = null;
    nextStartTimeRef.current = 0;
  }, []);

  const handleHangup = useCallback(async () => {
    setStatus(CallStatus.DISCONNECTING);
    if (sessionRef.current) {
      try {
        await sessionRef.current.close();
      } catch (e) {
        console.error('Error closing session:', e);
      }
      sessionRef.current = null;
    }
    stopAudio();
    setStatus(CallStatus.IDLE);
    // Keep history for the session, but could clear it if desired
  }, [stopAudio]);

  const handleStartCall = useCallback(async () => {
    if (status !== CallStatus.IDLE) return;

    try {
      setStatus(CallStatus.CONNECTING);
      setHistory([]);
      setCurrentInputText('');
      setCurrentOutputText('');

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      // Setup contexts
      inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE_INPUT });
      outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: AUDIO_SAMPLE_RATE_OUTPUT });
      
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: GEMINI_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } },
          },
          systemInstruction: `You are a helpful and polite AI assistant called BharatAI. You are currently on a voice call. 
          Respond in ${selectedLanguage.name} (Native: ${selectedLanguage.nativeName}). 
          Keep your responses brief and conversational, suitable for a phone call. 
          If you are asked about your capabilities, explain that you support 22 Indian languages and English.`,
          outputAudioTranscription: {},
          inputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            console.log('Gemini Live session opened');
            setStatus(CallStatus.ACTIVE);

            // Setup mic streaming
            const source = inputAudioContextRef.current!.createMediaStreamSource(micStreamRef.current!);
            const analyzer = inputAudioContextRef.current!.createAnalyser();
            analyzer.fftSize = 256;
            analyzerRef.current = analyzer;
            source.connect(analyzer);

            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              
              sessionPromise.then((session) => {
                if (session) {
                  session.sendRealtimeInput({ media: pcmBlob });
                }
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            // Handle Transcription
            if (message.serverContent?.outputTranscription) {
              setCurrentOutputText(prev => prev + message.serverContent!.outputTranscription!.text);
            } else if (message.serverContent?.inputTranscription) {
              setCurrentInputText(prev => prev + message.serverContent!.inputTranscription!.text);
            }

            if (message.serverContent?.turnComplete) {
              setHistory(prev => [
                ...prev,
                { role: 'user', text: currentInputText, timestamp: Date.now() },
                { role: 'model', text: currentOutputText, timestamp: Date.now() }
              ]);
              setCurrentInputText('');
              setCurrentOutputText('');
            }

            // Handle Audio Output
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              
              const audioBuffer = await decodeAudioData(
                decode(base64Audio),
                ctx,
                AUDIO_SAMPLE_RATE_OUTPUT,
                1
              );

              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              
              source.addEventListener('ended', () => {
                audioSourcesRef.current.delete(source);
              });

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }

            // Handle Interruption
            if (message.serverContent?.interrupted) {
              audioSourcesRef.current.forEach(s => {
                try { s.stop(); } catch (e) {}
              });
              audioSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              // Clear current response if interrupted
              setCurrentOutputText('');
            }
          },
          onerror: (e) => {
            console.error('Gemini Live error:', e);
            handleHangup();
          },
          onclose: () => {
            console.log('Gemini Live session closed');
            handleHangup();
          }
        }
      });

      sessionRef.current = await sessionPromise;

    } catch (error) {
      console.error('Failed to start call:', error);
      setStatus(CallStatus.IDLE);
      stopAudio();
    }
  }, [status, selectedLanguage, currentInputText, currentOutputText, handleHangup, stopAudio]);

  return (
    <div className="min-h-screen phone-gradient flex flex-col items-center justify-center p-4">
      {/* Phone Frame Container */}
      <div className="w-full max-w-4xl bg-slate-900 shadow-2xl rounded-[3rem] border-8 border-slate-800 overflow-hidden flex flex-col md:flex-row h-[90vh]">
        
        {/* Left Side: Call Interface */}
        <div className="flex-1 flex flex-col p-8 relative border-b md:border-b-0 md:border-r border-slate-800">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">BharatAI</h1>
              <p className="text-slate-400">Multilingual Calling Agent</p>
            </div>
            <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${
              status === CallStatus.ACTIVE ? 'bg-green-500/20 text-green-400' : 
              status === CallStatus.CONNECTING ? 'bg-yellow-500/20 text-yellow-400 animate-pulse' :
              'bg-slate-800 text-slate-500'
            }`}>
              {status}
            </div>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center space-y-8">
            <AudioVisualizer 
              isActive={status === CallStatus.ACTIVE} 
              analyzer={analyzerRef.current || undefined} 
            />
            
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-white mb-1">
                {status === CallStatus.ACTIVE ? 'Call in progress...' : status === CallStatus.CONNECTING ? 'Connecting...' : 'Ready to call'}
              </h2>
              <p className="text-slate-400">
                {selectedLanguage.name} • {selectedLanguage.nativeName}
              </p>
            </div>
          </div>

          <div className="mt-auto flex justify-center space-x-6 pb-4">
            {status === CallStatus.IDLE ? (
              <button
                onClick={handleStartCall}
                className="group relative flex flex-col items-center"
              >
                <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30 transition-transform active:scale-95 hover:scale-105">
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                  </svg>
                </div>
                <span className="mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Start Call</span>
              </button>
            ) : (
              <button
                onClick={handleHangup}
                disabled={status === CallStatus.DISCONNECTING}
                className="group relative flex flex-col items-center"
              >
                <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center shadow-lg shadow-red-500/30 transition-transform active:scale-95 hover:scale-105">
                  <svg className="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08c-.18-.17-.29-.42-.29-.7 0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
                  </svg>
                </div>
                <span className="mt-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Hang Up</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Side: Configuration & Logs */}
        <div className="flex-1 flex flex-col p-8 bg-slate-900/80 backdrop-blur-md overflow-hidden">
          <div className="flex-1 flex flex-col space-y-8 overflow-hidden">
            <LanguageSelector 
              selectedLanguage={selectedLanguage} 
              onLanguageChange={setSelectedLanguage}
              disabled={status !== CallStatus.IDLE}
            />
            
            <div className="flex-1 min-h-0">
              <TranscriptionPanel 
                history={history} 
                currentInput={currentInputText} 
                currentOutput={currentOutputText} 
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 text-slate-500 text-sm font-medium">
        Powered by Google Gemini 2.5 Live API
      </div>
    </div>
  );
};

export default App;
