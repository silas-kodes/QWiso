/**
 * Dataset and number management routes
 */

import { Router } from 'express';
import { z } from 'zod';
import {
  createDataset,
  getDataset,
  getAllDatasets,
  deleteDataset,
  createNumbersBatch,
  getNumbersByDataset,
  getNumbersCountByDataset,
  resetDatasetValidationStatus,
  isNumberBlacklisted,
} from '../db/queries.js';
import { generateNumbers, getCountryOptions } from '../qwiso/generator.js';
import { createJob } from '../db/queries.js';

const router = Router();

// Get all countries
router.get('/countries', (_req, res) => {
  res.json(getCountryOptions());
});

// Get all datasets
router.get('/', (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const datasets = getAllDatasets(limit, 0);
  // Parse options_json for each and include counts
  const parsed = datasets.map(d => ({
    ...d,
    options: d.options_json ? JSON.parse(d.options_json) : null,
    counts: getNumbersCountByDataset(d.id),
  }));
  res.json(parsed);
});

// Get single dataset with counts
router.get('/:id', (req, res) => {
  const dataset = getDataset(req.params.id);
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  const counts = getNumbersCountByDataset(dataset.id);
  
  res.json({
    ...dataset,
    options: dataset.options_json ? JSON.parse(dataset.options_json) : null,
    counts,
  });
});

// Generate new dataset
const generateSchema = z.object({
  countryIndex: z.number().int().min(0),
  quantity: z.number().int().min(1).max(10000),
  useDial: z.boolean().default(true),
  useSpaces: z.boolean().default(false),
  localOnly: z.boolean().default(false),
});

router.post('/generate', (req, res) => {
  const parse = generateSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid request', details: parse.error.errors });
    return;
  }

  const options = parse.data;
  const countries = getCountryOptions();
  
  if (options.countryIndex >= countries.length) {
    res.status(400).json({ error: 'Invalid country index' });
    return;
  }

  const country = countries[options.countryIndex];

  try {
    // Generate numbers, passing isNumberBlacklisted to filter out globally dead numbers
    const generated = generateNumbers(options, isNumberBlacklisted);
    
    // Create dataset
    const datasetId = createDataset(
      `${country.flag} ${country.name} - ${options.quantity} numbers`,
      country.code,
      country.name,
      country.dial,
      options.quantity,
      options
    );

    // Store numbers
    const numbersToStore = generated.map(n => ({
      digits: n.digits,
      rawFormat: n.raw,
      displayFormat: n.display,
    }));
    
    createNumbersBatch(datasetId, numbersToStore);

    // Create generate job record
    const jobId = createJob('generate', datasetId, {
      ...options,
      generatedCount: generated.length,
    });

    res.status(201).json({
      datasetId,
      jobId,
      count: generated.length,
      country: {
        name: country.name,
        code: country.code,
        dial: country.dial,
        flag: country.flag,
      },
    });
  } catch (err) {
    console.error('[API] Generate error:', err);
    res.status(500).json({ 
      error: 'Generation failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
});

// Get numbers in dataset
router.get('/:id/numbers', (req, res) => {
  const { id } = req.params;
  const { status, limit = '1000', offset = '0' } = req.query;
  
  const numbers = getNumbersByDataset(
    id,
    status as string | undefined,
    parseInt(limit as string),
    parseInt(offset as string)
  );

  res.json(numbers);
});

// Delete dataset
router.delete('/:id', (req, res) => {
  const { id } = req.params;
  const dataset = getDataset(id);
  
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  const deleted = deleteDataset(id);
  res.json({ success: deleted });
});

// Reset validation status
router.post('/:id/reset', (req, res) => {
  const { id } = req.params;
  const dataset = getDataset(id);
  
  if (!dataset) {
    res.status(404).json({ error: 'Dataset not found' });
    return;
  }

  resetDatasetValidationStatus(id);
  res.json({ success: true, message: 'Validation status reset' });
});

export default router;
