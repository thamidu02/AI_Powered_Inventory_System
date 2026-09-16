export type GuidedStepAction = 'NAVIGATE' | 'CLICK' | 'INPUT' | 'CONFIRM' | 'INSPECT';

export type GuidedStepStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'SKIPPED' | 'FAILED';

export interface GuidedStep {
  stepNumber: number;
  action: GuidedStepAction;
  route: string;
  tab: 'inventory' | 'operations' | 'masterData' | 'menuRecipes' | 'salesWaste' | 'procurement' | 'kitchenOrder' | 'aiAssistant' | 'planning';
  target: string;
  instruction: string;
  status: GuidedStepStatus;
  waitForUserAction: boolean;
  targetDescription?: string;
}

export type GuidedWorkflowStatus = 'IDLE' | 'IN_PROGRESS' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface GuidedWorkflowState {
  isActive: boolean;
  workflowId?: string;
  workflowType: string;
  title: string;
  description: string;
  currentStepIndex: number; // 0-indexed
  steps: GuidedStep[];
  status: GuidedWorkflowStatus;
  error?: string | null;
}

export interface GuidedWorkflowContextType {
  state: GuidedWorkflowState;
  startWorkflow: (
    workflowType: string,
    steps?: GuidedStep[],
    title?: string,
    description?: string
  ) => Promise<void>;
  completeCurrentStep: (resultData?: unknown) => Promise<void>;
  skipStep: () => void;
  cancelWorkflow: (reason?: string) => Promise<void>;
  goToStep: (stepIndex: number) => void;
  currentTargetRect: DOMRect | null;
  currentElement: HTMLElement | null;
}
