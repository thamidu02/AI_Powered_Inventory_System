import React, { useRef, useState, useEffect } from 'react';
import { useGuidedWorkflow } from './useGuidedWorkflow';
import {
  Sparkles,
  ChevronRight,
  X,
  Compass,
  MousePointerClick,
  TextCursorInput,
  CheckCircle2,
  Eye,
  SkipForward,
} from 'lucide-react';

interface TooltipProps {
  targetRect: DOMRect | null;
}

export const GuidedTooltip: React.FC<TooltipProps> = ({ targetRect }) => {
  const { state, completeCurrentStep, skipStep, cancelWorkflow } = useGuidedWorkflow();
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number; placement: 'top' | 'bottom' | 'center' }>({
    top: 100,
    left: 100,
    placement: 'bottom',
  });

  const currentStep = state.steps[state.currentStepIndex];
  const totalSteps = state.steps.length;
  const currentStepNum = state.currentStepIndex + 1;
  const progressPercent = Math.round((currentStepNum / totalSteps) * 100);

  useEffect(() => {
    if (!targetRect || !tooltipRef.current) {
      // Center in viewport if target not yet mounted
      setPosition({
        top: window.innerHeight / 2 - 120,
        left: Math.max(16, window.innerWidth / 2 - 210),
        placement: 'center',
      });
      return;
    }

    const tooltipWidth = 420;
    const tooltipHeight = tooltipRef.current.offsetHeight || 220;
    const margin = 16;

    let placement: 'top' | 'bottom' | 'center' = 'bottom';
    let top = targetRect.bottom + margin;

    // Flip above if near viewport bottom
    if (top + tooltipHeight > window.innerHeight - 20) {
      top = Math.max(20, targetRect.top - tooltipHeight - margin);
      placement = 'top';
    }

    // Align left with target, clamp within window
    let left = targetRect.left;
    if (left + tooltipWidth > window.innerWidth - 20) {
      left = window.innerWidth - tooltipWidth - 20;
    }
    left = Math.max(20, left);

    setPosition({ top, left, placement });
  }, [targetRect, currentStepNum]);

  if (!state.isActive || !currentStep) return null;

  const renderActionIcon = () => {
    switch (currentStep.action) {
      case 'NAVIGATE':
        return <Compass size={14} className="text-cyan" />;
      case 'CLICK':
        return <MousePointerClick size={14} className="text-blue" />;
      case 'INPUT':
        return <TextCursorInput size={14} className="text-amber" />;
      case 'CONFIRM':
        return <CheckCircle2 size={14} className="text-emerald" />;
      case 'INSPECT':
        return <Eye size={14} className="text-purple" />;
      default:
        return <Sparkles size={14} className="text-blue" />;
    }
  };

  return (
    <aside
      ref={tooltipRef}
      aria-label="AI interactive workflow step guidance"
      className={`guide-tooltip-card guide-placement-${position.placement}`}
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
      }}
    >
      {/* Progress Line */}
      <div className="guide-progress-bar-container">
        <div
          className="guide-progress-bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Header */}
      <div className="guide-tooltip-header">
        <div className="guide-badge-group">
          <div className="guide-ai-pill">
            <span className="guide-live-dot" />
            <Sparkles size={13} className="text-accent" />
            <span>AI WORKFLOW GUIDE</span>
          </div>

          <div className="guide-step-tag">
            Step {currentStepNum} of {totalSteps}
          </div>
        </div>

        <button
          type="button"
          className="guide-btn-close"
          onClick={() => cancelWorkflow('User closed guide')}
          title="Exit Guide (Esc)"
        >
          <X size={16} />
        </button>
      </div>

      {/* Action & Title */}
      <div className="guide-step-meta">
        <span className={`guide-action-pill guide-action-${currentStep.action.toLowerCase()}`}>
          {renderActionIcon()}
          <span>{currentStep.action}</span>
        </span>
        {currentStep.targetDescription && (
          <span className="guide-target-desc">{currentStep.targetDescription}</span>
        )}
      </div>

      {/* Main Instruction */}
      <p className="guide-instruction-text">
        {currentStep.instruction}
      </p>

      {/* Contextual Tip */}
      <div className="guide-tip-callout">
        <span>💡 Hint:</span>
        <span className="guide-tip-detail">
          {currentStep.action === 'INPUT'
            ? 'Enter your value or change the dropdown. You can also click Next when finished.'
            : currentStep.action === 'CONFIRM'
            ? 'This is the final confirmation. Submitting the form commits the transaction.'
            : 'Interacting directly with the highlighted element advances automatically.'}
        </span>
      </div>

      {/* Footer Controls */}
      <div className="guide-tooltip-footer">
        <button
          type="button"
          className="guide-btn-text"
          onClick={() => cancelWorkflow('User cancelled')}
        >
          Exit Guide
        </button>

        <div className="guide-footer-right">
          {currentStepNum < totalSteps && (
            <button
              type="button"
              className="guide-btn-secondary"
              onClick={skipStep}
              title="Skip this step"
            >
              <SkipForward size={14} />
              <span>Skip</span>
            </button>
          )}

          <button
            type="button"
            className="guide-btn-primary"
            onClick={() => completeCurrentStep()}
          >
            <span>{currentStepNum === totalSteps ? 'Finish Guide' : 'Next Step'}</span>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
};
