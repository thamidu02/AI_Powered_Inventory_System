import { useContext } from 'react';
import { GuidedWorkflowContext } from './guidedWorkflowContextDef';
import type { GuidedWorkflowContextType } from './types';

export const useGuidedWorkflow = (): GuidedWorkflowContextType => {
  const context = useContext(GuidedWorkflowContext);
  if (!context) {
    throw new Error('useGuidedWorkflow must be used within a GuidedWorkflowProvider');
  }
  return context;
};
