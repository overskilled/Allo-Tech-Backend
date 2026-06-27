import {
  computeQuotationFinancials,
  meetsMinimumLabor,
  computeCancellationSplit,
  CANCELLATION_TECH_FEE_XAF,
  MIN_LABOR_XAF,
  COMMISSION_RATE,
} from './quotation-financials';

describe('quotation-financials', () => {
  describe('computeQuotationFinancials — FULL scope', () => {
    it('charges labour + materials + 2.5% fee and pays tech materials + 95% labour', () => {
      const f = computeQuotationFinancials({
        laborCost: 100_000,
        materialsCost: 40_000,
        paymentScope: 'FULL',
      });
      expect(f.baseAmount).toBe(140_000); // labour + materials (work amount)
      expect(f.transferFee).toBe(3_500); // 2.5% of 140k, added on top
      expect(f.clientPays).toBe(143_500); // base + transfer fee
      expect(f.platformCommission).toBe(5_000); // 5% of 100k labour
      expect(f.materialsToTechnician).toBe(40_000); // materials flow to tech
      expect(f.technicianPayout).toBe(135_000); // 40k materials + 95k labour
      // Work amount is conserved: base = tech payout + commission (fee is extra)
      expect(f.technicianPayout + f.platformCommission).toBe(f.baseAmount);
    });

    it('commission is taken on labour only, never on materials', () => {
      const f = computeQuotationFinancials({
        laborCost: 10_000,
        materialsCost: 1_000_000, // huge materials must NOT be commissioned
        paymentScope: 'FULL',
      });
      expect(f.platformCommission).toBe(500); // 5% of 10k labour only
      expect(f.technicianPayout).toBe(1_009_500); // 1,000,000 + 9,500
    });
  });

  describe('computeQuotationFinancials — LABOR_ONLY scope', () => {
    it('charges labour only + 2.5% fee; materials excluded; tech gets 95% labour', () => {
      const f = computeQuotationFinancials({
        laborCost: 100_000,
        materialsCost: 40_000, // client provides materials → excluded
        paymentScope: 'LABOR_ONLY',
      });
      expect(f.baseAmount).toBe(100_000);
      expect(f.transferFee).toBe(2_500); // 2.5% of 100k
      expect(f.clientPays).toBe(102_500); // labour + transfer fee
      expect(f.materialsToTechnician).toBe(0);
      expect(f.platformCommission).toBe(5_000);
      expect(f.technicianPayout).toBe(95_000);
      expect(f.technicianPayout + f.platformCommission).toBe(f.baseAmount);
    });
  });

  describe('transfer fee (2.5%, charged on top to the client)', () => {
    it('adds the fee without changing the technician payout', () => {
      const f = computeQuotationFinancials({ laborCost: 80_000, materialsCost: 20_000 });
      expect(f.baseAmount).toBe(100_000);
      expect(f.transferFee).toBe(2_500); // 2.5% of 100k
      expect(f.clientPays).toBe(102_500);
      // Payout is computed from the work amount, never from the fee.
      expect(f.technicianPayout).toBe(96_000); // 20k materials + 76k labour
      expect(f.clientPays - f.baseAmount).toBe(f.transferFee);
    });

    it('rounds the fee to whole XAF', () => {
      const f = computeQuotationFinancials({ laborCost: 7_777, materialsCost: 0 });
      expect(f.baseAmount).toBe(7_777);
      expect(f.transferFee).toBe(Math.round(7_777 * 0.025)); // 194
      expect(Number.isInteger(f.transferFee)).toBe(true);
    });
  });

  describe('defaults & edge cases', () => {
    it('defaults to FULL scope when unspecified', () => {
      const f = computeQuotationFinancials({ laborCost: 20_000, materialsCost: 5_000 });
      expect(f.paymentScope).toBe('FULL');
      expect(f.baseAmount).toBe(25_000);
      expect(f.clientPays).toBe(25_625); // 25k + 2.5%
    });

    it('handles zero / missing materials', () => {
      const f = computeQuotationFinancials({ laborCost: 50_000 });
      expect(f.baseAmount).toBe(50_000);
      expect(f.clientPays).toBe(51_250); // 50k + 2.5%
      expect(f.materialsToTechnician).toBe(0);
      expect(f.technicianPayout).toBe(47_500);
    });

    it('clamps negative/NaN inputs to zero', () => {
      const f = computeQuotationFinancials({ laborCost: -10 as number, materialsCost: NaN });
      expect(f.baseAmount).toBe(0);
      expect(f.transferFee).toBe(0);
      expect(f.clientPays).toBe(0);
      expect(f.technicianPayout).toBe(0);
      expect(f.platformCommission).toBe(0);
    });

    it('rounds commission to whole XAF', () => {
      const f = computeQuotationFinancials({ laborCost: 7_777, materialsCost: 0 });
      expect(f.platformCommission).toBe(Math.round(7_777 * COMMISSION_RATE)); // 389
      expect(Number.isInteger(f.platformCommission)).toBe(true);
      expect(Number.isInteger(f.technicianPayout)).toBe(true);
    });
  });

  describe('meetsMinimumLabor (5 000 XAF floor)', () => {
    it('rejects below the minimum', () => {
      expect(meetsMinimumLabor(4_999)).toBe(false);
      expect(meetsMinimumLabor(0)).toBe(false);
    });
    it('accepts at / above the minimum', () => {
      expect(meetsMinimumLabor(MIN_LABOR_XAF)).toBe(true);
      expect(meetsMinimumLabor(5_001)).toBe(true);
    });
  });

  describe('computeCancellationSplit', () => {
    it('candidature flow (tech not yet credited): tech gets 5 000, client refunded the rest', () => {
      const s = computeCancellationSplit(40_000, 0);
      expect(s.techFee).toBe(CANCELLATION_TECH_FEE_XAF); // 5 000
      expect(s.clientRefund).toBe(35_000);
      expect(s.techAdjustment).toBe(5_000); // credit the tech
    });

    it('quotation flow (tech already credited): claws back to leave exactly 5 000', () => {
      // Client paid 100k, tech was already credited 95k (net). After cancel the
      // tech keeps 5 000 → adjustment of -90 000, client refunded 95 000.
      const s = computeCancellationSplit(100_000, 95_000);
      expect(s.techFee).toBe(5_000);
      expect(s.clientRefund).toBe(95_000);
      expect(s.techAdjustment).toBe(-90_000);
    });

    it('paid less than the fee: tech keeps all of it, nothing refunded', () => {
      const s = computeCancellationSplit(3_000, 0);
      expect(s.techFee).toBe(3_000);
      expect(s.clientRefund).toBe(0);
      expect(s.techAdjustment).toBe(3_000);
    });

    it('nothing paid: no fee, no refund', () => {
      const s = computeCancellationSplit(0, 0);
      expect(s.techFee).toBe(0);
      expect(s.clientRefund).toBe(0);
      expect(s.techAdjustment).toBe(0);
    });

    it('money is conserved: techFee + clientRefund === paid', () => {
      const s = computeCancellationSplit(72_500, 60_000);
      expect(s.techFee + s.clientRefund).toBe(72_500);
    });
  });
});
