import { createContext } from 'react';
import type { GuidedWorkflowContextType } from './types';

export const GuidedWorkflowContext = createContext<GuidedWorkflowContextType | null>(null);
