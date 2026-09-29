import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles,
  X,
  Send,
  Maximize2,
  Minimize2,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Wrench,
  ChevronDown,
  ChevronRight,
  Brain,
  Zap,
  PackageSearch,
  AlertTriangle,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { getStoredToken } from '../services/api';
import { useGuidedWorkflow } from '../guided-workflow';
import type {
  AiChatMessage,
  AiEvent,
  AiProposal,
  AiGuidedWorkflowPayload,
} from '../types';
import './FloatingAiChatWidget.css';

const API = 'http://localhost:5066';

const QUICK_ACTIONS = [
  { label: 'Guide: Receive Stock',  icon: Sparkles,      message: 'Show me how to receive a new stock batch' },
  { label: 'Check Low Stock',       icon: PackageSearch, message: 'Check for low stock ingredients that need replenishment' },
  { label: 'Investigate Anomaly',   icon: AlertTriangle, message: 'Investigate stock discrepancies and anomalies across all ingredients' },
  { label: 'Optimize Levels',       icon: TrendingUp,    message: 'Analyze and optimize reorder levels based on 90-day consumption history' },
  { label: 'Emergency Shortage',    icon: ShieldAlert,   message: 'Emergency — we have critically low stock on a key ingredient' },
  { label: 'Analyze Sales',         icon: TrendingUp,    message: 'Analyze recorded sales performance for the last 30 days' },
  { label: 'Track Consumption',     icon: PackageSearch, message: 'Analyze ingredient consumption and stock movements for the last 30 days' },
  { label: 'Analyze Waste',         icon: AlertTriangle, message: 'Analyze recorded waste by ingredient and reason for the last 30 days' },
  { label: 'Full C3 Report',        icon: Sparkles,      message: 'Give me a complete sales, consumption, recipe, and waste report for the last 30 days using only recorded database data' },
];

const WORKFLOW_COLORS: Record<string, string> = {
  SALES_CONSUMPTION_WASTE: '#a855f7',
  GUIDED_WORKFLOW: '#3b82f6',
  LOW_STOCK_REPLENISHMENT: '#f59e0b',
  ANOMALY_INVESTIGATION: '#ef4444',
  INVENTORY_OPTIMIZATION: '#8b5cf6',
  EMERGENCY_SHORTAGE: '#ec4899',
};

export const FloatingAiChatWidget: React.FC = () => {
  const { user } = useAuth();
  const { startWorkflow } = useGuidedWorkflow();

  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const [actedWorkflows, setActedWorkflows] = useState<Record<string, 'APPROVED' | 'REJECTED'>>({});

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen, streaming]);

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150);
      setHasUnread(false);
    }
  }, [isOpen]);

  const toggleTool = (idx: number) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleStartGuided = useCallback(
    (gw: AiGuidedWorkflowPayload) => {
      void startWorkflow(gw.workflow_type, gw.steps, gw.title, gw.description);
    },
    [startWorkflow]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;

      const userMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      };

      const assistantId = crypto.randomUUID();
      const assistantMsg: AiChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        events: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setInput('');
      setStreaming(true);

      try {
        const token = getStoredToken();
        const resp = await fetch(`${API}/api/ai/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token ?? ''}`,
          },
          body: JSON.stringify({ message: text.trim() }),
        });

        if (!resp.ok || !resp.body) {
          if (resp.status === 401) {
            window.dispatchEvent(new Event('auth:unauthorized'));
            throw new Error('Your session has expired. Please log in again.');
          }
          throw new Error(`HTTP ${resp.status}`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let finalText = '';
        let proposal: AiProposal | undefined;
        let guidedWorkflow: AiGuidedWorkflowPayload | undefined;
        let workflowId: string | undefined;
        const collectedEvents: AiEvent[] = [];
        let c3Approval: AiChatMessage['c3Approval'] | undefined;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as AiEvent;
              collectedEvents.push(ev);

              if (ev.type === 'message' && ev.text) {
                finalText += ev.text;
                workflowId = ev.workflow_id;
              }
              // Shape A — standard proposal (low-stock, optimization, emergency)
              if (ev.type === 'approval_required' && ev.proposal) {
                proposal = ev.proposal;
                workflowId = ev.workflow_id;
              }
              // Shape B — Component 3 recommendations (no proposal field)
              if (ev.type === 'approval_required' && !ev.proposal && ev.recommendations) {
                c3Approval = {
                  workflow_id:     ev.workflow_id ?? '',
                  workflow_type:   ev.workflow_type ?? 'SALES_CONSUMPTION_WASTE',
                  impact_level:    ev.impact_level ?? 'LOW',
                  confidence:      ev.confidence ?? 0,
                  recommendations: ev.recommendations,
                };
                workflowId = ev.workflow_id;
              }
              if (ev.type === 'guided_workflow') {
                guidedWorkflow = {
                  workflow_type: ev.workflow_type || 'RECEIVE_STOCK',
                  title: ev.title || 'Interactive Guided Workflow',
                  description: ev.description || '',
                  steps: (ev.steps as any[]) || [],
                };
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id !== assistantId
                    ? m
                    : {
                        ...m,
                        content: finalText,
                        events: [...collectedEvents],
                        proposal,
                        c3Approval,
                        guidedWorkflow,
                        workflowId,
                        isStreaming: ev.type !== 'done',
                      }
                )
              );
            } catch {
              // ignore malformed lines
            }
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : 'Request failed.';
        setMessages((prev) =>
          prev.map((m) =>
            m.id !== assistantId
              ? m
              : {
                  ...m,
                  content: `❌ Error: ${errMsg}`,
                  isStreaming: false,
                }
          )
        );
      } finally {
        setStreaming(false);
        if (!isOpen) {
          setHasUnread(true);
        }
      }
    },
    [streaming, isOpen]
  );

  const handleApprove = async (wfId: string) => {
    if (actedWorkflows[wfId] || approvalBusy) return;
    setApprovalBusy(true);
    try {
      const token = getStoredToken();
      const r = await fetch(`${API}/api/ai/workflows/${wfId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          decision: 'APPROVED',
          comment: 'Approved via Floating AI Assistant',
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        message?: string;
        purchaseRequestId?: string;
        itemCount?: number;
        status?: string;
      };

      if (!r.ok) {
        if (data.message?.includes('COMPLETED') || data.message?.includes('not awaiting approval')) {
          setActedWorkflows((prev) => ({ ...prev, [wfId]: 'APPROVED' }));
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'assistant',
              content: 'ℹ️ This proposal has already been approved and executed.',
              timestamp: new Date(),
            },
          ]);
          return;
        }
        if (r.status === 401) {
          window.dispatchEvent(new Event('auth:unauthorized'));
          throw new Error('Your session has expired. Please log in again.');
        }
        throw new Error(data.message || `HTTP ${r.status}`);
      }

      setActedWorkflows((prev) => ({ ...prev, [wfId]: 'APPROVED' }));
      const prInfo = data.purchaseRequestId
        ? ` Purchase Request created (${data.itemCount ?? 0} item${(data.itemCount ?? 0) !== 1 ? 's' : ''}) — status: ${data.status ?? 'PENDING_APPROVAL'}.`
        : ` ${data.message ?? ''}`;
      const confirmMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `✅ Approved!${prInfo} The manager can now review and action the PR in the Purchase Requests section.`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, confirmMsg]);
    } catch (err) {
      const errMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `❌ Approval failed: ${err instanceof Error ? err.message : 'Please try again.'}`,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleReject = async (wfId: string) => {
    setApprovalBusy(true);
    try {
      const token = getStoredToken();
      await fetch(`${API}/api/ai/workflows/${wfId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({
          decision: 'REJECTED',
          comment: 'Rejected via Floating AI Assistant',
        }),
      });
      const rejectMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '🚫 Proposal rejected. No changes were made.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, rejectMsg]);
    } catch {
      const errMsg: AiChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: '❌ Rejection failed. Please try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setInput('');
  };

  // If user role is not authorized or not logged in, we don't render widget
  if (!user) return null;

  return (
    <>
      {/* Floating Action Button (FAB) */}
      <button
        type="button"
        id="floating-ai-fab"
        className={`floating-ai-btn ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen((prev) => !prev)}
        title={isOpen ? 'Close AI Assistant' : 'Ask Savory AI Copilot'}
        aria-label="Toggle AI Assistant"
      >
        {isOpen ? <X size={24} /> : <Sparkles size={24} />}
        {!isOpen && hasUnread && (
          <div className="floating-ai-ping">
            <div className="floating-ai-ping-ring" />
          </div>
        )}
        <div className="floating-ai-tooltip">Ask Savory AI Copilot</div>
      </button>

      {/* Floating Chat Window */}
      {isOpen && (
        <div className={`floating-ai-window ${isExpanded ? 'expanded' : ''}`}>
          {/* Header */}
          <div className="floating-ai-header">
            <div className="floating-ai-title-group">
              <div className="floating-ai-avatar">
                <Sparkles size={18} />
              </div>
              <div className="floating-ai-info">
                <span className="floating-ai-name">
                  Savory <span>AI Copilot</span>
                </span>
                <span className="floating-ai-status">
                  <span className="floating-ai-status-dot" />
                  Active · Ready to assist
                </span>
              </div>
            </div>

            <div className="floating-ai-controls">
              <button
                type="button"
                className="floating-ai-btn-icon"
                onClick={handleReset}
                title="Clear conversation"
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                className="floating-ai-btn-icon"
                onClick={() => setIsExpanded((prev) => !prev)}
                title={isExpanded ? 'Compact view' : 'Expand window'}
              >
                {isExpanded ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
              </button>
              <button
                type="button"
                className="floating-ai-btn-icon"
                onClick={() => setIsOpen(false)}
                title="Close chat"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Quick Actions Strip */}
          <div className="floating-ai-quick-strip">
            {QUICK_ACTIONS.map((action, i) => {
              const Icon = action.icon;
              return (
                <button
                  key={i}
                  type="button"
                  className="floating-ai-chip"
                  disabled={streaming}
                  onClick={() => void sendMessage(action.message)}
                >
                  <Icon size={12} />
                  <span>{action.label}</span>
                </button>
              );
            })}
          </div>

          {/* Messages Container */}
          <div className="floating-ai-messages">
            {messages.length === 0 ? (
              <div className="floating-ai-empty">
                <div className="floating-ai-empty-icon">
                  <Sparkles size={28} />
                </div>
                <div className="floating-ai-empty-title">
                  How can I help you today?
                </div>
                <div className="floating-ai-empty-desc">
                  Ask questions about stock levels, investigate anomalies, receive
                  batches interactively, or optimize your inventory levels.
                </div>
              </div>
            ) : (
              messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    className={`floating-ai-bubble-row ${isUser ? 'user' : 'bot'}`}
                  >
                    <div
                      className={`floating-ai-bubble-avatar ${
                        isUser ? 'user' : 'bot'
                      }`}
                    >
                      {isUser ? 'U' : <Sparkles size={14} />}
                    </div>

                    <div className="floating-ai-bubble-content">
                      {/* Intent badges, thinking indicators, and tools (bot only) */}
                      {!isUser && msg.events && msg.events.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {msg.events.map((ev, idx) => {
                            if (ev.type === 'thinking') {
                              return (
                                <div
                                  key={idx}
                                  className="floating-ai-thinking-badge"
                                >
                                  <span className="floating-ai-dot" />
                                  <span>{ev.text ?? 'Thinking…'}</span>
                                </div>
                              );
                            }
                            if (ev.type === 'intent') {
                              const col =
                                WORKFLOW_COLORS[ev.intent ?? ''] ?? '#007acc';
                              return (
                                <div
                                  key={idx}
                                  className="floating-ai-intent"
                                  style={{ borderColor: col, color: col }}
                                >
                                  <Brain size={10} />
                                  <span>{ev.intent?.replace(/_/g, ' ')}</span>
                                </div>
                              );
                            }
                            if (
                              ev.type === 'tool_call' ||
                              ev.type === 'tool_result'
                            ) {
                              const isExp = expandedTools.has(idx);
                              return (
                                <div key={idx} className="floating-ai-tool-box">
                                  <button
                                    type="button"
                                    className="floating-ai-tool-btn"
                                    onClick={() => toggleTool(idx)}
                                  >
                                    <Wrench size={11} />
                                    <span>{ev.tool}</span>
                                    {ev.type === 'tool_result' ? (
                                      <CheckCircle2
                                        size={11}
                                        style={{ color: '#10b981', marginLeft: 'auto' }}
                                      />
                                    ) : (
                                      <span
                                        style={{
                                          fontSize: '0.65rem',
                                          color: '#64748b',
                                          marginLeft: 'auto',
                                        }}
                                      >
                                        calling...
                                      </span>
                                    )}
                                    {isExp ? (
                                      <ChevronDown size={11} />
                                    ) : (
                                      <ChevronRight size={11} />
                                    )}
                                  </button>
                                  {isExp && (
                                    <pre className="floating-ai-tool-json">
                                      {JSON.stringify(
                                        ev.type === 'tool_result'
                                          ? ev.output
                                          : ev.input,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  )}
                                </div>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}

                      {/* Main Message Text */}
                      {msg.content && (
                        <div
                          className={`floating-ai-bubble ${
                            isUser ? 'user' : 'bot'
                          }`}
                        >
                          {msg.content}
                        </div>
                      )}

                      {/* Streaming indicator */}
                      {msg.isStreaming && !msg.content && (
                        <div className="floating-ai-thinking">
                          <span className="floating-ai-dot" />
                          <span className="floating-ai-dot" />
                          <span className="floating-ai-dot" />
                          <span>Thinking...</span>
                        </div>
                      )}

                      {/* Interactive Guided Workflow Card */}
                      {msg.guidedWorkflow && (
                        <div className="floating-ai-guided-card">
                          <div className="floating-ai-guided-header">
                            <span className="floating-ai-guided-title">
                              <Sparkles size={14} />
                              <span>{msg.guidedWorkflow.title}</span>
                            </span>
                            <span className="floating-ai-guided-badge">
                              {msg.guidedWorkflow.steps.length} Steps
                            </span>
                          </div>
                          <p className="floating-ai-guided-desc">
                            {msg.guidedWorkflow.description ||
                              'Step-by-step interactive navigation with animated cursor.'}
                          </p>
                          <button
                            type="button"
                            className="floating-ai-guided-btn"
                            onClick={() =>
                              handleStartGuided(msg.guidedWorkflow!)
                            }
                          >
                            <Zap size={13} />
                            <span>Start Interactive Guidance</span>
                          </button>
                        </div>
                      )}

                      {/* Standard Proposal Card (Shape A) */}
                      {msg.proposal && (
                        <div className="floating-ai-proposal">
                          <div className="floating-ai-proposal-header">
                            <span>
                              {msg.proposal.proposal_type === 'PURCHASE_REQUEST'
                                ? '🛒 Purchase Request Proposal'
                                : '⚙️ Optimization Proposal'}
                            </span>
                            {msg.proposal.total_cost !== undefined && (
                              <span style={{ color: '#059669' }}>
                                ${msg.proposal.total_cost.toFixed(2)}
                              </span>
                            )}
                          </div>

                          {msg.proposal.proposal_type === 'PURCHASE_REQUEST' &&
                            msg.proposal.items &&
                            msg.proposal.items.length > 0 && (
                              <div className="floating-ai-proposal-table">
                                <div className="floating-ai-proposal-row header">
                                  <span>Item</span>
                                  <span>Qty</span>
                                  <span>Subtotal</span>
                                </div>
                                {msg.proposal.items.map((it, i) => (
                                  <div
                                    key={i}
                                    className="floating-ai-proposal-row"
                                  >
                                    <span>{it.ingredient_name}</span>
                                    <span>{it.quantity}</span>
                                    <span>
                                      ${(it.quantity * it.unit_price).toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                          {msg.proposal.proposal_type === 'OPTIMIZATION' &&
                            msg.proposal.optimizations &&
                            msg.proposal.optimizations.length > 0 && (
                              <div className="floating-ai-proposal-table">
                                <div className="floating-ai-proposal-row header">
                                  <span>Item</span>
                                  <span>Min</span>
                                  <span>Max</span>
                                </div>
                                {msg.proposal.optimizations.map((opt, i) => (
                                  <div
                                    key={i}
                                    className="floating-ai-proposal-row"
                                  >
                                    <span>{opt.ingredient_name}</span>
                                    <span>
                                      {opt.current_min} → {opt.new_minimum}
                                    </span>
                                    <span>
                                      {opt.current_max} → {opt.new_maximum}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                          <div className="floating-ai-proposal-reasoning">
                            {msg.proposal.reasoning}
                          </div>

                          <div className="floating-ai-proposal-actions">
                            {actedWorkflows[msg.proposal.workflow_id] === 'APPROVED' ? (
                              <span style={{ color: '#059669', fontWeight: 600, fontSize: '0.85rem' }}>
                                ✅ Approved & Created
                              </span>
                            ) : actedWorkflows[msg.proposal.workflow_id] === 'REJECTED' ? (
                              <span style={{ color: '#dc2626', fontWeight: 600, fontSize: '0.85rem' }}>
                                🚫 Rejected
                              </span>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="floating-ai-btn-approve"
                                  disabled={approvalBusy}
                                  onClick={() =>
                                    handleApprove(msg.proposal!.workflow_id)
                                  }
                                >
                                  <CheckCircle2 size={13} />
                                  <span>Approve — Create PR</span>
                                </button>
                                <button
                                  type="button"
                                  className="floating-ai-btn-reject"
                                  disabled={approvalBusy}
                                  onClick={() =>
                                    handleReject(msg.proposal!.workflow_id)
                                  }
                                >
                                  <XCircle size={13} />
                                  <span>Reject</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Component 3 Recommendations Card (Shape B — no proposal field) */}
                      {msg.c3Approval && (
                        <div className="floating-ai-proposal">
                          <div className="floating-ai-proposal-header">
                            <span>📊 Analysis Recommendations</span>
                            <span
                              style={{
                                fontSize: '0.7rem',
                                padding: '2px 8px',
                                borderRadius: '999px',
                                background:
                                  msg.c3Approval.impact_level === 'HIGH'
                                    ? 'rgba(239,68,68,0.18)'
                                    : msg.c3Approval.impact_level === 'MEDIUM'
                                    ? 'rgba(245,158,11,0.18)'
                                    : 'rgba(16,185,129,0.18)',
                                color:
                                  msg.c3Approval.impact_level === 'HIGH'
                                    ? '#ef4444'
                                    : msg.c3Approval.impact_level === 'MEDIUM'
                                    ? '#f59e0b'
                                    : '#10b981',
                              }}
                            >
                              {msg.c3Approval.impact_level} impact
                            </span>
                          </div>
                          <div style={{ padding: '6px 0 4px' }}>
                            {msg.c3Approval.recommendations.map((rec, i) => (
                              <div
                                key={i}
                                style={{
                                  fontSize: '0.78rem',
                                  color: '#cbd5e1',
                                  padding: '3px 0',
                                  borderBottom: '1px solid rgba(255,255,255,0.05)',
                                }}
                              >
                                • {rec}
                              </div>
                            ))}
                          </div>
                          {msg.c3Approval.confidence > 0 && (
                            <div
                              style={{
                                fontSize: '0.7rem',
                                color: '#64748b',
                                marginTop: '4px',
                              }}
                            >
                              Confidence: {Math.round(msg.c3Approval.confidence * 100)}%
                            </div>
                          )}
                          <div className="floating-ai-proposal-reasoning">
                            This is a read-only analysis report. No approval action is required.
                          </div>
                        </div>
                      )}

                      <span className="floating-ai-time">
                        {msg.timestamp.toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div className="floating-ai-input-bar">
            <textarea
              ref={inputRef}
              className="floating-ai-input"
              rows={1}
              placeholder="Ask Savory AI Copilot... (Enter to send)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />
            <button
              type="button"
              className="floating-ai-send-btn"
              disabled={!input.trim() || streaming}
              onClick={() => void sendMessage(input)}
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
