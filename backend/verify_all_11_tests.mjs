// verify_all_11_tests.mjs
// Automated verification script for the 11 inventory business logic scenarios + RBAC

const BASE_URL = 'http://localhost:5066';
const PASSWORD = 'Restaurant@123';

async function login(email) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} - ${err}`);
  }
  const data = await res.json();
  return data.token;
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  [PASS] ${message}`);
    passedCount++;
  } else {
    console.error(`  [FAIL] ${message}`);
    failedCount++;
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('STARTING INVENTORY BACKEND VERIFICATION SUITE (TESTS 1 - 11 + RBAC)');
  console.log('================================================================\n');

  // Login tokens
  const invToken = await login('inventory@restaurant.com');
  const mgrToken = await login('manager@restaurant.com');
  const staffToken = await login('staff@restaurant.com');
  console.log(' Successfully authenticated inventory, manager, and staff accounts.\n');

  // Master data lookup
  const ingRes = await fetch(`${BASE_URL}/api/Ingredients`, { headers: authHeaders(invToken) });
  const ingredients = await ingRes.json();
  let chicken = ingredients.find(i => i.name.toLowerCase().includes('chicken breast') || i.sku === 'MEAT-001');

  if (!chicken) {
    console.log('  Chicken Breast not found in database. Creating it...');
    const catRes = await fetch(`${BASE_URL}/api/IngredientCategories`, { headers: authHeaders(invToken) });
    const categories = await catRes.json();
    const meatCategory = categories.find(c => c.name.toLowerCase() === 'meat');

    const createIngRes = await fetch(`${BASE_URL}/api/Ingredients`, {
      method: 'POST',
      headers: authHeaders(invToken),
      body: JSON.stringify({
        categoryId: meatCategory.id,
        name: 'Chicken Breast',
        sku: 'MEAT-001',
        unit: 'kg',
        minimumStockLevel: 20,
        maximumStockLevel: 100
      })
    });
    chicken = await createIngRes.json();
    console.log(`  Created Chicken Breast with ID: ${chicken.id}`);
  }
  assert(chicken && chicken.id, `Found or created Chicken Breast ingredient (ID: ${chicken?.id})`);

  const locRes = await fetch(`${BASE_URL}/api/StorageLocations`, { headers: authHeaders(invToken) });
  const locations = await locRes.json();
  const coldStorage = locations.find(l => l.name.toLowerCase().includes('cold storage a'));
  const freezer = locations.find(l => l.name.toLowerCase().includes('freezer a'));
  assert(coldStorage, `Found Cold Storage A (ID: ${coldStorage?.id})`);
  assert(freezer, `Found Freezer A (ID: ${freezer?.id})`);

  // -------------------------------------------------------------
  // TEST 1 — RECEIVE STOCK
  // -------------------------------------------------------------
  console.log('\n--- TEST 1 — RECEIVE STOCK ---');
  const ts = Date.now();
  const batchNumber1 = `CH-${ts}-001`;
  const expiry30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const receiveRes1 = await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: batchNumber1,
      quantity: 40,
      unitCost: 1800,
      expiryDate: expiry30Days
    })
  });
  assert(receiveRes1.ok, `Received 40 kg Chicken Breast with batch ${batchNumber1} (HTTP ${receiveRes1.status})`);

  const invRes1 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const chickenInv1 = await invRes1.json();
  const batch1 = chickenInv1.batches.find(b => b.batchNumber === batchNumber1);
  assert(batch1, `StockBatch ${batchNumber1} exists in inventory`);
  assert(batch1.quantity === 40, `StockBatch quantity is exactly 40 kg (actual: ${batch1.quantity})`);
  assert(batch1.status === 'AVAILABLE', `StockBatch status is AVAILABLE (actual: ${batch1.status})`);
  assert(batch1.storageLocationId === coldStorage.id, `StockBatch is in Cold Storage A`);

  // -------------------------------------------------------------
  // TEST 2 — CONSUME STOCK TO ZERO & REJECT OVER-CONSUMPTION
  // -------------------------------------------------------------
  console.log('\n--- TEST 2 — CONSUME STOCK TO ZERO & OVER-CONSUMPTION CHECK ---');
  // Consume all current stock of chicken breast to zero
  const currentTotalStock = chickenInv1.currentStock;
  const consumeZeroRes = await fetch(`${BASE_URL}/api/Inventory/consume`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      quantity: currentTotalStock,
      reason: 'Dinner service full depletion'
    })
  });
  assert(consumeZeroRes.ok, `Consumed entire stock of ${currentTotalStock} kg to reach exactly zero (HTTP ${consumeZeroRes.status})`);

  const invRes2 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const chickenInv2 = await invRes2.json();
  assert(chickenInv2.currentStock === 0, `Current stock is now exactly 0 (actual: ${chickenInv2.currentStock})`);
  const batch1Depleted = chickenInv2.batches.find(b => b.batchNumber === batchNumber1);
  assert(batch1Depleted.quantity === 0, `Batch ${batchNumber1} quantity is 0`);
  assert(batch1Depleted.status === 'DEPLETED', `Batch ${batchNumber1} status is DEPLETED (actual: ${batch1Depleted.status})`);

  // Attempt to consume 1 kg more -> MUST FAIL
  const consumeOverRes = await fetch(`${BASE_URL}/api/Inventory/consume`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      quantity: 1,
      reason: 'Should fail - insufficient stock'
    })
  });
  assert(!consumeOverRes.ok, `Over-consumption rejected as expected (HTTP ${consumeOverRes.status})`);

  // -------------------------------------------------------------
  // TEST 3 — PARTIAL CONSUMPTION
  // -------------------------------------------------------------
  console.log('\n--- TEST 3 — PARTIAL CONSUMPTION ---');
  const batchNumber2 = `CH-${ts}-002`;
  await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: batchNumber2,
      quantity: 40,
      unitCost: 1800,
      expiryDate: expiry30Days
    })
  });

  const consumePartialRes = await fetch(`${BASE_URL}/api/Inventory/consume`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      quantity: 10,
      reason: 'Lunch prep'
    })
  });
  assert(consumePartialRes.ok, `Consumed 10 kg out of 40 kg batch (HTTP ${consumePartialRes.status})`);

  const invRes3 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const chickenInv3 = await invRes3.json();
  const batch2 = chickenInv3.batches.find(b => b.batchNumber === batchNumber2);
  assert(batch2.quantity === 30, `Batch quantity reduced to 30 kg (actual: ${batch2.quantity})`);
  assert(batch2.status === 'PARTIALLY_USED', `Batch status is PARTIALLY_USED (actual: ${batch2.status})`);
  assert(chickenInv3.currentStock === 30, `Total current stock is 30 kg (actual: ${chickenInv3.currentStock})`);

  // -------------------------------------------------------------
  // TEST 4 — FEFO (First Expiry, First Out)
  // -------------------------------------------------------------
  console.log('\n--- TEST 4 — FEFO (FIRST EXPIRY, FIRST OUT) ---');
  const batchA_num = `CH-FEFO-A-${ts}`;
  const batchB_num = `CH-FEFO-B-${ts}`;
  const expiry10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString();
  const expiry20Days = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString();

  // Batch A: 10 kg, expires in 10 days
  await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: batchA_num,
      quantity: 10,
      unitCost: 1800,
      expiryDate: expiry10Days
    })
  });

  // Batch B: 20 kg, expires in 20 days
  await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: batchB_num,
      quantity: 20,
      unitCost: 1800,
      expiryDate: expiry20Days
    })
  });

  // Consume 15 kg:
  // Batch A (10 days expiry) should be consumed FIRST (10 kg -> 0, DEPLETED).
  // Batch B (20 days expiry) should be consumed SECOND (5 kg consumed -> 15 kg left, PARTIALLY_USED).
  // Batch 2 (30 days expiry) should be untouched at 30 kg.
  const consumeFefoRes = await fetch(`${BASE_URL}/api/Inventory/consume`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      quantity: 15,
      reason: 'FEFO Verification'
    })
  });
  assert(consumeFefoRes.ok, `Consumed 15 kg for FEFO verification (HTTP ${consumeFefoRes.status})`);

  const invRes4 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const chickenInv4 = await invRes4.json();
  const fefoBatchA = chickenInv4.batches.find(b => b.batchNumber === batchA_num);
  const fefoBatchB = chickenInv4.batches.find(b => b.batchNumber === batchB_num);
  const fefoBatch2 = chickenInv4.batches.find(b => b.batchNumber === batchNumber2);

  assert(fefoBatchA.quantity === 0, `Batch A (expires earliest) fully depleted to 0 (actual: ${fefoBatchA.quantity})`);
  assert(fefoBatchA.status === 'DEPLETED', `Batch A marked DEPLETED`);
  assert(fefoBatchB.quantity === 15, `Batch B (expires second) reduced by 5 kg to 15 kg (actual: ${fefoBatchB.quantity})`);
  assert(fefoBatchB.status === 'PARTIALLY_USED', `Batch B marked PARTIALLY_USED`);
  assert(fefoBatch2.quantity === 30, `Batch 2 (expires latest) remained untouched at 30 kg (actual: ${fefoBatch2.quantity})`);

  // -------------------------------------------------------------
  // TEST 5 — EXPIRED STOCK RULES
  // -------------------------------------------------------------
  console.log('\n--- TEST 5 — EXPIRED STOCK RESTRICTIONS ---');
  const pastExpiry = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
  const receiveExpiredRes = await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: `CH-EXPIRED-${ts}`,
      quantity: 10,
      unitCost: 1800,
      expiryDate: pastExpiry
    })
  });
  assert(!receiveExpiredRes.ok, `Receiving expired stock rejected by API (HTTP ${receiveExpiredRes.status})`);

  // -------------------------------------------------------------
  // TEST 6 — RECORD WASTE
  // -------------------------------------------------------------
  console.log('\n--- TEST 6 — RECORD WASTE ---');
  const wasteRes = await fetch(`${BASE_URL}/api/Inventory/waste`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      stockBatchId: fefoBatchB.id,
      quantity: 5,
      reason: 'DAMAGED'
    })
  });
  assert(wasteRes.ok, `Recorded 5 kg waste for Batch B (HTTP ${wasteRes.status})`);

  const invRes6 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const batchBAfterWaste = (await invRes6.json()).batches.find(b => b.id === fefoBatchB.id);
  assert(batchBAfterWaste.quantity === 10, `Batch B quantity reduced from 15 kg to 10 kg (actual: ${batchBAfterWaste.quantity})`);

  // Try wasting more than available quantity (10 kg left, try wasting 20 kg)
  const wasteExcessRes = await fetch(`${BASE_URL}/api/Inventory/waste`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      stockBatchId: fefoBatchB.id,
      quantity: 20,
      reason: 'SPILLAGE'
    })
  });
  assert(!wasteExcessRes.ok, `Excessive waste recording rejected by API (HTTP ${wasteExcessRes.status})`);

  // -------------------------------------------------------------
  // TEST 7 — STOCK ADJUSTMENT (SMALL / IMMEDIATE)
  // -------------------------------------------------------------
  console.log('\n--- TEST 7 — STOCK ADJUSTMENT (SMALL / IMMEDIATE) ---');
  const smallAdjustRes = await fetch(`${BASE_URL}/api/Inventory/adjust`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      stockBatchId: fefoBatchB.id,
      quantityChange: 2,
      reason: 'Physical count correction'
    })
  });
  assert(smallAdjustRes.ok, `Small adjustment (+2 kg) submitted (HTTP ${smallAdjustRes.status})`);
  const smallAdjustData = await smallAdjustRes.json();
  assert(smallAdjustData.adjustmentId, `Adjustment ID returned: ${smallAdjustData.adjustmentId}`);

  const invRes7 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const batchBAfterSmallAdjust = (await invRes7.json()).batches.find(b => b.id === fefoBatchB.id);
  assert(batchBAfterSmallAdjust.quantity === 12, `Small adjustment immediately applied: 10 + 2 = 12 kg (actual: ${batchBAfterSmallAdjust.quantity})`);

  // -------------------------------------------------------------
  // TEST 8 — SIGNIFICANT ADJUSTMENT (APPROVAL & REJECTION)
  // -------------------------------------------------------------
  console.log('\n--- TEST 8 — SIGNIFICANT ADJUSTMENT (APPROVAL & REJECTION) ---');
  // Submit significant adjustment >= 10 kg (+15 kg)
  const sigAdjustRes = await fetch(`${BASE_URL}/api/Inventory/adjust`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      stockBatchId: fefoBatchB.id,
      quantityChange: 15,
      reason: 'Supplier bonus stock delivery'
    })
  });
  assert(sigAdjustRes.ok, `Significant adjustment (+15 kg) submitted (HTTP ${sigAdjustRes.status})`);
  const sigAdjustData = await sigAdjustRes.json();
  const sigAdjustId = sigAdjustData.adjustmentId;
  assert(sigAdjustId, `Significant adjustment ID: ${sigAdjustId}`);

  // Verify stock is NOT changed immediately (still 12 kg)
  const invRes8Before = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const batchBBeforeApprove = (await invRes8Before.json()).batches.find(b => b.id === fefoBatchB.id);
  assert(batchBBeforeApprove.quantity === 12, `Stock unchanged prior to approval: still 12 kg (actual: ${batchBBeforeApprove.quantity})`);

  // Verify non-manager cannot approve
  const staffApproveRes = await fetch(`${BASE_URL}/api/Inventory/adjustments/${sigAdjustId}/approve`, {
    method: 'POST',
    headers: authHeaders(invToken) // Inventory Manager cannot approve (only RESTAURANT_MANAGER)
  });
  assert(staffApproveRes.status === 403, `Non-manager (Inventory Manager) forbidden from approving (HTTP ${staffApproveRes.status})`);

  // Manager approves adjustment
  const mgrApproveRes = await fetch(`${BASE_URL}/api/Inventory/adjustments/${sigAdjustId}/approve`, {
    method: 'POST',
    headers: authHeaders(mgrToken)
  });
  assert(mgrApproveRes.ok, `Restaurant Manager approved adjustment (HTTP ${mgrApproveRes.status})`);

  const invRes8After = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const batchBAfterApprove = (await invRes8After.json()).batches.find(b => b.id === fefoBatchB.id);
  assert(batchBAfterApprove.quantity === 27, `Stock updated after approval: 12 + 15 = 27 kg (actual: ${batchBAfterApprove.quantity})`);

  // Test Rejection flow
  const rejectAdjustRes = await fetch(`${BASE_URL}/api/Inventory/adjust`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      stockBatchId: fefoBatchB.id,
      quantityChange: 12,
      reason: 'Mistaken count entry'
    })
  });
  const rejectAdjustId = (await rejectAdjustRes.json()).adjustmentId;
  const mgrRejectRes = await fetch(`${BASE_URL}/api/Inventory/adjustments/${rejectAdjustId}/reject`, {
    method: 'POST',
    headers: authHeaders(mgrToken)
  });
  assert(mgrRejectRes.ok, `Restaurant Manager rejected adjustment (HTTP ${mgrRejectRes.status})`);

  const invRes8Reject = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const batchBAfterReject = (await invRes8Reject.json()).batches.find(b => b.id === fefoBatchB.id);
  assert(batchBAfterReject.quantity === 27, `Stock unchanged after rejection: still 27 kg (actual: ${batchBAfterReject.quantity})`);

  // -------------------------------------------------------------
  // TEST 9 — STOCK TRANSFER
  // -------------------------------------------------------------
  console.log('\n--- TEST 9 — STOCK TRANSFER ---');
  const transferRes = await fetch(`${BASE_URL}/api/Inventory/transfer`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      stockBatchId: fefoBatchB.id,
      destinationStorageLocationId: freezer.id,
      quantity: 5
    })
  });
  assert(transferRes.ok, `Transferred 5 kg from Cold Storage A to Freezer A (HTTP ${transferRes.status})`);

  const invRes9 = await fetch(`${BASE_URL}/api/Inventory/${chicken.id}`, { headers: authHeaders(invToken) });
  const chickenInv9 = await invRes9.json();
  const sourceAfterTransfer = chickenInv9.batches.find(b => b.id === fefoBatchB.id);
  assert(sourceAfterTransfer.quantity === 22, `Source batch quantity decreased by 5 kg: 27 - 5 = 22 kg (actual: ${sourceAfterTransfer.quantity})`);

  const destBatch = chickenInv9.batches.find(b => b.storageLocationId === freezer.id && b.batchNumber === fefoBatchB.batchNumber && b.quantity === 5);
  assert(destBatch, `Destination batch created in Freezer A with 5 kg`);

  // -------------------------------------------------------------
  // TEST 10 — LOW STOCK DETECTION
  // -------------------------------------------------------------
  console.log('\n--- TEST 10 — LOW STOCK DETECTION ---');
  // Chicken Breast minimum stock level is 20 kg
  // Currently stock is: batch2 (30) + sourceBatch (22) + destBatch (5) = 57 kg.
  // Let's consume 40 kg so stock becomes 17 kg (< 20 kg minimum).
  await fetch(`${BASE_URL}/api/Inventory/consume`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      quantity: 40,
      reason: 'High volume catering'
    })
  });

  const lowStockRes1 = await fetch(`${BASE_URL}/api/Inventory/low-stock`, { headers: authHeaders(invToken) });
  const lowStockList1 = await lowStockRes1.json();
  const chickenInLowStock = lowStockList1.find(i => i.ingredientId === chicken.id);
  assert(chickenInLowStock, `Chicken Breast appears in low stock list (current: ${chickenInLowStock?.currentStock} < min: ${chickenInLowStock?.minimumStockLevel})`);

  // Now restore stock above 20 kg (+20 kg received)
  await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: `CH-RESTOCK-${ts}`,
      quantity: 25,
      unitCost: 1800,
      expiryDate: expiry30Days
    })
  });

  const lowStockRes2 = await fetch(`${BASE_URL}/api/Inventory/low-stock`, { headers: authHeaders(invToken) });
  const lowStockList2 = await lowStockRes2.json();
  const chickenInLowStockAfter = lowStockList2.find(i => i.ingredientId === chicken.id);
  assert(!chickenInLowStockAfter, `Chicken Breast no longer appears in low stock list after restock`);

  // -------------------------------------------------------------
  // TEST 11 — EXPIRING STOCK DETECTION
  // -------------------------------------------------------------
  console.log('\n--- TEST 11 — EXPIRING STOCK DETECTION ---');
  const expiry3Days = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const expiringBatchNum = `CH-EXP-3DAYS-${ts}`;
  await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(invToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: expiringBatchNum,
      quantity: 7,
      unitCost: 1800,
      expiryDate: expiry3Days
    })
  });

  // Query within 7 days -> should contain batch
  const exp7Res = await fetch(`${BASE_URL}/api/Inventory/expiring?days=7`, { headers: authHeaders(invToken) });
  const exp7List = await exp7Res.json();
  const foundIn7Days = exp7List.find(b => b.batchNumber === expiringBatchNum);
  assert(foundIn7Days, `Expiring batch ${expiringBatchNum} found in 7-day query`);

  // Query within 2 days -> should NOT contain batch (since 3 days > 2 days)
  const exp2Res = await fetch(`${BASE_URL}/api/Inventory/expiring?days=2`, { headers: authHeaders(invToken) });
  const exp2List = await exp2Res.json();
  const foundIn2Days = exp2List.find(b => b.batchNumber === expiringBatchNum);
  assert(!foundIn2Days, `Expiring batch ${expiringBatchNum} correctly NOT found in 2-day query`);

  // -------------------------------------------------------------
  // SECURITY & RBAC TESTS
  // -------------------------------------------------------------
  console.log('\n--- SECURITY & RBAC TESTS ---');
  // Kitchen staff cannot receive stock
  const staffReceiveRes = await fetch(`${BASE_URL}/api/Inventory/receive`, {
    method: 'POST',
    headers: authHeaders(staffToken),
    body: JSON.stringify({
      ingredientId: chicken.id,
      storageLocationId: coldStorage.id,
      batchNumber: `CH-STAFF-FAIL-${ts}`,
      quantity: 5,
      unitCost: 1800
    })
  });
  assert(staffReceiveRes.status === 403, `Sales/Kitchen Staff forbidden from receiving stock (HTTP ${staffReceiveRes.status})`);

  // Unauthenticated request
  const unauthRes = await fetch(`${BASE_URL}/api/Inventory`, {
    headers: { 'Content-Type': 'application/json' }
  });
  assert(unauthRes.status === 401, `Unauthenticated request returned 401 Unauthorized (HTTP ${unauthRes.status})`);

  console.log('\n================================================================');
  console.log(`SUMMARY: ${passedCount} PASSED, ${failedCount} FAILED`);
  console.log('================================================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('\nFatal test runner error:', err);
  process.exit(1);
});
