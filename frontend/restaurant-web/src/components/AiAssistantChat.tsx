import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  PackageSearch,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  User,
  Wrench,
  XCircle,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/useAuth';
import { getStoredToken } from '../services/api';
import { useGuidedWorkflow } from '../guided-workflow';
import type {
  AiChatMessage,
  AiEvent,
  AiProposal,
  AiWorkflowSummary,
  AiGuidedWorkflowPayload,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const API = 'http://localhost:5066';

const QUICK_ACTIONS = [
  { label: "What's expiring soon?",  icon: Clock,         color: '#B85445', message: "What items and batches are expiring soonest?" },
  { label: "What's running low?",    icon: PackageSearch, color: '#C99A45', message: 'Check for low stock ingredients that need replenishment' },
  { label: "What should I order?",   icon: Sparkles,      color: '#173F35', message: 'What ingredients should we order based on current stock and consumption?' },
  { label: "Show today's waste",     icon: AlertTriangle, color: '#B85445', message: 'Analyze recorded waste by ingredient and reason for the last 30 days' },
  { label: 'How to receive stock',   icon: Sparkles,      color: '#4F8A70', message: 'Show me how to receive a new stock batch' },
  { label: 'Sales & usage summary',  icon: TrendingUp,    color: '#4F8A70', message: 'Analyze recorded sales and ingredient consumption for the last 30 days' },
];

const WORKFLOW_COLORS: Record<string, string> = {
  SALES_CONSUMPTION_WASTE:   '#173F35',
  GUIDED_WORKFLOW:         '#4F8A70',
  LOW_STOCK_REPLENISHMENT: '#C99A45',
  ANOMALY_INVESTIGATION:   '#B85445',
  INVENTORY_OPTIMIZATION:  '#173F35',
  EMERGENCY_SHORTAGE:      '#B85445',
};


// ─── Sub-components ───────────────────────────────────────────────────────────

const ThinkingIndicator: React.FC<{ text: string }> = ({ text }) => (
  <div className="ai-thinking">
    <span className="ai-thinking-dot" />
    <span className="ai-thinking-dot" />
    <span className="ai-thinking-dot" />
    <span className="ai-thinking-text">{text}</span>
  </div>
);

const ToolCallRow: React.FC<{
  event: AiEvent;
  expanded: boolean;
  onToggle: () => void;
}> = ({ event, expanded, onToggle }) => (
  <div className="ai-tool-row">
    <button className="ai-tool-header" onClick={onToggle} type="button">
      <Wrench size={12} />
      <span className="ai-tool-name">{event.tool}</span>
      {event.type === 'tool_result'
        ? <CheckCircle2 size={11} className="text-emerald" />
        : <span className="ai-tool-badge">calling…</span>}
      {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
    </button>
    {expanded && (
      <pre className="ai-tool-json">
        {JSON.stringify(event.type === 'tool_result' ? event.output : event.input, null, 2)}
      </pre>
    )}
  </div>
);

const ProposalCard: React.FC<{
  proposal: AiProposal;
  onApprove: (workflowId: string) => void;
  onReject:  (workflowId: string) => void;
  busy: boolean;
}> = ({ proposal, onApprove, onReject, busy }) => {
  const isPO   = proposal.proposal_type === 'PURCHASE_REQUEST';
  const isOpt  = proposal.proposal_type === 'OPTIMIZATION';

  return (
    <div className="ai-proposal">
      <div className="ai-proposal-header">
        <Sparkles size={16} />
        <span>
          {isPO  ? '🛒 Purchase Order Proposal'  : ''}
          {isOpt ? '⚙️ Optimization Proposal'   : ''}
        </span>
        {isPO && proposal.total_cost !== undefined && (
          <span className="ai-proposal-total">
            Total: ${proposal.total_cost.toFixed(2)}
          </span>
        )}
      </div>

      {/* PO items */}
      {isPO && proposal.items && proposal.items.length > 0 && (
        <div className="ai-proposal-table">
          <div className="ai-proposal-thead">
            <span>Ingredient</span><span>Qty</span><span>Supplier</span><span>Unit Price</span><span>Subtotal</span>
          </div>
          {proposal.items.map((item, i) => (
            <div key={i} className="ai-proposal-trow">
              <span>{item.ingredient_name}</span>
              <span>{item.quantity}</span>
              <span>{item.supplier_name}</span>
              <span>${item.unit_price?.toFixed(2)}</span>
              <span className="text-emerald">${(item.quantity * item.unit_price).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Optimization items */}
      {isOpt && proposal.optimizations && proposal.optimizations.length > 0 && (
        <div className="ai-proposal-table">
          <div className="ai-proposal-thead">
            <span>Ingredient</span><span>Current Min</span><span>New Min</span><span>Current Max</span><span>New Max</span>
          </div>
          {proposal.optimizations.map((opt, i) => (
            <div key={i} className="ai-proposal-trow">
              <span>{opt.ingredient_name}</span>
              <span>{opt.current_min}</span>
              <span className="text-accent">{opt.new_minimum}</span>
              <span>{opt.current_max}</span>
              <span className="text-accent">{opt.new_maximum}</span>
            </div>
          ))}
        </div>
      )}

      <p className="ai-proposal-reasoning">{proposal.reasoning}</p>

      <div className="ai-proposal-actions">
        <button
          type="button"
          className="btn-primary ai-approve-btn"
          disabled={busy}
          onClick={() => onApprove(proposal.workflow_id)}
        >
          <CheckCircle2 size={15} /> Approve & Execute
        </button>
        <button
          type="button"
          className="btn-secondary ai-reject-btn"
          disabled={busy}
          onClick={() => onReject(proposal.workflow_id)}
        >
          <XCircle size={15} /> Reject
        </button>
      </div>
    </div>
  );
};

// ─── Message bubble ───────────────────────────────────────────────────────────

const ChatBubble: React.FC<{
  msg: AiChatMessage;
  onApprove: (wfId: string) => void;
  onReject:  (wfId: string) => void;
  onStartGuidedWorkflow: (gw: AiGuidedWorkflowPayload) => void;
  approvalBusy: boolean;
}> = ({ msg, onApprove, onReject, onStartGuidedWorkflow, approvalBusy }) => {
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

  const toggleTool = (idx: number) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const isUser = msg.role === 'user';

  return (
    <div className={`ai-bubble-wrap ${isUser ? 'ai-bubble-wrap--user' : ''}`}>
      {/* Avatar */}
      <div className={`ai-avatar ${isUser ? 'ai-avatar--user' : ''}`}>
        {isUser ? <User size={15} /> : <Bot size={15} />}
      </div>

      <div className="ai-bubble-content">
        {/* Thinking / tool events (assistant only) */}
        {!isUser && msg.events && msg.events.length > 0 && (
          <div className="ai-events">
            {msg.events.map((ev, i) => {
              if (ev.type === 'thinking') {
                return <ThinkingIndicator key={i} text={ev.text ?? 'Thinking…'} />;
              }
              if (ev.type === 'intent') {
                const col = WORKFLOW_COLORS[ev.intent ?? ''] ?? '#4F8A70';
                return (
                  <div key={i} className="ai-intent-badge" style={{ borderColor: col, color: col }}>
                    <Brain size={11} /> {ev.intent?.replace(/_/g, ' ')}
                  </div>
                );
              }
              if (ev.type === 'tool_call' || ev.type === 'tool_result') {
                return (
                  <ToolCallRow
                    key={i}
                    event={ev}
                    expanded={expandedTools.has(i)}
                    onToggle={() => toggleTool(i)}
                  />
                );
              }
              return null;
            })}
          </div>
        )}

        {/* Main text */}
        {msg.content && (
          <div className={`ai-bubble ${isUser ? 'ai-bubble--user' : 'ai-bubble--ai'}`}>
            <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{msg.content}</p>
          </div>
        )}

        {/* Interactive Guided Workflow Card */}
        {msg.guidedWorkflow && (
          <div className="ai-guided-wf-card">
            <div className="ai-guided-wf-header">
              <div className="ai-guided-wf-title">
                <Sparkles size={16} />
                <span>{msg.guidedWorkflow.title || 'Interactive Guided Workflow'}</span>
              </div>
              <span className="ai-guided-wf-badge">
                {msg.guidedWorkflow.steps.length} Steps
              </span>
            </div>
            <p className="ai-guided-wf-desc">
              {msg.guidedWorkflow.description || 'Step-by-step interactive navigation with animated cursor and spotlight.'}
            </p>
            <div className="ai-guided-wf-steps-preview">
              {msg.guidedWorkflow.steps.slice(0, 3).map((s: { instruction?: string; action?: string }, idx: number) => (
                <span key={idx} className="ai-guided-wf-step-item">
                  {idx + 1}. {s.instruction || s.action}
                </span>
              ))}
              {msg.guidedWorkflow.steps.length > 3 && (
                <span className="ai-guided-wf-step-item">
                  ... and {msg.guidedWorkflow.steps.length - 3} more steps
                </span>
              )}
            </div>
            <button
              type="button"
              className="ai-guided-wf-launch-btn"
              onClick={() => onStartGuidedWorkflow(msg.guidedWorkflow!)}
            >
              <Zap size={16} />
              <span>Start Interactive Guidance</span>
            </button>
          </div>
        )}

        {/* Streaming indicator */}
        {msg.isStreaming && !msg.content && (
          <div className="ai-bubble ai-bubble--ai">
            <ThinkingIndicator text="Working…" />
          </div>
        )}

        {/* Approval proposal */}
        {msg.proposal && (
          <ProposalCard
            proposal={msg.proposal}
            onApprove={onApprove}
            onReject={onReject}
            busy={approvalBusy}
          />
        )}

        <span className="ai-ts">
          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

// ─── History sidebar item ─────────────────────────────────────────────────────

const HistoryItem: React.FC<{ wf: AiWorkflowSummary }> = ({ wf }) => {
  const statusIcon = wf.status === 'COMPLETED' ? '✅'
    : wf.status === 'REJECTED'    ? '❌'
    : wf.status === 'AWAITING_APPROVAL' ? '⏳'
    : '🔄';

  return (
    <div className="ai-history-item">
      <div className="ai-history-type">{statusIcon} {wf.workflowType}</div>
      <div className="ai-history-meta">
        <Clock size={10} /> {new Date(wf.startedAt).toLocaleDateString()}
        {' · '}{wf.stepCount} steps
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export const AiAssistantChat: React.FC = () => {
  const { user } = useAuth();
  const { startWorkflow } = useGuidedWorkflow();
  const [messages,      setMessages]     = useState<AiChatMessage[]>([]);
  const [input,         setInput]        = useState('');
  const [streaming,     setStreaming]    = useState(false);
  const [approvalBusy,  setApprovalBusy] = useState(false);
  const [workflows,     setWorkflows]    = useState<AiWorkflowSummary[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  const handleStartGuided = useCallback((gw: AiGuidedWorkflowPayload) => {
    void startWorkflow(gw.workflow_type, gw.steps, gw.title, gw.description);
  }, [startWorkflow]);

  // ── Load workflow history ──────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const token = getStoredToken();
      const r = await fetch(`${API}/api/ai/workflows`, {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      if (r.ok) setWorkflows(await r.json() as AiWorkflowSummary[]);
    } catch {
      // history load failure is non-critical
    }
  }, []);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  // ── Auto-scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ── Send message ───────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || streaming) return;

    const userMsg: AiChatMessage = {
      id:        crypto.randomUUID(),
      role:      'user',
      content:   text.trim(),
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    const assistantMsg: AiChatMessage = {
      id:          assistantId,
      role:        'assistant',
      content:     '',
      timestamp:   new Date(),
      events:      [],
      isStreaming: true,
    };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setInput('');
    setStreaming(true);

    try {
      const token = getStoredToken();
      const resp = await fetch(`${API}/api/ai/chat`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ message: text.trim() }),
      });

      if (!resp.ok || !resp.body) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';
      let   finalText = '';
      let   proposal: AiProposal | undefined;
      let   guidedWorkflow: AiGuidedWorkflowPayload | undefined;
      let   workflowId: string | undefined;
      const collectedEvents: AiEvent[] = [];

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
            if (ev.type === 'approval_required' && ev.proposal) {
              proposal   = ev.proposal;
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

            // Update assistant message incrementally
            setMessages(prev => prev.map(m =>
              m.id !== assistantId ? m : {
                ...m,
                content:        finalText,
                events:         [...collectedEvents],
                proposal,
                guidedWorkflow,
                workflowId,
                isStreaming:    ev.type !== 'done',
              }
            ));
          } catch {
            // malformed SSE line — skip
          }
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Request failed.';
      setMessages(prev => prev.map(m =>
        m.id !== assistantId ? m : {
          ...m,
          content:     `❌ Error: ${errMsg}`,
          isStreaming: false,
        }
      ));
    } finally {
      setStreaming(false);
      void loadHistory();
    }
  }, [streaming, loadHistory]);

  // ── Approve workflow ───────────────────────────────────────────────────────
  const handleApprove = async (workflowId: string) => {
    setApprovalBusy(true);
    try {
      const token = getStoredToken();
      const r = await fetch(`${API}/api/ai/workflows/${workflowId}/approve`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ decision: 'APPROVED', comment: 'Approved via AI Assistant' }),
      });
      const data = await r.json() as { message?: string };
      const confirmMsg: AiChatMessage = {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   `✅ Approved! ${data.message ?? ''}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, confirmMsg]);
      void loadHistory();
    } catch {
      const errMsg: AiChatMessage = {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   '❌ Approval failed. Please try again.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setApprovalBusy(false);
    }
  };

  const handleReject = async (workflowId: string) => {
    setApprovalBusy(true);
    try {
      const token = getStoredToken();
      await fetch(`${API}/api/ai/workflows/${workflowId}/approve`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ decision: 'REJECTED', comment: 'Rejected via AI Assistant' }),
      });
      const rejectMsg: AiChatMessage = {
        id:        crypto.randomUUID(),
        role:      'assistant',
        content:   '🚫 Proposal rejected. No changes were made.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, rejectMsg]);
      void loadHistory();
    } finally {
      setApprovalBusy(false);
    }
  };

  // ── Keyboard handler ───────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="ai-chat-root view-container">
      {/* ── Header ── */}
      <div className="hub-hero" style={{ marginBottom: '1rem' }}>
        <div className="hub-hero-text">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Sparkles size={20} className="text-accent" />
            Savory Assistant
          </h2>
          <p>
            Your kitchen &amp; inventory helper · Logged in as {user?.fullName || 'User'} ({user?.role?.replace(/_/g, ' ')})
          </p>
        </div>
      </div>

      {/* ── Body: sidebar + chat ── */}
      <div className="ai-layout">

        {/* ── LEFT Sidebar ── */}
        <aside className="ai-sidebar">
          <div className="ai-sidebar-section">
            <p className="ai-sidebar-label">Quick Actions</p>
            {QUICK_ACTIONS.map(qa => (
              <button
                key={qa.label}
                type="button"
                className="ai-quick-btn"
                disabled={streaming}
                onClick={() => void sendMessage(qa.message)}
                style={{ '--qa-color': qa.color } as React.CSSProperties}
              >
                <qa.icon size={14} style={{ color: qa.color }} />
                {qa.label}
              </button>
            ))}
          </div>

          <div className="ai-sidebar-section" style={{ flex: 1, overflowY: 'auto' }}>
            <p className="ai-sidebar-label">
              <Clock size={11} /> Workflow History
            </p>
            {workflows.length === 0 ? (
              <p className="text-muted text-xs" style={{ padding: '0.5rem 0' }}>
                No workflows yet
              </p>
            ) : (
              workflows.map(wf => <HistoryItem key={wf.id} wf={wf} />)
            )}
          </div>
        </aside>

        {/* ── RIGHT Chat area ── */}
        <div className="ai-chat-panel">
          {/* Messages */}
          <div className="ai-messages">
            {messages.length === 0 && (
              <div className="ai-empty-state">
                <Bot size={44} style={{ opacity: 0.35, color: '#4F8A70' }} />
                <h4 style={{ marginTop: '0.75rem', fontWeight: 600 }}>Savory Assistant Ready</h4>
                <p className="text-muted text-sm" style={{ marginTop: '0.25rem' }}>
                  Ask me about pantry stock levels, expiring batches, recommended purchases, or sales and waste logs.
                </p>
                <div className="ai-capabilities">
                  {[
                    { icon: PackageSearch, label: 'Low-Stock Replenishment',    color: '#C99A45' },
                    { icon: AlertTriangle, label: 'Anomaly Investigation',      color: '#B85445' },
                    { icon: Settings2,     label: 'Inventory Optimization',     color: '#173F35' },
                    { icon: ShieldAlert,   label: 'Emergency Shortage Response', color: '#B85445' },
                    { icon: TrendingUp,    label: 'Sales Performance',          color: '#4F8A70' },
                    { icon: PackageSearch, label: 'Ingredient Consumption',      color: '#2A6F97' },
                    { icon: AlertTriangle, label: 'Waste Analysis',              color: '#C99A45' },
                    { icon: Sparkles,      label: 'FEFO Traceability Audit',     color: '#173F35' },
                  ].map(c => (
                    <div key={c.label} className="ai-cap-item" style={{ '--cap-color': c.color } as React.CSSProperties}>
                      <c.icon size={16} style={{ color: c.color }} />
                      <span>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.map(msg => (
              <ChatBubble
                key={msg.id}
                msg={msg}
                onApprove={(id) => void handleApprove(id)}
                onReject={(id)  => void handleReject(id)}
                onStartGuidedWorkflow={handleStartGuided}
                approvalBusy={approvalBusy}
              />
            ))}

            <div ref={bottomRef} />
          </div>

          {/* Input bar */}
          <div className="ai-input-bar">
            <textarea
              ref={inputRef}
              id="ai-chat-input"
              className="ai-input"
              rows={1}
              placeholder="Ask about stock levels, anomalies, optimization, emergencies…"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={streaming}
            />
            <button
              id="ai-chat-send"
              type="button"
              className="ai-send-btn btn-primary"
              disabled={!input.trim() || streaming}
              onClick={() => void sendMessage(input)}
            >
              {streaming
                ? <span className="spin" style={{ display: 'inline-block' }}>⚙️</span>
                : <Send size={17} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
