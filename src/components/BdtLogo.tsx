'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';

/**
 * Renders the BDT Tour mark.
 *
 * - If `/bdt-logo.png` exists in `public/`, it renders the real PNG.
 * - Otherwise it falls back to an inline SVG approximation (navy shield,
 *   cream border, red wordmark, white golfer silhouette) so the app is
 *   fully branded out of the box.
 *
 * Drop the official logo at `public/bdt-logo.png` to take over.
 */
export function BdtLogo({
  className,
  variant = 'shield',
}: {
  className?: string;
  variant?: 'shield' | 'mark';
}) {
  const [pngOk, setPngOk] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const img = new Image();
    img.onload = () => mounted && setPngOk(true);
    img.onerror = () => mounted && setPngOk(false);
    img.src = '/bdt-logo.png';
    return () => {
      mounted = false;
    };
  }, []);

  if (pngOk) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src="/bdt-logo.png"
        alt="BDT Tour"
        className={clsx('object-contain', className)}
      />
    );
  }

  if (variant === 'mark') {
    // Compact wordmark for places too small for the shield
    return (
      <svg
        viewBox="0 0 200 60"
        role="img"
        aria-label="BDT Tour"
        className={className}
      >
        <text
          x="0"
          y="44"
          fill="#F5EFE0"
          fontFamily="Bebas Neue, Impact, sans-serif"
          fontSize="48"
          letterSpacing="2"
        >
          BDT
        </text>
        <text
          x="98"
          y="44"
          fill="#D41F2F"
          fontFamily="Bebas Neue, Impact, sans-serif"
          fontSize="48"
          letterSpacing="2"
        >
          TOUR
        </text>
      </svg>
    );
  }

  // Shield SVG fallback — navy field, cream border, red stacked TOUR, white golfer.
  return (
    <svg
      viewBox="0 0 220 300"
      role="img"
      aria-label="BDT Tour"
      className={className}
    >
      {/* Outer border */}
      <rect
        x="6"
        y="6"
        width="208"
        height="288"
        rx="22"
        ry="22"
        fill="#13294B"
        stroke="#0B1E40"
        strokeWidth="6"
      />
      {/* Inner cream rule */}
      <rect
        x="16"
        y="16"
        width="188"
        height="268"
        rx="16"
        ry="16"
        fill="none"
        stroke="#F5EFE0"
        strokeWidth="3"
      />
      {/* BD wordmark */}
      <text
        x="32"
        y="74"
        fill="#F5EFE0"
        fontFamily="Bebas Neue, Impact, sans-serif"
        fontSize="46"
        fontWeight="700"
        letterSpacing="1"
      >
        BD
      </text>
      {/* Stacked TOUR (each letter outlined cream, fill red) */}
      {['T', 'O', 'U', 'R'].map((ch, i) => (
        <text
          key={ch}
          x="40"
          y={120 + i * 44}
          fill="#D41F2F"
          stroke="#F5EFE0"
          strokeWidth="1.4"
          fontFamily="Bebas Neue, Impact, sans-serif"
          fontSize="46"
          fontWeight="700"
          letterSpacing="2"
        >
          {ch}
        </text>
      ))}
      {/* Golfer silhouette (stylized; cream-on-navy) */}
      <g fill="#F5EFE0" transform="translate(110 60)">
        <path d="M55 12c0 6-4 10-9 10s-9-4-9-10 4-10 9-10 9 4 9 10z" />
        <path
          d="M50 22 L55 36 L70 26 L92 36 L100 30 L82 18 L70 10 L60 8 L52 10 Z"
          opacity="0.95"
        />
        <path
          d="M44 36 L52 60 L46 86 L40 110 L34 152 L48 158 L60 110 L72 158 L86 152 L78 110 L70 64 L78 40 Z"
          opacity="0.95"
        />
        <path
          d="M86 152 L98 188 L72 222 L60 226 L60 222 L84 192 L74 158 Z"
          opacity="0.95"
        />
        <path
          d="M48 158 L40 196 L26 224 L34 230 L52 200 L58 184 Z"
          opacity="0.95"
        />
      </g>
      {/* Registered mark */}
      <text x="200" y="294" fill="#F5EFE0" fontSize="9" opacity="0.7">
        ®
      </text>
    </svg>
  );
}
