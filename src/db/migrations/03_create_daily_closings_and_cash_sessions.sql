-- ====================================================================
-- MIGRATION 03: CLÔTURE JOURNALIÈRE ET GESTION DE CAISSE (DAILY CLOSING)
-- PORTUS — U.J.S.R.V.
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.daily_closings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closing_reference TEXT NOT NULL UNIQUE,
  closing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cashier_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  opening_balance INT NOT NULL DEFAULT 0,
  cash_sales_amount INT NOT NULL DEFAULT 0,
  digital_sales_amount INT NOT NULL DEFAULT 0,
  refunds_amount INT NOT NULL DEFAULT 0,
  expenses_amount INT NOT NULL DEFAULT 0,
  expected_balance INT NOT NULL,
  declared_balance INT NOT NULL,
  discrepancy INT NOT NULL, -- declared_balance - expected_balance
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK (status IN ('DRAFT', 'SUBMITTED', 'CONFIRMED', 'DISPUTED', 'LOCKED')),
  confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  is_locked BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_closings_date ON public.daily_closings(closing_date DESC);
CREATE INDEX IF NOT EXISTS idx_closings_cashier ON public.daily_closings(cashier_id);
CREATE INDEX IF NOT EXISTS idx_closings_status ON public.daily_closings(status);

ALTER TABLE public.daily_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access closings" ON public.daily_closings
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMINISTRATEUR'
    )
  );

CREATE POLICY "Cashier and Agent view own closings" ON public.daily_closings
  FOR SELECT TO authenticated
  USING (cashier_id = auth.uid());

CREATE POLICY "Cashier submit closing" ON public.daily_closings
  FOR INSERT TO authenticated
  WITH CHECK (cashier_id = auth.uid());
