import test from 'node:test';
import assert from 'node:assert/strict';
import { toHorseProfile } from './horseMapper.ts';

test('horseMapper: preserves UUID, horseCode, name, breed, and isMedicalLocked', () => {
  const beHorse: any = {
    id: 'a5c71b40-2c70-4f51-b8d4-f6551b3f94ee',
    horseCode: 'H-0001',
    name: 'Thunderbolt',
    breed: 'Thoroughbred',
    dob: '2020-05-15T00:00:00.000Z',
    gender: 'STALLION',
    color: 'BAY',
    status: 'IN_TRAINING',
    isMedicalLocked: true,
    microchip: '985141000000001',
  };

  const profile = toHorseProfile(beHorse, 0);

  assert.equal(profile.id, 'a5c71b40-2c70-4f51-b8d4-f6551b3f94ee');
  assert.equal(profile.code, 'H-0001');
  assert.equal(profile.name, 'Thunderbolt');
  assert.equal(profile.breed, 'Thoroughbred');
  assert.equal(profile.medicalLock, true);
  assert.equal(profile.microchip, '985141000000001');
});

test('horseMapper: maps colour, gender, and status to engine enums', () => {
  const beHorse: any = {
    id: 'b6d82c50-3d80-4f62-c9e5-07662c4a05ff',
    horseCode: 'H-0002',
    name: 'Silver Star',
    breed: 'Arabian',
    dob: '2019-03-10T00:00:00.000Z',
    gender: 'MARE',
    color: 'GRAY',
    status: 'UNDER_OBSERVATION',
    isMedicalLocked: false,
  };

  const profile = toHorseProfile(beHorse, 1);

  assert.equal(profile.gender, 'MARE');
  assert.equal(profile.coat, 'GRAY');
  assert.equal(profile.lifecycle, 'CAN_THEO_DOI');
  assert.equal(profile.health, 'WATCH');
  assert.equal(profile.medicalLock, false);
});

test('horseMapper: calculates bounded age from DOB', () => {
  const recentHorse: any = {
    id: 'c7e93d60-4e90-5f73-da06-18773d5b16aa',
    dob: new Date(Date.now() - 365.25 * 24 * 60 * 60 * 1000 * 4).toISOString(),
    gender: 'GELDING',
    color: 'BLACK',
    status: 'ACTIVE',
  };

  const profile = toHorseProfile(recentHorse, 2);

  assert.ok(profile.ageYears >= 3 && profile.ageYears <= 5);
});

test('horseMapper: produces deterministic local defaults across reloads for identical BE data', () => {
  const beHorse: any = {
    id: 'd8f04e70-5fa0-6f84-eb17-29884e6c27bb',
    horseCode: 'H-0003',
    name: 'Red Comet',
    breed: 'Thoroughbred',
    dob: '2018-01-01T00:00:00.000Z',
    gender: 'STALLION',
    color: 'CHESTNUT',
    status: 'IN_TRAINING',
    isMedicalLocked: false,
  };

  const run1 = toHorseProfile(beHorse, 3);
  const run2 = toHorseProfile(beHorse, 3);

  assert.equal(run1.weightKg, run2.weightKg);
  assert.equal(run1.fitness, run2.fitness);
  assert.equal(run1.strategy, run2.strategy);
  assert.equal(run1.topSpeedMps, run2.topSpeedMps);
  assert.equal(run1.hrRest, run2.hrRest);
  assert.equal(run1.hrMax, run2.hrMax);
  assert.equal(run1.hrAlert, run2.hrAlert);
  assert.deepEqual(run1.stall, run2.stall);
});

test('horseMapper: preserves PostgreSQL weightKg and stallCode without using hash fallback', () => {
  const beHorse: any = {
    id: '3b5d004e-79ed-45cb-870e-bedd02b4219e',
    horseCode: 'HR-000101',
    name: 'Test Victory 2562',
    weightKg: 490,
    stall: 'A-01',
    microchipRfid: '985043482926029',
  };

  const profile = toHorseProfile(beHorse, 0);

  // PostgreSQL weight 490 must be 490, NOT 535 (from 450 + hash % 100)
  assert.equal(profile.weightKg, 490);
  assert.equal(profile.stallCode, 'A-01');
  assert.equal(profile.microchip, '985043482926029');
});
