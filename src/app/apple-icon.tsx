import { ImageResponse } from 'next/og';

// Apple touch icon: served at /apple-icon.png. iOS uses this when users
// add the site to their Home Screen.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';
export const runtime = 'edge';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0B1E40',
          fontFamily: 'Impact, Arial, sans-serif',
          fontWeight: 700,
          flexDirection: 'column',
          lineHeight: 1,
        }}
      >
        <div
          style={{
            width: 152,
            height: 152,
            background: '#13294B',
            borderRadius: 26,
            border: '4px solid #0B1E40',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              border: '2px solid #F5EFE0',
              borderRadius: 18,
              width: 132,
              height: 132,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
            }}
          >
            <span style={{ color: '#F5EFE0', fontSize: 44, letterSpacing: 2 }}>BDT</span>
            <span style={{ color: '#D41F2F', fontSize: 32, letterSpacing: 6, marginTop: 8 }}>
              TOUR
            </span>
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
