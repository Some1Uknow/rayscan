"use client";

import { useState } from "react";

type TokenAvatarProps = {
  src: string;
  alt: string;
  fallbackLabel: string;
};

export function TokenAvatar({ src, alt, fallbackLabel }: TokenAvatarProps) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return <div className="token-avatar-fallback">{fallbackLabel}</div>;
  }

  return <img alt={alt} className="token-avatar" onError={() => setError(true)} src={src} />;
}
