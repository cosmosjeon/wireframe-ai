-- ============================================
-- Credit-Based Billing Migration
-- Migration: 003_credit_based_billing.sql
--
-- 토큰 사용량 기반 크레딧 과금 시스템으로 전환
-- 1 크레딧 = 1,000 토큰 (입력+출력 합산)
-- ============================================

-- ============================================
-- 1. Subscriptions 테이블 수정: 크레딧 필드 추가
-- ============================================

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS credits_balance BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_used_total BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_used_total BIGINT DEFAULT 0;

-- 기존 generation을 credits로 마이그레이션 (1 generation = 10 credits 로 환산)
UPDATE subscriptions
SET credits_balance = (generations_included + generations_purchased + generations_rollover - generations_used) * 10
WHERE credits_balance = 0;

-- ============================================
-- 2. Usage Events 테이블 수정: 토큰 정보 추가
-- ============================================

ALTER TABLE usage_events
  ADD COLUMN IF NOT EXISTS prompt_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS credits_consumed INTEGER DEFAULT 0;

-- event_type에 'token_usage' 추가
ALTER TABLE usage_events DROP CONSTRAINT IF EXISTS usage_events_event_type_check;
ALTER TABLE usage_events ADD CONSTRAINT usage_events_event_type_check
  CHECK (event_type IN ('generation', 'token_usage', 'question', 'refund', 'grant', 'reset', 'purchase'));

-- ============================================
-- 3. Credit Packages 테이블 (기존 generation_packages 대체)
-- ============================================

CREATE TABLE IF NOT EXISTS credit_packages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  credits BIGINT NOT NULL,              -- 크레딧 수량
  tokens_equivalent BIGINT NOT NULL,    -- 대략적인 토큰 환산량 (표시용)
  price INTEGER NOT NULL,               -- 센트 단위
  price_per_1k_tokens NUMERIC(10,4),    -- 1K 토큰당 가격 (표시용)
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Credit Packages RLS
ALTER TABLE credit_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active credit packages"
  ON credit_packages FOR SELECT
  USING (is_active = true);

-- ============================================
-- 4. 초기 데이터: Credit Packages
-- ============================================

-- 토큰 환산: 1 크레딧 = 1,000 토큰
-- 가격 설정: API 비용 + 마진

INSERT INTO credit_packages (id, name, credits, tokens_equivalent, price, price_per_1k_tokens, sort_order) VALUES
  ('credits_50k', 'Starter', 50, 50000, 500, 0.10, 1),       -- $5 = 50K tokens ($0.10/1K)
  ('credits_200k', 'Basic', 200, 200000, 1500, 0.075, 2),    -- $15 = 200K tokens ($0.075/1K)
  ('credits_500k', 'Pro', 500, 500000, 3000, 0.06, 3),       -- $30 = 500K tokens ($0.06/1K)
  ('credits_2m', 'Business', 2000, 2000000, 8000, 0.04, 4)   -- $80 = 2M tokens ($0.04/1K)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  credits = EXCLUDED.credits,
  tokens_equivalent = EXCLUDED.tokens_equivalent,
  price = EXCLUDED.price,
  price_per_1k_tokens = EXCLUDED.price_per_1k_tokens,
  sort_order = EXCLUDED.sort_order;

-- ============================================
-- 5. Plans 테이블 수정: 크레딧 기반으로 변경
-- ============================================

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS credits_per_month BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_per_month BIGINT DEFAULT 0;

-- 기존 plans를 크레딧 기반으로 업데이트
UPDATE plans SET
  credits_per_month = 20,      -- 20 credits = 20K tokens
  tokens_per_month = 20000
WHERE id = 'free';

UPDATE plans SET
  credits_per_month = 200,     -- 200 credits = 200K tokens
  tokens_per_month = 200000
WHERE id = 'pro';

UPDATE plans SET
  credits_per_month = 500,     -- 500 credits = 500K tokens
  tokens_per_month = 500000
WHERE id = 'team';

UPDATE plans SET
  credits_per_month = 999999,
  tokens_per_month = 999999000
WHERE id = 'enterprise';

-- ============================================
-- 6. 함수: 크레딧 잔액 조회
-- ============================================

CREATE OR REPLACE FUNCTION get_credits_remaining(p_user_id UUID)
RETURNS BIGINT AS $$
DECLARE
  v_balance BIGINT;
BEGIN
  SELECT credits_balance INTO v_balance
  FROM subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  RETURN GREATEST(v_balance, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 7. 함수: 토큰 사용 및 크레딧 차감 (원자적)
-- ============================================

CREATE OR REPLACE FUNCTION use_credits_for_tokens(
  p_user_id UUID,
  p_prompt_tokens INTEGER,
  p_completion_tokens INTEGER,
  p_conversation_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  credits_remaining BIGINT,
  credits_consumed INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_total_tokens INTEGER;
  v_credits_needed INTEGER;
  v_new_balance BIGINT;
BEGIN
  -- 이미 처리된 요청인지 확인 (멱등성)
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM usage_events WHERE idempotency_key = p_idempotency_key) THEN
      SELECT get_credits_remaining(p_user_id) INTO v_new_balance;
      RETURN QUERY SELECT true, v_new_balance, 0, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 총 토큰 계산
  v_total_tokens := p_prompt_tokens + p_completion_tokens;

  -- 크레딧 계산: 1000 토큰 = 1 크레딧 (올림)
  v_credits_needed := CEIL(v_total_tokens::NUMERIC / 1000);

  -- 최소 1 크레딧
  IF v_credits_needed < 1 THEN
    v_credits_needed := 1;
  END IF;

  -- 구독 정보 잠금
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0, '구독 정보를 찾을 수 없습니다'::TEXT;
    RETURN;
  END IF;

  -- 잔액 확인
  IF v_subscription.credits_balance < v_credits_needed THEN
    RETURN QUERY SELECT false, v_subscription.credits_balance, 0, '크레딧이 부족합니다'::TEXT;
    RETURN;
  END IF;

  -- 크레딧 차감
  v_new_balance := v_subscription.credits_balance - v_credits_needed;

  UPDATE subscriptions
  SET credits_balance = v_new_balance,
      credits_used_total = COALESCE(credits_used_total, 0) + v_credits_needed,
      tokens_used_total = COALESCE(tokens_used_total, 0) + v_total_tokens,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 이벤트 기록
  INSERT INTO usage_events (
    user_id, subscription_id, event_type,
    generations_delta, generations_after,
    prompt_tokens, completion_tokens, total_tokens, credits_consumed,
    conversation_id, model_used, description, idempotency_key
  ) VALUES (
    p_user_id, v_subscription.id, 'token_usage',
    0, 0,
    p_prompt_tokens, p_completion_tokens, v_total_tokens, v_credits_needed,
    p_conversation_id, p_model, p_description, p_idempotency_key
  );

  RETURN QUERY SELECT true, v_new_balance, v_credits_needed, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 8. 함수: 크레딧 추가 (구매/이월 등)
-- ============================================

CREATE OR REPLACE FUNCTION add_credits(
  p_user_id UUID,
  p_amount BIGINT,
  p_type TEXT DEFAULT 'purchase',  -- 'purchase', 'grant', 'rollover', 'refund', 'subscription'
  p_description TEXT DEFAULT NULL
)
RETURNS BIGINT AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_new_balance BIGINT;
BEGIN
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  v_new_balance := COALESCE(v_subscription.credits_balance, 0) + p_amount;

  UPDATE subscriptions
  SET credits_balance = v_new_balance,
      updated_at = NOW()
  WHERE user_id = p_user_id;

  -- 이벤트 기록
  INSERT INTO usage_events (
    user_id, subscription_id, event_type,
    generations_delta, generations_after,
    credits_consumed, description
  ) VALUES (
    p_user_id, v_subscription.id, p_type,
    0, 0,
    -p_amount,  -- 음수로 기록 (추가)
    p_description
  );

  RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 9. 함수: 새 사용자 크레딧 초기화
-- ============================================

CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (
    user_id, plan_id,
    generations_included,
    credits_balance,
    status
  )
  VALUES (
    NEW.id, 'free',
    20,
    20,  -- Free 플랜: 20 크레딧 (20K 토큰)
    'active'
  )
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 10. 함수: 월간 크레딧 리셋 (구독자용)
-- ============================================

CREATE OR REPLACE FUNCTION reset_monthly_credits()
RETURNS void AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_new_credits BIGINT;
BEGIN
  FOR v_sub IN
    SELECT * FROM subscriptions
    WHERE status = 'active'
      AND current_period_end <= NOW()
      AND plan_id != 'free'  -- Free는 리셋 안함
  LOOP
    SELECT * INTO v_plan FROM plans WHERE id = v_sub.plan_id;

    -- 월간 크레딧 부여 (기존 잔액에 추가하지 않고 새로 설정)
    v_new_credits := v_plan.credits_per_month;

    UPDATE subscriptions
    SET
      credits_balance = v_new_credits,
      current_period_start = NOW(),
      current_period_end = NOW() + INTERVAL '1 month',
      updated_at = NOW()
    WHERE id = v_sub.id;

    -- 리셋 이벤트 기록
    INSERT INTO usage_events (
      user_id, subscription_id, event_type,
      generations_delta, generations_after,
      credits_consumed, description
    ) VALUES (
      v_sub.user_id, v_sub.id, 'reset',
      0, 0,
      -v_new_credits,
      'Monthly credit reset: ' || v_new_credits || ' credits'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 11. 함수: 크레딧 사용 가능 여부 확인
-- ============================================

CREATE OR REPLACE FUNCTION can_use_credits(
  p_user_id UUID,
  p_estimated_tokens INTEGER DEFAULT 1000
)
RETURNS TABLE (
  allowed BOOLEAN,
  credits_balance BIGINT,
  credits_needed INTEGER,
  reason TEXT
) AS $$
DECLARE
  v_balance BIGINT;
  v_needed INTEGER;
BEGIN
  SELECT credits_balance INTO v_balance
  FROM subscriptions
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::BIGINT, 0, '구독 정보를 찾을 수 없습니다'::TEXT;
    RETURN;
  END IF;

  v_needed := CEIL(p_estimated_tokens::NUMERIC / 1000);
  IF v_needed < 1 THEN v_needed := 1; END IF;

  IF v_balance < v_needed THEN
    RETURN QUERY SELECT false, v_balance, v_needed, '크레딧이 부족합니다'::TEXT;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_balance, v_needed, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 12. 인덱스 추가
-- ============================================

CREATE INDEX IF NOT EXISTS idx_usage_events_credits ON usage_events(credits_consumed);
CREATE INDEX IF NOT EXISTS idx_usage_events_tokens ON usage_events(total_tokens);
CREATE INDEX IF NOT EXISTS idx_credit_packages_active ON credit_packages(is_active, sort_order);
