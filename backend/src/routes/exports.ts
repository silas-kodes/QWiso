/**
 * Export routes for datasets and validation results
 */

import { Router } from 'express';
import { getDataset, getNumbersByDataset, getValidNumbersByDataset } from '../db/queries.js';

const router = Router();

// Export dataset as CSV
router.get('/dataset/:id/csv', (req, res) => {
  const { id } = req.params;
  const { status } = req.query;
  
  const dataset = getDataset(id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  // Get numbers (max 10000 for export)
  const numbers = getNumbersByDataset(id, status as string | undefined, 10000, 0);

  // Generate CSV
  const headers = ['digits', 'display_format', 'wa_status', 'recipient_group', 'wa_checked_at', 'wa_error'];
  const rows = numbers.map(n => [
    n.digits,
    n.display_format,
    n.wa_status,
    n.recipient_group,
    n.wa_checked_at ? new Date(n.wa_checked_at * 1000).toISOString() : '',
    n.wa_error || '',
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(field => `"${String(field).replace(/"/g, '\\"')}"`).join(',')),
  ].join('\n');

  const filename = `qwiso_${dataset.country_code}_${id.slice(0, 8)}.csv`;
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

// Export valid numbers as plain text
router.get('/dataset/:id/valid', (req, res) => {
  const { id } = req.params;
  const { format = 'raw' } = req.query; // 'raw' or 'display'
  
  const dataset = getDataset(id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  const numbers = getValidNumbersByDataset(id);
  
  const lines = numbers.map(n => 
    format === 'display' ? n.display_format : n.raw_format
  );

  const filename = `valid_numbers_${dataset.country_code}_${id.slice(0, 8)}.txt`;
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
});

// Export invalid numbers as plain text
router.get('/dataset/:id/invalid', (req, res) => {
  const { id } = req.params;
  const { format = 'raw' } = req.query;
  
  const dataset = getDataset(id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  const numbers = getNumbersByDataset(id, 'invalid', 10000, 0);
  
  const lines = numbers.map(n => 
    format === 'display' ? n.display_format : n.raw_format
  );

  const filename = `invalid_numbers_${dataset.country_code}_${id.slice(0, 8)}.txt`;
  
  res.setHeader('Content-Type', 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\n'));
});

// Export all as VCF (vCard) for contact import
router.get('/dataset/:id/contacts', (req, res) => {
  const { id } = req.params;
  
  const dataset = getDataset(id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  // Only export verified campaign numbers as contacts.
  const numbers = getValidNumbersByDataset(id);
  
  const vcards = numbers.map((n, i) => {
    return [
      'BEGIN:VCARD',
      'VERSION:3.0',
      `FN:Contact ${i + 1} (${n.digits})`,
      `TEL;TYPE=CELL:${n.digits}`,
      'END:VCARD',
    ].join('\n');
  });

  const filename = `contacts_${dataset.country_code}_${id.slice(0, 8)}.vcf`;
  
  res.setHeader('Content-Type', 'text/vcard');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(vcards.join('\n\n'));
});

export default router;
