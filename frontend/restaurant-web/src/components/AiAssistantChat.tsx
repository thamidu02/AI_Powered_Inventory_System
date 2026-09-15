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
import type {
  AiChatMessage,
  AiEvent,
  AiProposal,
  AiWorkflowSummary,
} from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const API = 'http://localhost:5066';

const QUICK_ACTIONS = [
  { label: 'Check Low Stock',       icon: PackageSearch, color: '#f59e0b', message: 'Check for low stock ingredients that need replenishment' },
  { label: 'Investigate Anomaly',   icon: AlertTriangle, color: '#ef4444', message: 'Investigate stock discrepancies and anomalies across all ingredients' },
  { label: 'Optimize Levels',       icon: TrendingUp,   color: '#8b5cf6', message: 'Analyze and optimize reorder levels based on 90-day consumption history' },
  { label: 'Emergency Shortage',    icon: ShieldAlert,  color: '#ec4899', message: 'Emergency — we have critically low stock on a key ingredient' },
];

const WORKFLOW_COLORS: Record<string, string> = {
  LOW_STOCK_REPLENISHMENT: '#f59e0b',
  ANOMALY_INVESTIGATION:   '#ef4444',
  INVENTORY_OPTIMIZATION:  '#8b5cf6',
  EMERGENCY_SHORTAGE:      '#ec4899',
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
  approvalBusy: boolean;
}> = ({ msg, onApprove, onReject, approvalBusy }) => {
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
                const col = WORKFLOW_COLORS[ev.intent ?? ''] ?? '#6366f1';
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
  const [messages,      setMessages]     = useState<AiChatMessage[]>([]);
  const [input,         setInput]        = useState('');
  const [streaming,     setStreaming]    = useState(false);
  const [approvalBusy,  setApprovalBusy] = useState(false);
  const [workflows,     setWorkflows]    = useState<AiWorkflowSummary[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

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

            // Update assistant message incrementally
            setMessages(prev => prev.map(m =>
              m.id !== assistantId ? m : {
                ...m,
                content:     finalText,
                events:      [...collectedEvents],
                proposal,
                workflowId,
                isStreaming: ev.type !== 'done',
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
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={22} className="text-accent" />
            Inventory AI Assistant
          </h2>
          <p>
            Powered by Gemini 2.0 Flash · {user?.role} · 4 intelligent workflows available
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
                <Bot size={44} style={{ opacity: 0.25 }} />
                <p className="text-muted" style={{ marginTop: '0.75rem' }}>
                  Ask me about your inventory or tap a Quick Action to get started.
                </p>
                <div className="ai-capabilities">
                  {[
                    { icon: PackageSearch, label: 'Low-Stock Replenishment',     color: '#f59e0b' },
                    { icon: AlertTriangle, label: 'Anomaly Investigation',        color: '#ef4444' },
                    { icon: Settings2,    label: 'Inventory Optimization',        color: '#8b5cf6' },
                    { icon: Zap,          label: 'Emergency Shortage Response',   color: '#ec4899' },
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
