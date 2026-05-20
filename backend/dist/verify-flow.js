/**
 * QWISO End-to-End Generator & Validator Verification Script
 */
import { generateNumbers } from './qwiso/generator.js';
import { createDataset, createNumbersBatch, getNumbersForValidation, updateNumberStatus, getNumbersCountByDataset } from './db/queries.js';
async function runVerification() {
    console.log("======================================================================");
    console.log("⚡ QWISO GENERATOR & VALIDATOR INTEGRATION VERIFICATION FLOW ⚡");
    console.log("======================================================================\n");
    // Step 1: Test Generator
    console.log("--- 📦 Step 1: Testing Generator Uniqueness ---");
    const options = {
        countryIndex: 0, // US/Canada or first country
        quantity: 50,
        useDial: true,
        useSpaces: false,
        localOnly: false
    };
    const generated = generateNumbers(options);
    console.log(`✅ Successfully generated ${generated.length} phone numbers.`);
    const digitsOnly = generated.map(n => n.digits);
    const uniqueDigits = new Set(digitsOnly);
    console.log(`📊 Total Generated Digits: ${digitsOnly.length}`);
    console.log(`📊 Unique Generated Digits: ${uniqueDigits.size}`);
    if (digitsOnly.length === uniqueDigits.size) {
        console.log("🎉 SUCCESS: Generator outputted 100% unique numbers in memory!");
    }
    else {
        throw new Error("🚨 FAILURE: Generator outputted duplicate numbers!");
    }
    // Step 2: Database Persistence
    console.log("\n--- 💾 Step 2: Testing Database Insertion ---");
    const datasetId = createDataset("🧪 Integration Test Verification Dataset", "US", "United States", "+1", options.quantity, options);
    console.log(`✅ Created test dataset with ID: ${datasetId}`);
    const numbersToStore = generated.map(n => ({
        digits: n.digits,
        rawFormat: n.raw,
        displayFormat: n.display,
    }));
    const insertedCount = createNumbersBatch(datasetId, numbersToStore);
    console.log(`✅ Stored ${insertedCount} numbers in the SQLite database.`);
    const countsBefore = getNumbersCountByDataset(datasetId);
    console.log(`📊 Initial DB Counts:`, countsBefore);
    if (countsBefore && countsBefore.pending === options.quantity) {
        console.log("🎉 SUCCESS: All generated numbers inserted and initialized in 'pending' state.");
    }
    else {
        throw new Error(`🚨 FAILURE: Expected ${options.quantity} pending numbers, found: ${countsBefore?.pending}`);
    }
    // Step 3: Validator Query & Loop Prevention
    console.log("\n--- 🔄 Step 3: Testing Validator Batching & Duplicate Loop Prevention ---");
    const batchSize = 10;
    console.log(`📊 Simulating validation loop in batches of ${batchSize}...`);
    // We will run validation iterations and track processed ids
    const processedIds = [];
    // 1st Batch
    console.log("\n--- Batch 1 ---");
    const batch1 = getNumbersForValidation(datasetId, batchSize, processedIds);
    console.log(`👉 Fetched ${batch1.length} numbers for validation.`);
    if (batch1.length !== batchSize) {
        throw new Error(`🚨 FAILURE: Expected to fetch ${batchSize} numbers, got ${batch1.length}`);
    }
    // Mark all fetched in Batch 1 as processed
    let batch1InvalidCount = 0;
    let batch1ValidCount = 0;
    batch1.forEach(num => {
        processedIds.push(num.id);
        // Simulate updating half as valid, half as invalid
        const status = Math.random() > 0.5 ? 'valid' : 'invalid';
        if (status === 'invalid')
            batch1InvalidCount++;
        else
            batch1ValidCount++;
        updateNumberStatus(num.id, status);
    });
    console.log(`✅ Processed & updated statuses for Batch 1 in DB (Valid: ${batch1ValidCount}, Invalid: ${batch1InvalidCount}).`);
    console.log(`📊 Tracked ${processedIds.length} processed IDs in-memory.`);
    // 2nd Batch
    console.log("\n--- Batch 2 ---");
    const batch2 = getNumbersForValidation(datasetId, batchSize, processedIds);
    console.log(`👉 Fetched ${batch2.length} numbers for validation.`);
    if (batch2.length !== batchSize) {
        throw new Error(`🚨 FAILURE: Expected to fetch ${batchSize} numbers, got ${batch2.length}`);
    }
    // Assert Batch 2 doesn't contain any IDs from Batch 1
    const overlaps = batch2.filter(num => processedIds.includes(num.id));
    if (overlaps.length > 0) {
        throw new Error(`🚨 FAILURE: Duplicate loop detected! Batch 2 returned ${overlaps.length} numbers already processed in Batch 1!`);
    }
    console.log("🎉 SUCCESS: No duplicate numbers fetched in Batch 2!");
    batch2.forEach(num => {
        processedIds.push(num.id);
        updateNumberStatus(num.id, 'valid');
    });
    console.log(`✅ Processed & updated statuses for Batch 2 in DB.`);
    console.log(`📊 Tracked ${processedIds.length} processed IDs in-memory.`);
    // Step 4: Interrupted & Resumed Job Simulation
    console.log("\n--- 🔌 Step 4: Simulating Stopped & Resumed Validation ---");
    console.log("Checking if remaining pending count in DB is correct before resuming...");
    const countsMiddle = getNumbersCountByDataset(datasetId);
    console.log(`📊 DB Counts:`, countsMiddle);
    const expectedTotal = options.quantity;
    const expectedValid = batch1ValidCount + batch2.length;
    const expectedInvalid = batch1InvalidCount;
    if (countsMiddle &&
        countsMiddle.total === expectedTotal &&
        countsMiddle.valid === expectedValid &&
        countsMiddle.invalid === expectedInvalid) {
        console.log(`🎉 SUCCESS: Verified that invalid numbers are retained. DB counts matches expectations exactly.`);
    }
    else {
        throw new Error(`🚨 FAILURE: Mismatched counts in database! Expected total: ${expectedTotal}, got: ${countsMiddle?.total}. Expected valid: ${expectedValid}, got: ${countsMiddle?.valid}. Expected invalid: ${expectedInvalid}, got: ${countsMiddle?.invalid}`);
    }
    // Remaining pending should be: Total (50) - Batch 1 (10) - Batch 2 (10) = 30
    if (countsMiddle && countsMiddle.pending === 30) {
        console.log("🎉 SUCCESS: Correct pending count of 30 remaining in the database.");
    }
    else {
        throw new Error(`🚨 FAILURE: Expected 30 pending numbers, found: ${countsMiddle?.pending}`);
    }
    console.log("Resuming a NEW validation job instance (clearing in-memory processedIds)...");
    const resumedProcessedIds = []; // empty, representing a fresh process boot
    const resumedBatch = getNumbersForValidation(datasetId, batchSize, resumedProcessedIds);
    console.log(`👉 Resumed fetch returned ${resumedBatch.length} pending numbers.`);
    if (resumedBatch.length !== batchSize) {
        throw new Error(`🚨 FAILURE: Resumed batch expected ${batchSize} numbers, got ${resumedBatch.length}`);
    }
    // Ensure NONE of the resumed batch has been previously processed (i.e. status is 'pending')
    const previouslyProcessed = resumedBatch.filter(num => num.wa_status !== 'pending');
    if (previouslyProcessed.length > 0) {
        throw new Error("🚨 FAILURE: Resumed batch fetched already validated numbers!");
    }
    console.log("🎉 SUCCESS: Resumed validation correctly picks up exactly where it left off, fetching ONLY pending numbers without any duplicate processing!");
    console.log("\n======================================================================");
    console.log("🚀 ALL INTEGRATION CHECKS PASSED SUCCESSFULLY! ZERO LOOP ISSUES DETECTED!");
    console.log("======================================================================");
}
runVerification().catch(err => {
    console.error("🚨 VERIFICATION FAILED:", err);
    process.exit(1);
});
//# sourceMappingURL=verify-flow.js.map