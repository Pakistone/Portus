-- ====================================================================
-- MIGRATION 01: CRÉATION DE LA TABLE DES DÉPENSES (EXPENSES)
-- PORTUS — U.J.S.R.V. (Union des Jeunes de la Sécurité Routière de Vridi)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_number TEXT NOT NULL UNIQUE,
  amount INT NOT NULL CHECK (amount > 0),
  category TEXT NOT NULL CHECK (category IN (
    'MATÉRIEL',
    'AGENT',
    'AUTORITÉS',
    'RÉPARATION / ENTRETIEN',
    'CARBURANT',
    'TRANSPORT',
    'AUTRE'
  )),
  description TEXT NOT NULL CHECK (char_length(trim(description)) >= 3),
  beneficiary TEXT,
  payment_method TEXT NOT NULL DEFAULT 'ESPECES',
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_url TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'VALIDATED', 'REJECTED', 'CANCELLED')),
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancellation_reason TEXT,
  correction_reason TEXT,
  sector_id UUID REFERENCES public.sectors(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index de recherche et reporting
CREATE INDEX IF NOT EXISTS idx_expenses_date ON public.expenses(expense_date DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_created_by ON public.expenses(created_by);
CREATE INDEX IF NOT EXISTS idx_expenses_responsible ON public.expenses(responsible_id);
CREATE INDEX IF NOT EXISTS idx_expenses_sector ON public.expenses(sector_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- RLS
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'ADMINISTRATEUR' AND is_active = TRUE
    )
  );

CREATE POLICY "Responsable manage sector expenses" ON public.expenses
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'RESPONSABLE' AND is_active = TRUE
        AND (responsible_id = auth.uid() OR created_by = auth.uid() OR sector_id = profiles.sector_id)
    )
  );

CREATE POLICY "Users read and insert own expenses" ON public.expenses
  FOR SELECT TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Users insert own expenses" ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
