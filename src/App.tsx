/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Zap, Activity, Music, Mic, MicOff } from 'lucide-react';

// Constants
const MAX_TAPS = 8;
const RESET_TIMEOUT = 3000;
const DEBOUNCE_TIME = 100;

// Genre mapping based on BPM
const getGenre = (bpm: number) => {
  if (bpm < 60) return "Ambient / Doom";
  if (bpm < 80) return "Hip Hop / Trip Hop";
  if (bpm < 100) return "Boom Bap / R&B";
  if (bpm < 115) return "Funk / Disco";
  if (bpm < 130) return "House / Techno";
  if (bpm < 145) return "Trance / Dubstep";
  if (bpm < 165) return "Drum & Bass / Jungle";
  return "Hardcore / Speedcore";
};

// Refined Color Mapping for smoother transitions
const COLOR_STOPS = [
  { bpm: 40, color: [40, 40, 80] },    // Deep Indigo
  { bpm: 70, color: [30, 100, 200] },  // Cool Blue
  { bpm: 100, color: [20, 180, 120] }, // Teal/Green
  { bpm: 130, color: [240, 180, 20] }, // Amber/Orange
  { bpm: 160, color: [220, 40, 40] },  // Deep Red
  { bpm: 200, color: [200, 40, 180] }  // Magenta/Pink
];

const getBpmColor = (bpm: number) => {
  if (bpm === 0) return "rgb(15, 15, 15)";
  
  let lower = COLOR_STOPS[0];
  let upper = COLOR_STOPS[COLOR_STOPS.length - 1];
  
  if (bpm <= lower.bpm) return `rgb(${lower.color.join(',')})`;
  if (bpm >= upper.bpm) return `rgb(${upper.color.join(',')})`;

  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    if (bpm >= COLOR_STOPS[i].bpm && bpm <= COLOR_STOPS[i+1].bpm) {
      lower = COLOR_STOPS[i];
      upper = COLOR_STOPS[i+1];
      break;
    }
  }
  
  const ratio = (bpm - lower.bpm) / (upper.bpm - lower.bpm);
  const r = Math.round(lower.color[0] + (upper.color[0] - lower.color[0]) * ratio);
  const g = Math.round(lower.color[1] + (upper.color[1] - lower.color[1]) * ratio);
  const b = Math.round(lower.color[2] + (upper.color[2] - lower.color[2]) * ratio);
  
  return `rgb(${r}, ${g}, ${b})`;
};

const getStabilityLabel = (stability: number) => {
  if (stability > 95) return "Perfect";
  if (stability > 90) return "Stable";
  if (stability > 80) return "Steady";
  if (stability > 60) return "Variable";
  return "Erratic";
};

export default function App() {
  const [taps, setTaps] = useState<number[]>([]);
  const [bpm, setBpm] = useState<number>(0);
  const [stability, setStability] = useState<number>(100);
  const [intervals, setIntervals] = useState<number[]>([]);
  const [isPulsing, setIsPulsing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const lastPeakTime = useRef<number>(0);
  const energyHistory = useRef<number[]>([]);
  const lastTapTime = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const reset = useCallback(() => {
    setTaps([]);
    setBpm(0);
    setStability(100);
    setIntervals([]);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const handleTap = useCallback(() => {
    const now = performance.now();
    
    // Debounce accidental double taps
    if (now - lastTapTime.current < DEBOUNCE_TIME) return;

    // Haptic feedback
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(10);
    }

    setIsPulsing(true);
    setTimeout(() => setIsPulsing(false), 50);

    // Reset timeout
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(reset, RESET_TIMEOUT);

    setTaps(prev => {
      const newTaps = [...prev, now].slice(-MAX_TAPS - 1);
      
      if (newTaps.length >= 2) {
        const newIntervals: number[] = [];
        for (let i = 1; i < newTaps.length; i++) {
          newIntervals.push(newTaps[i] - newTaps[i - 1]);
        }
        setIntervals(newIntervals);

        const avgInterval = newIntervals.reduce((a, b) => a + b, 0) / newIntervals.length;
        const calculatedBpm = 60000 / avgInterval;
        setBpm(calculatedBpm);

        // Stability calculation (coefficient of variation)
        if (newIntervals.length > 1) {
          const mean = avgInterval;
          const variance = newIntervals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / newIntervals.length;
          const stdDev = Math.sqrt(variance);
          const cv = (stdDev / mean) * 100;
          setStability(Math.max(0, 100 - cv * 5)); // Scaled for display
        }
      }
      
      return newTaps;
    });

    lastTapTime.current = now;
  }, [reset]);

  // Microphone Logic
  const toggleListening = useCallback(async () => {
    if (isListening) {
      setIsListening(false);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass();
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      analyserRef.current = analyser;

      setIsListening(true);
      setMicError(null);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const analyze = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Focus on low frequencies (bass/kick) for beat detection
        // Typically 20Hz to 150Hz
        const lowFreqRange = Math.floor((150 / (audioContext.sampleRate / 2)) * bufferLength);
        let energy = 0;
        for (let i = 0; i < lowFreqRange; i++) {
          energy += dataArray[i];
        }
        energy /= lowFreqRange;

        // Keep a short history to calculate moving average
        energyHistory.current.push(energy);
        if (energyHistory.current.length > 20) {
          energyHistory.current.shift();
        }

        const avgEnergy = energyHistory.current.reduce((a, b) => a + b, 0) / energyHistory.current.length;
        const now = performance.now();

        // Threshold detection: energy must be significantly higher than average
        // and we need a minimum time between peaks (e.g., 250ms for max 240 BPM)
        if (energy > avgEnergy * 1.5 && energy > 30 && now - lastPeakTime.current > 250) {
          handleTap();
          lastPeakTime.current = now;
        }

        animationFrameRef.current = requestAnimationFrame(analyze);
      };

      analyze();
    } catch (err) {
      console.error("Microphone access error:", err);
      setMicError("Microphone access denied or not available.");
      setIsListening(false);
    }
  }, [isListening, handleTap]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        handleTap();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTap]);

  const bgColor = getBpmColor(bpm);

  return (
    <div 
      className="min-h-screen flex flex-col items-center justify-center transition-colors duration-700 overflow-hidden font-mono"
      style={{ backgroundColor: bgColor, color: '#fff' }}
    >
      {/* Header / Meta */}
      <div className="absolute top-8 left-8 flex flex-col gap-1 opacity-40">
        <div className="text-[10px] uppercase tracking-[0.2em] font-bold">TempoTap v1.1</div>
        <div className="text-[10px] uppercase tracking-[0.2em]">High Precision Engine + AI Listen</div>
      </div>

      {/* Mic Toggle */}
      <div className="absolute top-8 right-8 z-30 flex flex-col items-end gap-2">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={(e) => {
            e.stopPropagation();
            toggleListening();
          }}
          className={`p-4 rounded-full backdrop-blur-md border transition-all duration-500 ${
            isListening 
              ? 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_20px_rgba(239,68,68,0.3)]' 
              : 'bg-white/10 border-white/20 text-white/60 hover:text-white'
          }`}
          title={isListening ? "Stop Listening" : "Start Listening"}
        >
          {isListening ? <Mic className="w-6 h-6 animate-pulse" /> : <MicOff className="w-6 h-6" />}
        </motion.button>
        {isListening && (
          <motion.div 
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] uppercase tracking-widest font-bold text-red-400 flex items-center gap-2"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            Analyzing Audio...
          </motion.div>
        )}
        {micError && (
          <div className="text-[10px] uppercase tracking-widest font-bold text-red-500 bg-red-500/10 px-3 py-1 rounded-md border border-red-500/20">
            {micError}
          </div>
        )}
      </div>

      {/* Main Display */}
      <div className="flex flex-col items-center justify-center z-10 pointer-events-none select-none">
        <AnimatePresence mode="wait">
          {bpm === 0 ? (
            <motion.div
              key="start"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              <Zap className="w-12 h-12 text-yellow-400 animate-pulse" />
              <div className="text-2xl font-light tracking-widest uppercase opacity-60">Tap to Start</div>
              <div className="text-[10px] uppercase tracking-widest opacity-40 mt-2">Spacebar or Click</div>
            </motion.div>
          ) : (
            <motion.div
              key="bpm"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-9xl font-bold tracking-tighter tabular-nums leading-none">
                  {bpm.toFixed(1)}
                </span>
                <span className="text-2xl font-light opacity-40 uppercase tracking-widest">BPM</span>
              </div>
              
              <div className="mt-8 flex flex-col items-center gap-6">
                {/* Genre Suggestion */}
                <div className="flex items-center gap-2 px-4 py-2 bg-white/10 rounded-full backdrop-blur-sm border border-white/10">
                  <Music className="w-4 h-4 opacity-60" />
                  <span className="text-sm font-medium tracking-wide uppercase">
                    ~ {getGenre(bpm)}
                  </span>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-8 mt-4">
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[10px] uppercase tracking-widest opacity-40">Taps</div>
                    <div className="text-xl font-bold">{Math.max(0, taps.length - 1)}</div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <div className="text-[10px] uppercase tracking-widest opacity-40">Stability</div>
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-2">
                        <Activity className={`w-4 h-4 ${stability > 90 ? 'text-green-400' : stability > 70 ? 'text-yellow-400' : 'text-red-400'}`} />
                        <div className="text-xl font-bold">{stability.toFixed(0)}%</div>
                      </div>
                      <div className={`text-[10px] uppercase font-bold tracking-wider mt-0.5 ${stability > 90 ? 'text-green-400' : stability > 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {getStabilityLabel(stability)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Accuracy Heatmap */}
                {intervals.length > 0 && (
                  <div className="flex flex-col items-center gap-2 mt-2">
                    <div className="text-[8px] uppercase tracking-[0.2em] opacity-30">Accuracy Heatmap</div>
                    <div className="flex gap-1 h-1 w-32">
                      {intervals.map((interval, i) => {
                        const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                        const diff = Math.abs(interval - avg);
                        const accuracy = Math.max(0, 100 - (diff / avg) * 200);
                        const opacity = 0.1 + (accuracy / 100) * 0.9;
                        return (
                          <motion.div
                            key={i}
                            initial={{ scaleY: 0 }}
                            animate={{ scaleY: 1 }}
                            className="flex-1 rounded-full bg-white"
                            style={{ opacity }}
                          />
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* BPM Spectrum Heatmap (Color Shift Reference) */}
      <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-64 flex flex-col gap-2 items-center opacity-40 group hover:opacity-100 transition-opacity duration-500">
        <div className="flex justify-between w-full text-[8px] uppercase tracking-widest font-bold">
          <span>40</span>
          <span>BPM Spectrum</span>
          <span>200</span>
        </div>
        <div className="h-1 w-full rounded-full relative overflow-hidden bg-white/10">
          <div className="absolute inset-0 flex">
            {COLOR_STOPS.map((stop, i) => {
              if (i === COLOR_STOPS.length - 1) return null;
              const next = COLOR_STOPS[i + 1];
              return (
                <div 
                  key={i} 
                  className="flex-1" 
                  style={{ 
                    background: `linear-gradient(to right, rgb(${stop.color.join(',')}), rgb(${next.color.join(',')}))` 
                  }} 
                />
              );
            })}
          </div>
          {/* Current BPM Marker */}
          {bpm > 0 && (
            <motion.div 
              className="absolute top-0 bottom-0 w-1 bg-white shadow-[0_0_8px_rgba(255,255,255,0.8)] z-10"
              animate={{ 
                left: `${Math.min(Math.max((bpm - 40) / (200 - 40) * 100, 0), 100)}%`,
                scaleY: stability / 100 + 0.5
              }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
            />
          )}
        </div>
      </div>

      {/* Large Tap Area */}
      <button
        onClick={handleTap}
        onMouseDown={(e) => e.preventDefault()} // Prevent focus ring on click
        className="absolute inset-0 w-full h-full cursor-pointer appearance-none bg-transparent border-none outline-none z-0 active:bg-white/5 transition-colors"
        aria-label="Tap Tempo"
      >
        {/* Visual Pulse Overlay */}
        <AnimatePresence>
          {isPulsing && (
            <motion.div
              initial={{ opacity: 0.4, scale: 0.8 }}
              animate={{ opacity: 0, scale: 1.5 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="absolute inset-0 bg-white pointer-events-none"
            />
          )}
        </AnimatePresence>
      </button>

      {/* Reset Button */}
      {bpm > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={(e) => {
            e.stopPropagation();
            reset();
          }}
          className="absolute bottom-12 px-6 py-3 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 flex items-center gap-2 transition-all active:scale-95 z-20 group"
        >
          <RefreshCw className="w-4 h-4 opacity-60 group-hover:rotate-180 transition-transform duration-500" />
          <span className="text-xs uppercase tracking-widest font-bold">Reset Engine</span>
        </motion.button>
      )}

      {/* Decorative Grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-[-1]">
        <div className="w-full h-full" style={{ 
          backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', 
          backgroundSize: '40px 40px' 
        }} />
      </div>
    </div>
  );
}
