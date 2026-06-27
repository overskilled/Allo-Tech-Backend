/**
 * Allô-Tech — Quotation / mission financial rules (single source of truth).
 *
 * Pure, dependency-free functions so the money math is deterministic and fully
 * unit-testable without a database. Used by the quotation + mission services for
 * the amount a client pays, the platform commission, and the technician payout.
 *
 * Rules:
 *  • Minimum labour (main d'œuvre) of 5 000 XAF — a mission cannot be created
 *    below it.
 *  • Platform commission = 5% of LABOUR only (never on materials).
 *  • Mobile-money transfer fee = 2.5% of the work amount, charged ON TOP to the
 *    client (cash payments are no longer accepted, so every payment goes through
 *    mobile money and carries the operator transfer cost).
 *  • Payment scope:
 *      FULL        → client pays labour + materials; technician receives
 *                    materials + 95% of labour.
 *      LABOR_ONLY  → client provides materials; pays labour only; technician
 *                    receives 95% of labour.
 */

export type PaymentScope = 'FULL' | 'LABOR_ONLY';

/** Minimum labour budget (XAF) required to post a need or create a mission. */
export const MIN_LABOR_XAF = 5000;

/** Platform commission rate, applied to the labour portion only. */
export const COMMISSION_RATE = 0.05;

/**
 * Mobile-money transfer fee rate, charged to the client ON TOP of the work
 * amount. The technician payout and platform commission are unaffected — this
 * covers the operator's transfer cost.
 */
export const TRANSFER_FEE_RATE = 0.025;

export interface FinancialsInput {
  laborCost: number;
  materialsCost?: number;
  paymentScope?: PaymentScope;
}

export interface Financials {
  /** Amount owed for the work itself (labour [+ materials]), before the fee. */
  baseAmount: number;
  /** Mobile-money transfer fee charged to the client (2.5% of baseAmount). */
  transferFee: number;
  /** Total amount the client is charged (baseAmount + transferFee). */
  clientPays: number;
  /** Platform's cut (5% of labour). */
  platformCommission: number;
  /** Net amount credited to the technician's wallet. */
  technicianPayout: number;
  /** Materials portion that flows to the technician (0 when LABOR_ONLY). */
  materialsToTechnician: number;
  /** Echo of the resolved scope. */
  paymentScope: PaymentScope;
}

/** Round to a whole XAF (no cents in this market). */
function xaf(n: number): number {
  return Math.round(n);
}

/**
 * Compute the full money breakdown for a quotation/mission.
 * Negative or NaN inputs are clamped to 0.
 */
export function computeQuotationFinancials(input: FinancialsInput): Financials {
  const labor = Math.max(0, Number(input.laborCost) || 0);
  const materials = Math.max(0, Number(input.materialsCost) || 0);
  const paymentScope: PaymentScope = input.paymentScope === 'LABOR_ONLY' ? 'LABOR_ONLY' : 'FULL';

  const platformCommission = xaf(labor * COMMISSION_RATE);
  const materialsToTechnician = paymentScope === 'LABOR_ONLY' ? 0 : materials;
  const baseAmount = xaf(labor + materialsToTechnician);
  // 2.5% transfer fee added ON TOP of the work amount — paid by the client, it
  // does not touch the technician payout or the platform commission.
  const transferFee = xaf(baseAmount * TRANSFER_FEE_RATE);
  const clientPays = xaf(baseAmount + transferFee);
  const technicianPayout = xaf(materialsToTechnician + (labor - platformCommission));

  return {
    baseAmount,
    transferFee,
    clientPays,
    platformCommission,
    technicianPayout,
    materialsToTechnician,
    paymentScope,
  };
}

/** True when the labour amount meets the platform minimum. */
export function meetsMinimumLabor(laborCost: number): boolean {
  return (Number(laborCost) || 0) >= MIN_LABOR_XAF;
}

/* ── Cancellation ──────────────────────────────────────────────────────────── */

/**
 * Flat fee paid to the technician when a client cancels after assignment, to
 * cover their travel + on-site diagnosis. The remainder is refunded.
 */
export const CANCELLATION_TECH_FEE_XAF = 5000;

export interface CancellationSplit {
  /** Amount kept by the technician (travel + diagnosis). */
  techFee: number;
  /** Amount refunded to the client. */
  clientRefund: number;
  /**
   * Wallet delta to apply to the technician so they end with exactly `techFee`
   * for this mission: positive = credit, negative = claw back a prior credit.
   */
  techAdjustment: number;
}

/**
 * Split a client cancellation: the technician keeps min(5000, paid), the client
 * is refunded the rest. `techAlreadyCredited` is whatever the tech was already
 * paid for this mission (quotation flow credits on payment; candidature flow
 * holds in escrow → 0), so the adjustment nets them to exactly the fee.
 */
export function computeCancellationSplit(
  paidByClient: number,
  techAlreadyCredited = 0,
): CancellationSplit {
  const paid = Math.max(0, Number(paidByClient) || 0);
  const credited = Math.max(0, Number(techAlreadyCredited) || 0);
  const techFee = Math.min(CANCELLATION_TECH_FEE_XAF, paid);
  const clientRefund = paid - techFee;
  const techAdjustment = techFee - credited;
  return { techFee, clientRefund, techAdjustment };
}
