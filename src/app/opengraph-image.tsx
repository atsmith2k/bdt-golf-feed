import { ImageResponse } from 'next/og';

// 1200x630 OpenGraph image. Served at /opengraph-image.png. This is the
// preview that shows up in iMessage / Slack / Discord / Facebook /
// LinkedIn when someone shares the URL.
export const alt = 'BDT Golf Network — live broadcast-style scoreboard for the BDT Tour';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const runtime = 'edge';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(ellipse at top, #1A3668 0%, #0B1E40 55%, #07142A 100%)',
          fontFamily: 'Impact, Arial, sans-serif',
          fontWeight: 700,
          color: '#F5EFE0',
          padding: 64,
          position: 'relative',
        }}
      >
        {/* Red lower-third stripe */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: 14,
            background: 'linear-gradient(90deg, #D41F2F 0%, #A8121F 100%)',
          }}
        />

        {/* Logo shield */}
        <div
          style={{
            width: 280,
            height: 360,
            background: '#13294B',
            border: '6px solid #0B1E40',
            borderRadius: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 60,
          }}
        >
          <div
            style={{
              border: '3px solid #F5EFE0',
              borderRadius: 24,
              width: 244,
              height: 324,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'column',
              lineHeight: 1,
            }}
          >
            <span style={{ fontSize: 96, letterSpacing: 4, color: '#F5EFE0' }}>BDT</span>
            <span
              style={{
                fontSize: 80,
                letterSpacing: 14,
                color: '#D41F2F',
                marginTop: 12,
              }}
            >
              TOUR
            </span>
          </div>
        </div>

        {/* Wordmark + tagline */}
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 720 }}>
          <span
            style={{
              fontSize: 36,
              letterSpacing: 8,
              color: '#D41F2F',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            On Air
          </span>
          <span
            style={{
              fontSize: 96,
              letterSpacing: 6,
              color: '#F5EFE0',
              lineHeight: 1,
              textTransform: 'uppercase',
            }}
          >
            BDT Golf
          </span>
          <span
            style={{
              fontSize: 96,
              letterSpacing: 6,
              color: '#D41F2F',
              lineHeight: 1,
              textTransform: 'uppercase',
              marginTop: 4,
            }}
          >
            Network
          </span>
          <span
            style={{
              fontSize: 24,
              color: '#8FA3C7',
              marginTop: 28,
              fontFamily: 'Arial, sans-serif',
              fontWeight: 400,
              letterSpacing: 2,
            }}
          >
            Live broadcast-style scoreboard · powered by GHIN
          </span>
        </div>

        {/* Red bottom stripe */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            bottom: 0,
            width: '100%',
            height: 14,
            background: 'linear-gradient(90deg, #A8121F 0%, #D41F2F 100%)',
          }}
        />
      </div>
    ),
    { ...size },
  );
}
