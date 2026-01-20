-- ============================================
-- Vibeframe Billing Schema
-- Migration: 002_billing_schema.sql
-- ============================================

-- 1. Plans 테이블 (플랜 정의)
CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,                    -- 'free', 'pro', 'team', 'enterprise'
  name TEXT NOT NULL,                     -- 'Free', 'Pro', 'Team', 'Enterprise'
  description TEXT,
  price_monthly INTEGER NOT NULL,         -- 센트 단위 (1500 = $15)
  price_yearly INTEGER,                   -- 센트 단위 (14400 = $144)
  generations_per_month INTEGER NOT NULL, -- 월 포함 Generation
  daily_limit INTEGER,                    -- 일일 한도 (NULL = 무제한)
  max_projects INTEGER,                   -- 프로젝트 수 제한 (NULL = 무제한)
  features JSONB DEFAULT '[]'::jsonb,     -- 기능 목록
  stripe_price_id_monthly TEXT,           -- Stripe Price ID (월간)
  stripe_price_id_yearly TEXT,            -- Stripe Price ID (연간)
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Subscriptions 테이블 (사용자 구독)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES plans(id) DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'trialing', 'past_due', 'canceled', 'paused')),
  
  -- Stripe 정보
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  
  -- 기간 정보
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
  cancel_at_period_end BOOLEAN DEFAULT false,
  trial_end TIMESTAMPTZ,
  
  -- Generation 관련
  generations_used INTEGER DEFAULT 0,       -- 이번 기간 사용량
  generations_included INTEGER NOT NULL,    -- 이번 기간 포함량
  generations_purchased INTEGER DEFAULT 0,  -- 추가 구매량
  generations_rollover INTEGER DEFAULT 0,   -- 이월량
  
  -- 메타데이터
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)  -- 1 user = 1 subscription
);

-- 3. Usage Events 테이블 (사용 이력)
CREATE TABLE IF NOT EXISTS usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  
  event_type TEXT NOT NULL 
    CHECK (event_type IN ('generation', 'question', 'refund', 'grant', 'reset')),
  generations_delta INTEGER NOT NULL,       -- 변화량 (+추가, -사용)
  generations_after INTEGER NOT NULL,       -- 이벤트 후 잔액
  
  -- 컨텍스트
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  model_used TEXT,                          -- 사용된 AI 모델
  description TEXT,                         -- 설명
  
  -- 메타데이터
  metadata JSONB DEFAULT '{}'::jsonb,
  idempotency_key TEXT UNIQUE,              -- 중복 방지
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Generation Packages 테이블 (추가 구매 패키지)
CREATE TABLE IF NOT EXISTS generation_packages (
  id TEXT PRIMARY KEY,                      -- 'pack_50', 'pack_150', etc.
  name TEXT NOT NULL,
  generations INTEGER NOT NULL,
  price INTEGER NOT NULL,                   -- 센트 단위
  stripe_price_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Purchases 테이블 (구매 이력)
CREATE TABLE IF NOT EXISTS purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  package_id TEXT REFERENCES generation_packages(id),
  
  -- 결제 정보
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_checkout_session_id TEXT,
  amount INTEGER NOT NULL,                  -- 센트 단위
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
  
  -- Generation 정보
  generations_granted INTEGER NOT NULL,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- RLS (Row Level Security) 정책
-- ============================================

-- Subscriptions RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage subscriptions"
  ON subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Usage Events RLS
ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usage events"
  ON usage_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage usage events"
  ON usage_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Purchases RLS
ALTER TABLE purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases"
  ON purchases FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage purchases"
  ON purchases FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Plans는 누구나 읽기 가능
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON plans FOR SELECT
  USING (is_active = true);

-- Generation Packages는 누구나 읽기 가능
ALTER TABLE generation_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active packages"
  ON generation_packages FOR SELECT
  USING (is_active = true);

-- ============================================
-- 인덱스
-- ============================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE INDEX IF NOT EXISTS idx_usage_events_user_id ON usage_events(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_events_created_at ON usage_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_subscription ON usage_events(subscription_id);

CREATE INDEX IF NOT EXISTS idx_purchases_user_id ON purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe_session ON purchases(stripe_checkout_session_id);

-- ============================================
-- 트리거: updated_at 자동 갱신
-- ============================================

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 초기 데이터: Plans
-- ============================================

INSERT INTO plans (id, name, description, price_monthly, price_yearly, generations_per_month, daily_limit, max_projects, features) VALUES
  ('free', 'Free', '서비스 체험 및 간단한 프로토타이핑', 0, 0, 20, 5, 3, 
   '["기본 와이어프레임 생성", ".excalidraw 내보내기", "워터마크 포함"]'::jsonb),
  ('pro', 'Pro', '개인 디자이너/개발자를 위한 플랜', 1500, 14400, 200, NULL, NULL, 
   '["무제한 프로젝트", "프리미엄 AI 모델", "PNG/SVG 내보내기", "대화 저장", "워터마크 없음", "미사용 이월 (최대 50회)"]'::jsonb),
  ('team', 'Team', '스타트업과 디자인팀을 위한 플랜', 3500, 36000, 500, NULL, NULL, 
   '["Pro 기능 전체", "팀 Generation 공유", "실시간 협업", "브랜드 킷", "관리자 대시보드", "Figma 연동", "미사용 이월 (최대 100회)"]'::jsonb),
  ('enterprise', 'Enterprise', '대기업을 위한 맞춤 플랜', 0, 0, 999999, NULL, NULL, 
   '["Team 기능 전체", "무제한 Generation", "SSO/SAML", "SLA 99.9%", "전담 지원", "감사 로그"]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 초기 데이터: Generation Packages
-- ============================================

INSERT INTO generation_packages (id, name, generations, price) VALUES
  ('pack_50', '50 Generations', 50, 500),      -- $5
  ('pack_150', '150 Generations', 150, 1200),  -- $12
  ('pack_500', '500 Generations', 500, 3500),  -- $35
  ('pack_2000', '2000 Generations', 2000, 10000) -- $100
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 함수: 새 사용자 구독 자동 생성
-- ============================================

CREATE OR REPLACE FUNCTION create_free_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan_id, generations_included, status)
  VALUES (NEW.id, 'free', 20, 'active')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- auth.users에 트리거 (새 가입시 Free 구독 생성)
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;
CREATE TRIGGER on_auth_user_created_subscription
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_free_subscription();

-- ============================================
-- 함수: Generation 잔액 계산
-- ============================================

CREATE OR REPLACE FUNCTION get_generations_remaining(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  v_remaining := v_subscription.generations_included 
               + v_subscription.generations_purchased 
               + v_subscription.generations_rollover 
               - v_subscription.generations_used;
               
  RETURN GREATEST(v_remaining, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 함수: Generation 사용 (원자적)
-- ============================================

CREATE OR REPLACE FUNCTION use_generation(
  p_user_id UUID,
  p_amount INTEGER DEFAULT 1,
  p_conversation_id UUID DEFAULT NULL,
  p_model TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  remaining INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_remaining INTEGER;
  v_new_used INTEGER;
BEGIN
  -- 이미 처리된 요청인지 확인 (멱등성)
  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM usage_events WHERE idempotency_key = p_idempotency_key) THEN
      SELECT get_generations_remaining(p_user_id) INTO v_remaining;
      RETURN QUERY SELECT true, v_remaining, NULL::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 구독 정보 잠금
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, '구독 정보를 찾을 수 없습니다'::TEXT;
    RETURN;
  END IF;
  
  -- 잔액 확인
  v_remaining := v_subscription.generations_included 
               + v_subscription.generations_purchased 
               + v_subscription.generations_rollover 
               - v_subscription.generations_used;
  
  IF v_remaining < p_amount THEN
    RETURN QUERY SELECT false, v_remaining, 'Generation이 부족합니다'::TEXT;
    RETURN;
  END IF;
  
  -- 사용량 증가
  v_new_used := v_subscription.generations_used + p_amount;
  
  UPDATE subscriptions
  SET generations_used = v_new_used,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  -- 이벤트 기록
  INSERT INTO usage_events (
    user_id, subscription_id, event_type, generations_delta, 
    generations_after, conversation_id, model_used, description, idempotency_key
  ) VALUES (
    p_user_id, v_subscription.id, 'generation', -p_amount,
    v_remaining - p_amount, p_conversation_id, p_model, p_description, p_idempotency_key
  );
  
  RETURN QUERY SELECT true, v_remaining - p_amount, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 함수: Generation 추가 (구매/이월 등)
-- ============================================

CREATE OR REPLACE FUNCTION add_generations(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT DEFAULT 'grant',  -- 'grant', 'purchase', 'rollover', 'refund'
  p_description TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_new_purchased INTEGER;
  v_remaining INTEGER;
BEGIN
  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE user_id = p_user_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;
  
  -- 구매량에 추가
  v_new_purchased := v_subscription.generations_purchased + p_amount;
  
  UPDATE subscriptions
  SET generations_purchased = v_new_purchased,
      updated_at = NOW()
  WHERE user_id = p_user_id;
  
  v_remaining := get_generations_remaining(p_user_id);
  
  -- 이벤트 기록
  INSERT INTO usage_events (
    user_id, subscription_id, event_type, generations_delta, 
    generations_after, description
  ) VALUES (
    p_user_id, v_subscription.id, p_type, p_amount,
    v_remaining, p_description
  );
  
  RETURN v_remaining;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 함수: 월간 리셋 (Cron Job용)
-- ============================================

CREATE OR REPLACE FUNCTION reset_monthly_generations()
RETURNS void AS $$
DECLARE
  v_sub subscriptions%ROWTYPE;
  v_plan plans%ROWTYPE;
  v_rollover INTEGER;
  v_max_rollover INTEGER;
BEGIN
  FOR v_sub IN 
    SELECT * FROM subscriptions 
    WHERE status = 'active' 
      AND current_period_end <= NOW()
  LOOP
    SELECT * INTO v_plan FROM plans WHERE id = v_sub.plan_id;
    
    -- 이월 계산 (Pro: 50, Team: 100, 나머지: 0)
    IF v_sub.plan_id = 'pro' THEN
      v_max_rollover := 50;
    ELSIF v_sub.plan_id = 'team' THEN
      v_max_rollover := 100;
    ELSE
      v_max_rollover := 0;
    END IF;
    
    v_rollover := LEAST(
      GREATEST(v_sub.generations_included - v_sub.generations_used, 0),
      v_max_rollover
    );
    
    -- 구독 업데이트
    UPDATE subscriptions
    SET 
      generations_used = 0,
      generations_purchased = 0,  -- 추가 구매분은 리셋
      generations_rollover = v_rollover,
      generations_included = v_plan.generations_per_month,
      current_period_start = NOW(),
      current_period_end = NOW() + INTERVAL '1 month',
      updated_at = NOW()
    WHERE id = v_sub.id;
    
    -- 리셋 이벤트 기록
    INSERT INTO usage_events (
      user_id, subscription_id, event_type, generations_delta, 
      generations_after, description
    ) VALUES (
      v_sub.user_id, v_sub.id, 'reset', 0,
      v_plan.generations_per_month + v_rollover,
      'Monthly reset with ' || v_rollover || ' rollover'
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- 함수: 일일 사용량 체크 (Free 플랜용)
-- ============================================

CREATE OR REPLACE FUNCTION check_daily_limit(p_user_id UUID)
RETURNS TABLE (
  allowed BOOLEAN,
  used_today INTEGER,
  daily_limit INTEGER
) AS $$
DECLARE
  v_daily_limit INTEGER;
  v_used_today INTEGER;
BEGIN
  SELECT p.daily_limit INTO v_daily_limit
  FROM subscriptions s
  JOIN plans p ON s.plan_id = p.id
  WHERE s.user_id = p_user_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 0;
    RETURN;
  END IF;
  
  IF v_daily_limit IS NULL THEN
    RETURN QUERY SELECT true, 0, NULL::INTEGER;
    RETURN;
  END IF;
  
  SELECT COALESCE(SUM(ABS(generations_delta)), 0) INTO v_used_today
  FROM usage_events
  WHERE user_id = p_user_id
    AND event_type = 'generation'
    AND created_at >= CURRENT_DATE
    AND created_at < CURRENT_DATE + INTERVAL '1 day';
  
  RETURN QUERY SELECT 
    v_used_today < v_daily_limit,
    v_used_today,
    v_daily_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
