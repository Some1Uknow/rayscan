"use client";

import { useEffect, useState } from "react";

type TokenAvatarProps = {
  src: string | null;
  alt: string;
  fallbackLabel: string;
  fallbackSrc?: string | null;
};

export function TokenAvatar({ src, alt, fallbackLabel, fallbackSrc = null }: TokenAvatarProps) {
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState(src);

  useEffect(() => {
    setCurrentSrc(src);
    setError(false);
  }, [src]);

  if (error || !currentSrc) {
    return <div className="token-avatar-fallback">{fallbackLabel}</div>;
  }

  return (
    <img
      alt={alt}
      className="token-avatar"
      onError={() => {
        if (fallbackSrc && currentSrc !== fallbackSrc) {
          setCurrentSrc(fallbackSrc);
          return;
        }
        setError(true);
      }}
      src={currentSrc}
    />
  );
}
