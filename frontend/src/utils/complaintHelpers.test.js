/**
 * Tests for the work-status display rules. Run with: node --test src/utils/complaintHelpers.test.js
 * (from frontend/). Uses node:test, so no extra dependency is needed.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDisplayStatus, isWorkInProgress } from './complaintHelpers.js';

const HOUR_MS = 60 * 60 * 1000;
const future = () => new Date(Date.now() + 10 * HOUR_MS).toISOString();
const past = () => new Date(Date.now() - HOUR_MS).toISOString();

describe('isWorkInProgress', () => {
  it('is true only for a submitted complaint whose work has started', () => {
    assert.equal(isWorkInProgress({ status: 'submitted', workStatus: 'in_progress' }), true);
    assert.equal(isWorkInProgress({ status: 'submitted', workStatus: 'not_started' }), false);
    assert.equal(isWorkInProgress({ status: 'submitted' }), false, 'older documents have no workStatus');
    assert.equal(isWorkInProgress({ status: 'pending_verification', workStatus: 'in_progress' }), false);
    assert.equal(isWorkInProgress({ status: 'resolved', workStatus: 'in_progress' }), false);
  });
});

describe('getDisplayStatus with work status', () => {
  it('shows Not started for a submitted complaint whose work has not begun', () => {
    assert.equal(getDisplayStatus({ status: 'submitted', workStatus: 'not_started', dueAt: future() }).label, 'Not started');
  });

  it('shows Not started for an older document with no workStatus', () => {
    assert.equal(getDisplayStatus({ status: 'submitted', dueAt: future() }).label, 'Not started');
  });

  it('shows In progress once work has started', () => {
    assert.equal(getDisplayStatus({ status: 'submitted', workStatus: 'in_progress', dueAt: future() }).label, 'In progress');
  });

  it('keeps Overdue above In progress', () => {
    assert.equal(getDisplayStatus({ status: 'submitted', workStatus: 'in_progress', dueAt: past() }).label, 'Overdue');
  });

  it('keeps Pending verification, Returned and Resolved above the work status', () => {
    assert.equal(
      getDisplayStatus({ status: 'pending_verification', workStatus: 'in_progress' }).label,
      'Pending verification'
    );
    assert.equal(
      getDisplayStatus({
        status: 'submitted',
        workStatus: 'in_progress',
        dueAt: future(),
        verification: { rejectionReason: 'Still open' },
      }).label,
      'Returned for rework'
    );
    assert.equal(getDisplayStatus({ status: 'resolved', workStatus: 'in_progress' }).label, 'Resolved');
  });
});
