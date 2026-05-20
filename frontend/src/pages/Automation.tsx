import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bot, Plus, Trash2, Edit2, Play, Square, MessageSquareText } from 'lucide-react';
import { useAuthStore } from '../stores/auth';

interface AutomationRule {
  id: string;
  name: string;
  trigger_type: 'exact' | 'contains' | 'regex';
  keyword: string;
  response_text: string;
  typing_delay: number;
  webhook_url: string | null;
  is_active: boolean;
}

export function Automation() {
  const { token } = useAuthStore();
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<'exact' | 'contains' | 'regex'>('contains');
  const [keyword, setKeyword] = useState('');
  const [responseText, setResponseText] = useState('');
  const [typingDelay, setTypingDelay] = useState<number>(0);
  const [webhookUrl, setWebhookUrl] = useState('');

  const fetchRules = async () => {
    try {
      const res = await fetch('/api/automation', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRules(data);
      }
    } catch (err) {
      console.error('Failed to fetch rules', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, [token]);

  const openNewModal = () => {
    setEditingRule(null);
    setName('');
    setTriggerType('contains');
    setKeyword('');
    setResponseText('');
    setTypingDelay(0);
    setWebhookUrl('');
    setIsModalOpen(true);
  };

  const openEditModal = (rule: AutomationRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setTriggerType(rule.trigger_type);
    setKeyword(rule.keyword);
    setResponseText(rule.response_text);
    setTypingDelay(rule.typing_delay || 0);
    setWebhookUrl(rule.webhook_url || '');
    setIsModalOpen(true);
  };

  const saveRule = async () => {
    const payload = { 
      name, 
      trigger_type: triggerType, 
      keyword, 
      response_text: responseText,
      typing_delay: Number(typingDelay) || 0,
      webhook_url: webhookUrl || null
    };
    
    try {
      if (editingRule) {
        await fetch(`/api/automation/${editingRule.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch('/api/automation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
      }
      setIsModalOpen(false);
      fetchRules();
    } catch (err) {
      console.error('Failed to save rule', err);
    }
  };

  const toggleRule = async (rule: AutomationRule) => {
    try {
      await fetch(`/api/automation/${rule.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_active: !rule.is_active })
      });
      fetchRules();
    } catch (err) {
      console.error('Failed to toggle rule', err);
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    try {
      await fetch(`/api/automation/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchRules();
    } catch (err) {
      console.error('Failed to delete rule', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="w-6 h-6 text-pf-accent" />
            Automation
          </h1>
          <p className="text-pf-text-muted mt-1">Native Whatomate-like auto-responders for your WhatsApp accounts.</p>
        </div>
        <button
          onClick={openNewModal}
          className="bg-pf-accent hover:bg-pf-accent-hover text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 shadow-lg shadow-pf-accent/20"
        >
          <Plus className="w-4 h-4" />
          New Rule
        </button>
      </div>

      {/* Rules List */}
      <div className="grid gap-4">
        {loading ? (
          <div className="text-pf-text-muted text-center py-8">Loading rules...</div>
        ) : rules.length === 0 ? (
          <div className="glass-panel rounded-xl p-8 text-center">
            <MessageSquareText className="w-12 h-12 text-pf-muted mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-1">No Automation Rules</h3>
            <p className="text-pf-text-muted">Create your first rule to automatically reply to incoming WhatsApp messages.</p>
          </div>
        ) : (
          rules.map((rule, idx) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`glass-panel rounded-xl p-4 flex items-center justify-between border-l-4 ${
                rule.is_active ? 'border-l-pf-accent' : 'border-l-pf-muted'
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-white font-medium">{rule.name}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold tracking-wide ${
                    rule.is_active ? 'bg-pf-accent/10 text-pf-accent' : 'bg-pf-muted/10 text-pf-muted'
                  }`}>
                    {rule.is_active ? 'Active' : 'Paused'}
                  </span>
                </div>
                <div className="text-sm text-pf-text-muted flex items-center flex-wrap gap-2">
                  <span className="text-pf-text bg-white/5 px-2 py-0.5 rounded text-xs font-mono">
                    {rule.trigger_type === 'exact' ? 'Exact Match' : rule.trigger_type === 'regex' ? 'Regex Match' : 'Contains'}
                  </span>
                  <span>"{rule.keyword}"</span>
                  {rule.typing_delay > 0 && (
                    <span className="bg-pf-info/10 text-pf-info text-xs px-2 py-0.5 rounded">
                      ⏳ {rule.typing_delay}s Delay
                    </span>
                  )}
                  {rule.webhook_url && (
                    <span className="bg-pf-success/10 text-pf-success text-xs px-2 py-0.5 rounded" title={rule.webhook_url}>
                      🔗 Webhook Active
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-pf-text-muted border-l-2 border-pf-muted/30 pl-3 italic">
                  {rule.response_text}
                </div>
              </div>

              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={() => toggleRule(rule)}
                  className={`p-2 rounded-lg transition-colors ${
                    rule.is_active 
                      ? 'text-pf-danger hover:bg-pf-danger/10' 
                      : 'text-pf-accent hover:bg-pf-accent/10'
                  }`}
                  title={rule.is_active ? 'Pause Rule' : 'Activate Rule'}
                >
                  {rule.is_active ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => openEditModal(rule)}
                  className="p-2 text-pf-text-muted hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => deleteRule(rule.id)}
                  className="p-2 text-pf-text-muted hover:text-pf-danger hover:bg-pf-danger/10 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel w-full max-w-md rounded-2xl overflow-hidden shadow-2xl shadow-black/50"
          >
            <div className="p-6 border-b border-white/10">
              <h2 className="text-xl font-bold text-white">
                {editingRule ? 'Edit Rule' : 'New Automation Rule'}
              </h2>
            </div>
            
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-pf-text-muted mb-1">Rule Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Pricing Auto-Reply"
                  className="w-full bg-pf-surface border border-white/10 rounded-lg px-4 py-2 text-white focus:border-pf-accent focus:ring-1 focus:ring-pf-accent outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-pf-text-muted mb-1">Trigger Type</label>
                  <select
                    value={triggerType}
                    onChange={(e) => setTriggerType(e.target.value as 'exact' | 'contains' | 'regex')}
                    className="w-full bg-pf-surface border border-white/10 rounded-lg px-4 py-2 text-white focus:border-pf-accent focus:ring-1 focus:ring-pf-accent outline-none transition-all"
                  >
                    <option value="contains">Message Contains</option>
                    <option value="exact">Exact Match</option>
                    <option value="regex">Regex Match</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-pf-text-muted mb-1">Keyword / Pattern</label>
                  <input
                    type="text"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    placeholder={triggerType === 'regex' ? 'e.g. ^(hi|hello)' : 'e.g. price'}
                    className="w-full bg-pf-surface border border-white/10 rounded-lg px-4 py-2 text-white focus:border-pf-accent focus:ring-1 focus:ring-pf-accent outline-none transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-pf-text-muted mb-1">Simulated Typing (seconds)</label>
                  <input
                    type="number"
                    min="0"
                    max="30"
                    value={typingDelay}
                    onChange={(e) => setTypingDelay(Number(e.target.value))}
                    placeholder="0"
                    className="w-full bg-pf-surface border border-white/10 rounded-lg px-4 py-2 text-white focus:border-pf-accent focus:ring-1 focus:ring-pf-accent outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-pf-text-muted mb-1">Webhook URL (Optional)</label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://zapier.com/hooks/..."
                    className="w-full bg-pf-surface border border-white/10 rounded-lg px-4 py-2 text-white focus:border-pf-accent focus:ring-1 focus:ring-pf-accent outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-sm font-medium text-pf-text-muted">Response Text</label>
                  <span className="text-[10px] text-pf-accent font-medium">Use {"{name}"} or {"{phone}"} to personalize</span>
                </div>
                <textarea
                  value={responseText}
                  onChange={(e) => setResponseText(e.target.value)}
                  placeholder="Hello {name}, the price is $10/mo..."
                  rows={3}
                  className="w-full bg-pf-surface border border-white/10 rounded-lg px-4 py-2 text-white focus:border-pf-accent focus:ring-1 focus:ring-pf-accent outline-none transition-all resize-none"
                />
              </div>
            </div>

            <div className="p-6 border-t border-white/10 flex justify-end gap-3 bg-black/20">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 text-pf-text-muted hover:text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveRule}
                disabled={!name || !keyword || !responseText}
                className="bg-pf-accent hover:bg-pf-accent-hover disabled:opacity-50 disabled:hover:bg-pf-accent text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                Save Rule
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
