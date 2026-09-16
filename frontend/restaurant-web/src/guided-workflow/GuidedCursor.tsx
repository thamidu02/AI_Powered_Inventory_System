import React from 'react';

interface CursorProps {
  targetRect: DOMRect | null;
}

export const GuidedCursor: React.FC<CursorProps> = ({ targetRect }) => {
  if (!targetRect) return null;

  // Position the cursor at the top-left or bottom-right of the target element
  const cursorX = targetRect.left + Math.min(targetRect.width / 2, 40);
  const cursorY = targetRect.top + Math.min(targetRect.height / 2, 30);

  return (
    <div
      className="guide-cursor-wrapper"
      style={{
        transform: `translate3d(${cursorX}px, ${cursorY}px, 0)`,
      }}
      aria-hidden="true"
    >
      {/* Animated Cursor Pointer */}
      <svg
        className="guide-cursor-icon"
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M5.5 3.5L18.5 10.5L12 12.5L9.5 19L5.5 3.5Z"
          fill="#3B82F6"
          stroke="#FFFFFF"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
      {/* Target ping dot */}
      <div className="guide-cursor-beacon" />
    </div>
  );
};
