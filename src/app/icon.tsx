import { ImageResponse } from 'next/og';

// Next.js generates a 32x32 PNG favicon at /icon.png from this component.
// The plain SVG fallback at /favicon.svg covers modern browsers; this gives
// us a high-quality raster for older clients (older Outlook, RSS readers,
// etc.) and for places that ignore SVG icons.
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';
export const runtime = 'edge';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#13294B',
          color: '#F5EFE0',
          fontFamily: 'Impact, Arial, sans-serif',
          fontWeight: 700,
          fontSize: 14,
          letterSpacing: 1,
          borderRadius: 6,
          border: '1px solid #0B1E40',
          flexDirection: 'column',
          lineHeight: 1,
        }}
      >
        <span>BDT</span>
        <span style={{ color: '#D41F2F', fontSize: 9, marginTop: 2 }}>TOUR</span>
      </div>
    ),
    { ...size },
  );
}
