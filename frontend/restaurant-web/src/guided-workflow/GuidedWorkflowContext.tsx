import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import type {
  GuidedStep,
  GuidedWorkflowState,
} from './types';
import { WORKFLOW_DEFINITIONS } from './workflowDefinitions';
import { isAllowedTarget } from './targetRegistry';
import { GuidedWorkflowContext } from './guidedWorkflowContextDef';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5066';

const initialWorkflowState: GuidedWorkflowState = {
  isActive: false,
  workflowId: undefined,
  workflowType: '',
  title: '',
  description: '',
  currentStepIndex: 0,
  steps: [],
  status: 'IDLE',
  error: null,
};

const areRectsEqual = (r1: DOMRect | null, r2: DOMRect | null): boolean => {
  if (r1 === r2) return true;
  if (!r1 || !r2) return false;
  return (
    Math.abs(r1.top - r2.top) < 1 &&
    Math.abs(r1.left - r2.left) < 1 &&
    Math.abs(r1.width - r2.width) < 1 &&
    Math.abs(r1.height - r2.height) < 1
  );
};

interface ProviderProps {
  children: React.ReactNode;
  activeTab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning';
  setActiveTab: (tab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning') => void;
  openModal?: (modal: any) => void;
}

export const GuidedWorkflowProvider: React.FC<ProviderProps> = ({
  children,
  activeTab,
  setActiveTab,
}) => {
  const [state, setState] = useState<GuidedWorkflowState>(initialWorkflowState);
  const [currentTargetRect, setCurrentTargetRect] = useState<DOMRect | null>(null);
  const [currentElement, setCurrentElement] = useState<HTMLElement | null>(null);

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const prevElementRef = useRef<HTMLElement | null>(null);
  const currentTargetRectRef = useRef<DOMRect | null>(null);

  // Helper to get stored auth token
  const getAuthToken = () => {
    return localStorage.getItem('jwt_token') || localStorage.getItem('token') || '';
  };

  // Measure and update the target element's bounding rect
  const updateTargetRect = useCallback(() => {
    if (!state.isActive || state.status !== 'IN_PROGRESS') {
      if (currentTargetRectRef.current !== null) {
        currentTargetRectRef.current = null;
        setCurrentTargetRect(null);
      }
      setCurrentElement(null);
      if (prevElementRef.current) {
        prevElementRef.current.classList.remove('guide-spotlight-target');
        prevElementRef.current = null;
      }
      return;
    }

    const currentStep = state.steps[state.currentStepIndex];
    if (!currentStep) {
      if (currentTargetRectRef.current !== null) {
        currentTargetRectRef.current = null;
        setCurrentTargetRect(null);
      }
      setCurrentElement(null);
      return;
    }

    const targetId = currentStep.target;
    const el = document.querySelector<HTMLElement>(`[data-guide-id="${targetId}"]`);

    if (el) {
      const rect = el.getBoundingClientRect();
      if (!areRectsEqual(currentTargetRectRef.current, rect)) {
        currentTargetRectRef.current = rect;
        setCurrentTargetRect(rect);
      }
      setCurrentElement(el);

      if (prevElementRef.current && prevElementRef.current !== el) {
        prevElementRef.current.classList.remove('guide-spotlight-target');
      }
      if (!el.classList.contains('guide-spotlight-target')) {
        el.classList.add('guide-spotlight-target');
      }
      prevElementRef.current = el;
    } else {
      if (prevElementRef.current) {
        prevElementRef.current.classList.remove('guide-spotlight-target');
        prevElementRef.current = null;
      }
      if (currentTargetRectRef.current !== null) {
        currentTargetRectRef.current = null;
        setCurrentTargetRect(null);
      }
      setCurrentElement(null);
    }
  }, [state.isActive, state.status, state.steps, state.currentStepIndex]);

  // Start workflow
  const startWorkflow = useCallback(
    async (
      workflowType: string,
      providedSteps?: GuidedStep[],
      title?: string,
      description?: string
    ) => {
      const key = workflowType.trim().toUpperCase();
      const template = WORKFLOW_DEFINITIONS[key];

      const resolvedTitle = title || template?.title || key;
      const resolvedDesc = description || template?.description || 'Interactive Guided Workflow';
      const stepsToUse = (providedSteps && providedSteps.length > 0)
        ? providedSteps
        : template?.steps || [];

      if (stepsToUse.length === 0) {
        console.error(`No steps defined for workflow type: ${workflowType}`);
        return;
      }

      // Security check on target identifiers
      const validatedSteps = stepsToUse.map((s, idx) => {
        if (!isAllowedTarget(s.target)) {
          console.warn(`Target ${s.target} not in allowed registry. Proceeding cautiously.`);
        }
        return {
          ...s,
          stepNumber: idx + 1,
          status: idx === 0 ? ('IN_PROGRESS' as const) : ('PENDING' as const),
        };
      });

      // Auto-navigate to first step's tab if needed
      const firstStep = validatedSteps[0];
      if (firstStep && firstStep.tab && firstStep.tab !== activeTabRef.current) {
        setActiveTab(firstStep.tab);
      }

      // Immediately activate state in UI with zero delay
      setState({
        isActive: true,
        workflowId: undefined,
        workflowType: key,
        title: resolvedTitle,
        description: resolvedDesc,
        currentStepIndex: 0,
        steps: validatedSteps,
        status: 'IN_PROGRESS',
        error: null,
      });

      // Synchronize with backend asynchronously in the background
      const token = getAuthToken();
      if (token) {
        fetch(`${API_BASE}/api/ai/guided-workflows/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            workflowType: key,
            title: resolvedTitle,
            description: resolvedDesc,
            steps: validatedSteps,
          }),
        })
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (data?.workflowId) {
              setState((prev) => (prev.isActive ? { ...prev, workflowId: data.workflowId } : prev));
            }
          })
          .catch((err) => {
            console.warn('Backend workflow start synchronization skipped/failed:', err);
          });
      }
    },
    [setActiveTab]
  );

  // Complete current step and advance to next
  const completeCurrentStep = useCallback(
    async (resultData?: unknown) => {
      setState((prev) => {
        if (!prev.isActive || prev.status !== 'IN_PROGRESS') return prev;

        const nextIndex = prev.currentStepIndex + 1;
        const isFinished = nextIndex >= prev.steps.length;

        const updatedSteps = prev.steps.map((step, idx) => {
          if (idx === prev.currentStepIndex) {
            return { ...step, status: 'COMPLETED' as const };
          }
          if (idx === nextIndex) {
            return { ...step, status: 'IN_PROGRESS' as const };
          }
          return step;
        });

        // If next step requires a different tab, auto-switch tab
        if (!isFinished) {
          const nextStep = updatedSteps[nextIndex];
          if (nextStep && nextStep.tab && nextStep.tab !== activeTabRef.current) {
            setActiveTab(nextStep.tab);
          }
        }

        // Backend sync asynchronously
        if (prev.workflowId) {
          const currentStepNum = prev.currentStepIndex + 1;
          const token = getAuthToken();
          if (token) {
            fetch(
              `${API_BASE}/api/ai/guided-workflows/${prev.workflowId}/complete-step`,
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                  stepNumber: currentStepNum,
                  resultData: typeof resultData === 'string' ? resultData : JSON.stringify(resultData || {}),
                }),
              }
            ).catch((e) => console.warn('Failed to sync completed step to backend:', e));
          }
        }

        return {
          ...prev,
          currentStepIndex: isFinished ? prev.currentStepIndex : nextIndex,
          steps: updatedSteps,
          status: isFinished ? ('COMPLETED' as const) : ('IN_PROGRESS' as const),
          isActive: !isFinished,
        };
      });
    },
    [setActiveTab]
  );

  // Skip current step
  const skipStep = useCallback(() => {
    setState((prev) => {
      if (!prev.isActive || prev.status !== 'IN_PROGRESS') return prev;

      const nextIndex = prev.currentStepIndex + 1;
      const isFinished = nextIndex >= prev.steps.length;

      const updatedSteps = prev.steps.map((step, idx) => {
        if (idx === prev.currentStepIndex) {
          return { ...step, status: 'SKIPPED' as const };
        }
        if (idx === nextIndex) {
          return { ...step, status: 'IN_PROGRESS' as const };
        }
        return step;
      });

      if (!isFinished) {
        const nextStep = updatedSteps[nextIndex];
        if (nextStep && nextStep.tab && nextStep.tab !== activeTabRef.current) {
          setActiveTab(nextStep.tab);
        }
      }

      return {
        ...prev,
        currentStepIndex: isFinished ? prev.currentStepIndex : nextIndex,
        steps: updatedSteps,
        status: isFinished ? ('COMPLETED' as const) : ('IN_PROGRESS' as const),
        isActive: !isFinished,
      };
    });
  }, [setActiveTab]);

  // Cancel workflow
  const cancelWorkflow = useCallback(
    async (reason?: string) => {
      const wfId = state.workflowId;
      if (wfId) {
        const token = getAuthToken();
        if (token) {
          fetch(`${API_BASE}/api/ai/guided-workflows/${wfId}/cancel`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ reason: reason || 'User cancelled' }),
          }).catch((e) => console.warn('Failed to cancel workflow on backend:', e));
        }
      }

      if (prevElementRef.current) {
        prevElementRef.current.classList.remove('guide-spotlight-target');
        prevElementRef.current = null;
      }
      currentTargetRectRef.current = null;

      setState(initialWorkflowState);
      setCurrentTargetRect(null);
      setCurrentElement(null);
    },
    [state.workflowId]
  );

  // Go to step directly
  const goToStep = useCallback(
    (stepIndex: number) => {
      setState((prev) => {
        if (stepIndex < 0 || stepIndex >= prev.steps.length) return prev;
        const targetStep = prev.steps[stepIndex];
        if (targetStep && targetStep.tab && targetStep.tab !== activeTabRef.current) {
          setActiveTab(targetStep.tab);
        }
        return {
          ...prev,
          currentStepIndex: stepIndex,
          steps: prev.steps.map((s, idx) => ({
            ...s,
            status: idx === stepIndex ? 'IN_PROGRESS' : idx < stepIndex ? 'COMPLETED' : 'PENDING',
          })),
        };
      });
    },
    [setActiveTab]
  );

  // Clean up highlighted target if workflow finishes or is closed
  useEffect(() => {
    if (!state.isActive && prevElementRef.current) {
      prevElementRef.current.classList.remove('guide-spotlight-target');
      prevElementRef.current = null;
    }
  }, [state.isActive]);

  // Handle automatic advance on user interaction with target element
  useEffect(() => {
    if (!state.isActive || state.status !== 'IN_PROGRESS') return;

    const currentStep = state.steps[state.currentStepIndex];
    if (!currentStep) return;

    // Call updateTargetRect immediately
    updateTargetRect();

    // Gentle bounded check to locate dynamically opening modal elements
    let attempts = 0;
    const retryInterval = setInterval(() => {
      attempts++;
      updateTargetRect();
      if (attempts >= 12) {
        clearInterval(retryInterval);
      }
    }, 120);

    const targetEl = document.querySelector<HTMLElement>(`[data-guide-id="${currentStep.target}"]`);
    if (!targetEl) {
      return () => {
        clearInterval(retryInterval);
      };
    }

    let isCompleted = false;

    // Advance listener based on action
    const handleTargetClick = () => {
      if (isCompleted) return;
      isCompleted = true;
      // Allow the actual click to trigger native UI behavior before advancing
      setTimeout(() => {
        completeCurrentStep({ clicked: true, target: currentStep.target });
      }, 250);
    };

    const handleTargetChange = () => {
      if (isCompleted) return;
      isCompleted = true;
      setTimeout(() => {
        completeCurrentStep({ inputChanged: true, target: currentStep.target });
      }, 400);
    };

    if (
      currentStep.action === 'CLICK' ||
      currentStep.action === 'NAVIGATE' ||
      currentStep.action === 'CONFIRM'
    ) {
      targetEl.addEventListener('click', handleTargetClick, { once: true });
    } else if (currentStep.action === 'INPUT') {
      targetEl.addEventListener('change', handleTargetChange, { once: true });
    }

    return () => {
      clearInterval(retryInterval);
      targetEl.removeEventListener('click', handleTargetClick);
      targetEl.removeEventListener('change', handleTargetChange);
    };
  }, [
    state.isActive,
    state.status,
    state.currentStepIndex,
    state.steps,
    updateTargetRect,
    completeCurrentStep,
  ]);

  // Window resize & scroll listeners to keep spotlight aligned (debounced via requestAnimationFrame)
  useEffect(() => {
    if (!state.isActive) return;

    let rafId: number | null = null;
    const handleUpdate = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateTargetRect();
      });
    };

    window.addEventListener('resize', handleUpdate, { passive: true });
    window.addEventListener('scroll', handleUpdate, { passive: true, capture: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [state.isActive, updateTargetRect]);

  // Global Escape key to cancel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isActive) {
        cancelWorkflow('User pressed Escape');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isActive, cancelWorkflow]);

  return (
    <GuidedWorkflowContext.Provider
      value={{
        state,
        startWorkflow,
        completeCurrentStep,
        skipStep,
        cancelWorkflow,
        goToStep,
        currentTargetRect,
        currentElement,
      }}
    >
      {children}
    </GuidedWorkflowContext.Provider>
  );
};
