"use client";

import { useEffect, useState } from "react";

type TokenAvatarProps = {
  sources: string[];
  alt: string;
  fallbackLabel: string;
};

export function TokenAvatar({ sources, alt, fallbackLabel }: TokenAvatarProps) {
  const candidates = sources.filter((value, index, all) => value.trim().length > 0 && all.indexOf(value) === index);
  const [error, setError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  useEffect(() => {
    setCurrentIndex(0);
    setError(false);
  }, [sources]);

  const currentSrc = candidates[currentIndex] ?? null;

  if (error || !currentSrc) {
    return <div className="token-avatar-fallback">{fallbackLabel}</div>;
  }

  return (
    <img
      alt={alt}
      className="token-avatar"
      onError={() => {
        if (currentIndex < candidates.length - 1) {
          setCurrentIndex((value) => value + 1);
          return;
        }
        setError(true);
      }}
      src={currentSrc}
    />
  );
}
