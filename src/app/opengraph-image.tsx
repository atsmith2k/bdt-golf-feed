import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';

// 1200x630 OpenGraph image. Served at /opengraph-image.png. This is the
// preview that shows up in iMessage / Slack / Discord / Facebook /
// LinkedIn when someone shares the URL.
export const alt = 'BDT Golf Network — live broadcast-style scoreboard for the BDT Tour';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpenGraphImage() {
  const shield = await readFile(path.join(process.cwd(), 'public', 'bdt-shield.png'));
  const logo = `data:image/png;base64,${shield.toString('base64')}`;

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

        {/* The BD Tour shield, cut from public/bdt-logo.png by `npm run icons` */}
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo} width={300} height={420} style={{ marginRight: 60 }} />

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
