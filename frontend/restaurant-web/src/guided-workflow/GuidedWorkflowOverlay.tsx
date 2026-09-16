import React from 'react';

interface OverlayProps {
  targetRect: DOMRect | null;
}

export const GuidedWorkflowOverlay: React.FC<OverlayProps> = ({ targetRect }) => {
  const padding = 6;

  if (!targetRect) {
    // When element is not found or loading, subtle dark backdrop
    return <div className="guide-backdrop-fallback" />;
  }

  const x = Math.max(0, targetRect.left - padding);
  const y = Math.max(0, targetRect.top - padding);
  const width = targetRect.width + padding * 2;
  const height = targetRect.height + padding * 2;
  const rx = 8;

  return (
    <>
      {/* SVG Mask Spotlight */}
      <svg className="guide-spotlight-svg" aria-hidden="true">
        <defs>
          <mask id="guide-spotlight-mask">
            {/* White covers entire viewport */}
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {/* Black punches hole through mask over target */}
            <rect
              x={x}
              y={y}
              width={width}
              height={height}
              rx={rx}
              ry={rx}
              fill="black"
            />
          </mask>
        </defs>
        {/* Shaded backdrop with hole punched */}
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(11, 15, 25, 0.72)"
          mask="url(#guide-spotlight-mask)"
        />
      </svg>

      {/* Glowing boundary & ripple around target element */}
      <div
        className="guide-highlight-frame"
        style={{
          left: `${x}px`,
          top: `${y}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${rx}px`,
        }}
      >
        <div className="guide-radar-ripple" />
      </div>
    </>
  );
};
