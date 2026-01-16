
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
  isActive: boolean;
  analyzer?: AnalyserNode;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isActive, analyzer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!isActive || !analyzer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);
      analyzer.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = 60;

      // Draw outer pulse based on audio levels
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;
      const pulseScale = 1 + (average / 255) * 0.8;

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius * pulseScale, 0, 2 * Math.PI);
      ctx.fillStyle = `rgba(59, 130, 246, ${0.1 + (average / 255) * 0.3})`;
      ctx.fill();

      // Draw audio bars in a circle
      const barCount = 64;
      const angleStep = (Math.PI * 2) / barCount;
      
      for (let i = 0; i < barCount; i++) {
        const barHeight = (dataArray[i * Math.floor(bufferLength / barCount)] / 255) * 40;
        const angle = i * angleStep;
        
        const x1 = centerX + Math.cos(angle) * radius;
        const y1 = centerY + Math.sin(angle) * radius;
        const x2 = centerX + Math.cos(angle) * (radius + barHeight);
        const y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, [isActive, analyzer]);

  return (
    <div className="relative flex items-center justify-center w-full h-64">
      {isActive && <div className="pulse-ring"></div>}
      <canvas
        ref={canvasRef}
        width={300}
        height={300}
        className="z-10"
      />
    </div>
  );
};
