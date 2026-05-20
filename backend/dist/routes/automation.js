import { Router } from 'express';
import { getAutomationRules, createAutomationRule, updateAutomationRule, deleteAutomationRule } from '../db/queries.js';
const router = Router();
// Get all rules
router.get('/', (_req, res) => {
    try {
        const rules = getAutomationRules();
        res.json(rules);
    }
    catch (error) {
        console.error('Error fetching automation rules:', error);
        res.status(500).json({ error: 'Failed to fetch automation rules' });
    }
});
// Create a rule
router.post('/', (req, res) => {
    try {
        const { name, trigger_type, keyword, response_text, typing_delay, webhook_url, is_active } = req.body;
        if (!name || !trigger_type || !keyword || !response_text) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }
        const id = createAutomationRule({
            name,
            trigger_type,
            keyword,
            response_text,
            typing_delay: Number(typing_delay) || 0,
            webhook_url: webhook_url || null,
            is_active: is_active ?? true
        });
        res.status(201).json({ id, message: 'Rule created successfully' });
    }
    catch (error) {
        console.error('Error creating automation rule:', error);
        res.status(500).json({ error: 'Failed to create automation rule' });
    }
});
// Update a rule
router.put('/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        updateAutomationRule(id, updates);
        res.json({ message: 'Rule updated successfully' });
    }
    catch (error) {
        console.error('Error updating automation rule:', error);
        res.status(500).json({ error: 'Failed to update automation rule' });
    }
});
// Delete a rule
router.delete('/:id', (req, res) => {
    try {
        const { id } = req.params;
        deleteAutomationRule(id);
        res.json({ message: 'Rule deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting automation rule:', error);
        res.status(500).json({ error: 'Failed to delete automation rule' });
    }
});
export const automationRoutes = router;
//# sourceMappingURL=automation.js.map