import { decide, isWithinScope, Principal, RoleGrant } from '../src/common/auth/access-policy';

const now = new Date('2026-06-01T00:00:00Z');

function grant(overrides: Partial<RoleGrant> = {}): RoleGrant {
  return {
    role: 'leader',
    permissions: ['reports.read'],
    scopePath: 'demo.v1.t1',
    maxClassification: 'internal',
    validFrom: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const user = (...grants: RoleGrant[]): Principal => ({ userId: 'u1', grants });

describe('isWithinScope', () => {
  it('matches the unit itself and its children', () => {
    expect(isWithinScope('demo.v1.t1', 'demo.v1.t1')).toBe(true);
    expect(isWithinScope('demo.v1.t1', 'demo.v1')).toBe(true);
  });

  it('does not match siblings or name prefixes', () => {
    expect(isWithinScope('demo.v1.t2', 'demo.v1.t1')).toBe(false);
    expect(isWithinScope('demo.v10', 'demo.v1')).toBe(false);
    expect(isWithinScope('demo.v1', 'demo.v1.t1')).toBe(false);
  });
});

describe('decide', () => {
  const ownDistrict = { adminUnitPath: 'demo.v1.t1', classification: 'internal' as const };

  it('district leader sees own district', () => {
    expect(decide(user(grant()), 'reports.read', ownDistrict, now).allowed).toBe(true);
  });

  it('district leader cannot see neighbouring district', () => {
    const res = decide(user(grant()), 'reports.read', { ...ownDistrict, adminUnitPath: 'demo.v1.t2' }, now);
    expect(res).toEqual({ allowed: false, reason: 'out_of_scope' });
  });

  it('region leader sees districts of the region but not the republic level', () => {
    const regional = user(grant({ scopePath: 'demo.v1' }));
    expect(decide(regional, 'reports.read', ownDistrict, now).allowed).toBe(true);
    expect(decide(regional, 'reports.read', { ...ownDistrict, adminUnitPath: 'demo' }, now).allowed).toBe(false);
  });

  it('rejects data above the granted classification', () => {
    const res = decide(user(grant()), 'reports.read', { ...ownDistrict, classification: 'confidential' }, now);
    expect(res).toEqual({ allowed: false, reason: 'classification' });
  });

  it('rejects missing permission and expired grants', () => {
    expect(decide(user(grant()), 'reports.export', ownDistrict, now)).toEqual({ allowed: false, reason: 'no_permission' });
    const expired = grant({ validUntil: new Date('2026-03-01T00:00:00Z') });
    expect(decide(user(expired), 'reports.read', ownDistrict, now)).toEqual({ allowed: false, reason: 'expired' });
  });

  it('combines grants: scope from one, classification from another is not mixed', () => {
    const p = user(
      grant({ scopePath: 'demo.v1.t1', maxClassification: 'internal' }),
      grant({ scopePath: 'demo.v1.t2', maxClassification: 'secret' }),
    );
    const res = decide(p, 'reports.read', { adminUnitPath: 'demo.v1.t1', classification: 'secret' }, now);
    expect(res.allowed).toBe(false);
  });
});
