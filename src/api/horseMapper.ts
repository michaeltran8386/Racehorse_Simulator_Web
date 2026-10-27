import type { Coat, HorseProfile, Lifecycle, StallHealth, Strategy } from '../sim/engine.ts';

// shortcut: BE has no simulator biometric profile fields; keep deterministic local defaults until those fields become domain data.

function hashString(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function toHorseProfile(horse: any, index: number): HorseProfile & { stallCode?: string | null } {
  const id = horse.id;
  const hash = hashString(id || `horse-${index}`);

  // Calculate age from DOB if available
  let ageYears = 4;
  if (horse.dob) {
    const dobMs = new Date(horse.dob).getTime();
    if (!isNaN(dobMs)) {
      ageYears = Math.max(1, Math.min(30, Math.floor((Date.now() - dobMs) / (365.25 * 24 * 60 * 60 * 1000))));
    }
  }

  // Gender mapping
  let gender: 'STALLION' | 'MARE' | 'GELDING' = 'STALLION';
  const gUpper = String(horse.gender || '').toUpperCase();
  if (gUpper === 'MARE') gender = 'MARE';
  else if (gUpper === 'GELDING') gender = 'GELDING';

  // Coat mapping
  let coat: Coat = 'BAY';
  const cUpper = String(horse.color || '').toUpperCase();
  if (cUpper.includes('CHESTNUT') || cUpper.includes('HỒNG')) coat = 'CHESTNUT';
  else if (cUpper.includes('BLACK') || cUpper.includes('ĐEN') || cUpper.includes('HẮC')) coat = 'BLACK';
  else if (cUpper.includes('GRAY') || cUpper.includes('GREY') || cUpper.includes('XÁM')) coat = 'GRAY';
  else if (cUpper.includes('ROAN') || cUpper.includes('KHOANG')) coat = 'ROAN';

  // Status mapping to lifecycle and health
  let lifecycle: Lifecycle = 'DANG_TAP_LUYEN';
  let health: StallHealth = 'FIT';

  const status = String(horse.status || 'IN_TRAINING').toUpperCase();
  switch (status) {
    case 'ACTIVE':
      lifecycle = 'SAN_SANG_THI_DAU';
      health = 'FIT';
      break;
    case 'IN_TRAINING':
      lifecycle = 'DANG_TAP_LUYEN';
      health = 'FIT';
      break;
    case 'UNDER_OBSERVATION':
      lifecycle = 'CAN_THEO_DOI';
      health = 'WATCH';
      break;
    case 'INJURED':
      lifecycle = 'CHAN_THUONG';
      health = 'INJURED';
      break;
    case 'ISOLATED':
      lifecycle = 'CACH_LY';
      health = 'ISOLATED';
      break;
    case 'RESTING':
    case 'RETIRED':
      lifecycle = 'NGHI_NGOI';
      health = 'FIT';
      break;
    default:
      lifecycle = 'DANG_TAP_LUYEN';
      health = 'FIT';
  }

  // Real PostgreSQL master data: weightKg and stallCode are preserved without hash fabrication
  const weightKg =
    horse.weightKg !== undefined && horse.weightKg !== null && !isNaN(Number(horse.weightKg))
      ? Number(horse.weightKg)
      : null;

  const stallCode =
    typeof horse.stall === 'string'
      ? horse.stall
      : horse.stall?.code || horse.stallCode || null;

  const topSpeedMps = 16.5 + ((hash >> 2) % 30) / 10;
  const hrRest = 32 + ((hash >> 4) % 12);
  const hrMax = 215 + ((hash >> 6) % 25);
  const hrAlert = 190 + ((hash >> 8) % 15);
  const fitness = 0.9 + ((hash >> 10) % 25) / 100;

  const strategies: Strategy[] = ['FRONT', 'STALKER', 'CLOSER'];
  const strategy = strategies[(hash >> 12) % strategies.length];

  const stall = {
    col: (index % 5) + 1,
    row: Math.floor(index / 5) + 1,
  };

  return {
    id,
    code: horse.horseCode || `H-${String(index + 1).padStart(4, '0')}`,
    name: horse.name || 'Chiến mã',
    breed: horse.breed || 'Thoroughbred',
    coat,
    gender,
    ageYears,
    weightKg: weightKg as number,
    stallCode,
    microchip: horse.microchip || horse.microchipRfid || '',
    lifecycle,
    health,
    medicalLock: Boolean(horse.isMedicalLocked),
    stall,
    topSpeedMps,
    hrRest,
    hrMax,
    hrAlert,
    fitness,
    strategy,
  };
}
