
"use client";

import { useState, useEffect, useRef } from 'react';

const easeOutExpo = (t) => {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
};

export const useCountUp = (end, duration = 2000) => {
  const [count, setCount] = useState(0);
  const start = 0;
  const frameRate = 1000 / 60;
  const totalFrames = Math.round(duration / frameRate);
  const animationFrame = useRef<number | null>(null);

  useEffect(() => {
    let frame = 0;
    const counter = () => {
      frame++;
      const progress = easeOutExpo(frame / totalFrames);
      const currentCount = Math.round(start + (end - start) * progress);
      
      if (frame === totalFrames) {
        setCount(end);
        if (animationFrame.current) {
           cancelAnimationFrame(animationFrame.current);
        }
        return;
      }
      
      setCount(currentCount);

      animationFrame.current = requestAnimationFrame(counter);
    };

    animationFrame.current = requestAnimationFrame(counter);

    return () => {
      if (animationFrame.current) {
        cancelAnimationFrame(animationFrame.current);
      }
    };
  }, [end, duration]);

  return count;
};
