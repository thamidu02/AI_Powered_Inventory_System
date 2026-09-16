import React from 'react';
import { useGuidedWorkflow } from './useGuidedWorkflow';
import { GuidedWorkflowOverlay } from './GuidedWorkflowOverlay';
import { GuidedCursor } from './GuidedCursor';
import { GuidedTooltip } from './GuidedTooltip';

export const AIGuide: React.FC = () => {
  const { state, currentTargetRect } = useGuidedWorkflow();

  if (!state.isActive || state.status !== 'IN_PROGRESS') {
    return null;
  }

  return (
    <div className="guide-root-container" aria-live="polite">
      {/* 1. Backdrop with spotlight punchout */}
      <GuidedWorkflowOverlay targetRect={currentTargetRect} />

      {/* 2. Visual guide cursor pointer */}
      <GuidedCursor targetRect={currentTargetRect} />

      {/* 3. Floating instruction card */}
      <GuidedTooltip targetRect={currentTargetRect} />
    </div>
  );
};
