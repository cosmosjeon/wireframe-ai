# Vibeframe 과금 시스템 개발 계획서

> **목적**: AI가 이 문서만 보고 처음부터 끝까지 멈추지 않고 개발할 수 있는 수준의 상세 계획  
> **작성일**: 2025-01-20  
> **예상 소요**: 6-7주 (1인 기준)

---

## 📋 현재 상태 분석

### 기존 스키마
```
supabase/migrations/001_conversations.sql
├── conversations (id, user_id, title, wireframe, created_at, updated_at)
└── messages (id, conversation_id, role, content, wireframe, created_at)
```

### 기존 API 라우트
```
app/api/
├── chat/route.ts              # POST - AI 와이어프레임 생성 (핵심 과금 대상)
├── morph-chat/route.ts        # POST - Morph 편집
├── sandbox/route.ts           # POST - 샌드박스 실행
├── generate-title/route.ts    # POST - 제목 생성
└── conversations/
    ├── route.ts               # GET/POST - 대화 목록/생성
    └── [id]/
        ├── route.ts           # GET/PATCH/DELETE - 대화 상세
        └── messages/route.ts  # POST - 메시지 추가
```

### 기존 인증
- Supabase Auth (OAuth Google, Email/Password, Magic Link)
- `lib/supabase.ts` (브라우저 클라이언트)
- `lib/supabase-server.ts` (서버 클라이언트)
- `lib/auth.ts` (useAuth 훅, getUserTeam)

### 기존 UI
- shadcn/ui + Radix 기반
- `components/ui/dialog.tsx` (모달 패턴)
- `components/auth-dialog.tsx` (인증 다이얼로그 참고)

---

## 🎯 개발 목표

1. **Generation 기반 과금**: AI 요청마다 Generation 차감
2. **4개 플랜**: Free (20회/월), Pro ($15/월, 200회), Team ($35/인/월, 500회), Enterprise
3. **추가 구매**: 50~2000 Generation 패키지
4. **Stripe 연동**: 구독 + 일회성 결제
5. **사용량 대시보드**: 실시간 Generation 표시

---

## 📁 생성할 파일 목록

```
# 데이터베이스
supabase/migrations/
├── 002_billing_schema.sql          # 과금 관련 테이블

# 백엔드 라이브러리
lib/
├── stripe.ts                       # Stripe 클라이언트
├── billing.ts                      # 과금 유틸리티 함수
└── usage.ts                        # Generation 추적/차감

# API 라우트
app/api/
├── billing/
│   ├── checkout/route.ts           # Stripe Checkout 세션 생성
│   ├── portal/route.ts             # Stripe Customer Portal
│   ├── webhook/route.ts            # Stripe Webhook 처리
│   └── usage/route.ts              # 사용량 조회
├── generations/
│   └── purchase/route.ts           # 추가 Generation 구매

# UI 컴포넌트
components/
├── billing/
│   ├── usage-display.tsx           # 헤더 사용량 표시
│   ├── usage-dashboard.tsx         # 상세 사용량 대시보드
│   ├── plan-card.tsx               # 플랜 카드
│   ├── pricing-dialog.tsx          # 가격 다이얼로그
│   ├── checkout-button.tsx         # 결제 버튼
│   ├── upgrade-prompt.tsx          # 업그레이드 유도
│   └── generation-purchase.tsx     # 추가 구매 UI
└── settings/
    └── billing-settings.tsx        # 결제 설정 페이지

# 페이지
app/
├── pricing/page.tsx                # 가격 페이지
└── settings/
    └── billing/page.tsx            # 결제 설정 페이지

# 타입 정의
lib/types/
└── billing.ts                      # 과금 관련 타입
```

---

## 🔧 Phase 1: 데이터베이스 스키마 (3일)

### Task 1.1: 마이그레이션 파일 생성

**파일**: `supabase/migrations/002_billing_schema.sql`

```sql
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
```

### Task 1.2: 마이그레이션 실행 확인

```bash
# 실행 명령어 (Supabase CLI)
supabase db push

# 또는 Supabase Dashboard > SQL Editor에서 직접 실행
```

### Task 1.3: 검증 쿼리

```sql
-- 테이블 생성 확인
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('plans', 'subscriptions', 'usage_events', 'generation_packages', 'purchases');

-- 플랜 데이터 확인
SELECT * FROM plans;

-- 함수 확인
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION';
```

---

## 🔧 Phase 2: 백엔드 라이브러리 (4일)

### Task 2.1: 타입 정의

**파일**: `lib/types/billing.ts`

```typescript
// ============================================
// Vibeframe Billing Types
// ============================================

export type PlanId = 'free' | 'pro' | 'team' | 'enterprise';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';
export type UsageEventType = 'generation' | 'question' | 'refund' | 'grant' | 'reset';
export type PurchaseStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export interface Plan {
  id: PlanId;
  name: string;
  description: string | null;
  price_monthly: number;        // 센트 단위
  price_yearly: number | null;
  generations_per_month: number;
  daily_limit: number | null;
  max_projects: number | null;
  features: string[];
  stripe_price_id_monthly: string | null;
  stripe_price_id_yearly: string | null;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  user_id: string;
  plan_id: PlanId;
  status: SubscriptionStatus;
  
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  trial_end: string | null;
  
  generations_used: number;
  generations_included: number;
  generations_purchased: number;
  generations_rollover: number;
  
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface UsageEvent {
  id: string;
  user_id: string;
  subscription_id: string | null;
  
  event_type: UsageEventType;
  generations_delta: number;
  generations_after: number;
  
  conversation_id: string | null;
  model_used: string | null;
  description: string | null;
  
  metadata: Record<string, any>;
  idempotency_key: string | null;
  created_at: string;
}

export interface GenerationPackage {
  id: string;
  name: string;
  generations: number;
  price: number;  // 센트 단위
  stripe_price_id: string | null;
  is_active: boolean;
}

export interface Purchase {
  id: string;
  user_id: string;
  package_id: string | null;
  
  stripe_payment_intent_id: string | null;
  stripe_checkout_session_id: string | null;
  amount: number;
  currency: string;
  status: PurchaseStatus;
  
  generations_granted: number;
  created_at: string;
}

// API 응답 타입
export interface UsageInfo {
  used: number;
  included: number;
  purchased: number;
  rollover: number;
  remaining: number;
  plan: PlanId;
  period_end: string;
}

export interface UseGenerationResult {
  success: boolean;
  remaining: number;
  error_message: string | null;
}

// Stripe 관련 타입
export interface CheckoutSessionRequest {
  priceId: string;
  mode: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}
```

### Task 2.2: Stripe 클라이언트

**파일**: `lib/stripe.ts`

```typescript
import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-06-20',
  typescript: true,
});

// Price IDs (Stripe Dashboard에서 생성 후 입력)
export const STRIPE_PRICES = {
  pro_monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || '',
  pro_yearly: process.env.STRIPE_PRICE_PRO_YEARLY || '',
  team_monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY || '',
  team_yearly: process.env.STRIPE_PRICE_TEAM_YEARLY || '',
  pack_50: process.env.STRIPE_PRICE_PACK_50 || '',
  pack_150: process.env.STRIPE_PRICE_PACK_150 || '',
  pack_500: process.env.STRIPE_PRICE_PACK_500 || '',
  pack_2000: process.env.STRIPE_PRICE_PACK_2000 || '',
} as const;

// 플랜별 Price ID 매핑
export function getPriceIdForPlan(planId: string, interval: 'month' | 'year'): string {
  const key = `${planId}_${interval === 'month' ? 'monthly' : 'yearly'}` as keyof typeof STRIPE_PRICES;
  return STRIPE_PRICES[key] || '';
}

// 패키지별 Price ID 매핑
export function getPriceIdForPackage(packageId: string): string {
  return STRIPE_PRICES[packageId as keyof typeof STRIPE_PRICES] || '';
}
```

### Task 2.3: 과금 유틸리티

**파일**: `lib/billing.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { stripe, getPriceIdForPlan, getPriceIdForPackage } from '@/lib/stripe';
import type { 
  Subscription, 
  Plan, 
  UsageInfo, 
  GenerationPackage,
  PlanId 
} from '@/lib/types/billing';

// ============================================
// 구독 조회
// ============================================

export async function getSubscription(userId: string): Promise<Subscription | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return null;
  return data as Subscription;
}

export async function getSubscriptionWithPlan(userId: string): Promise<{
  subscription: Subscription;
  plan: Plan;
} | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      *,
      plan:plans(*)
    `)
    .eq('user_id', userId)
    .single();
  
  if (error || !data) return null;
  
  return {
    subscription: data as Subscription,
    plan: data.plan as Plan,
  };
}

// ============================================
// 사용량 조회
// ============================================

export async function getUsageInfo(userId: string): Promise<UsageInfo | null> {
  const sub = await getSubscription(userId);
  if (!sub) return null;
  
  const remaining = 
    sub.generations_included + 
    sub.generations_purchased + 
    sub.generations_rollover - 
    sub.generations_used;
  
  return {
    used: sub.generations_used,
    included: sub.generations_included,
    purchased: sub.generations_purchased,
    rollover: sub.generations_rollover,
    remaining: Math.max(remaining, 0),
    plan: sub.plan_id as PlanId,
    period_end: sub.current_period_end,
  };
}

// ============================================
// 플랜 조회
// ============================================

export async function getPlans(): Promise<Plan[]> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });
  
  if (error || !data) return [];
  return data as Plan[];
}

export async function getPlan(planId: string): Promise<Plan | null> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .eq('id', planId)
    .single();
  
  if (error || !data) return null;
  return data as Plan;
}

// ============================================
// 패키지 조회
// ============================================

export async function getGenerationPackages(): Promise<GenerationPackage[]> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('generation_packages')
    .select('*')
    .eq('is_active', true)
    .order('generations', { ascending: true });
  
  if (error || !data) return [];
  return data as GenerationPackage[];
}

// ============================================
// Stripe 고객 관리
// ============================================

export async function getOrCreateStripeCustomer(
  userId: string, 
  email: string
): Promise<string> {
  const sub = await getSubscription(userId);
  
  if (sub?.stripe_customer_id) {
    return sub.stripe_customer_id;
  }
  
  // Stripe 고객 생성
  const customer = await stripe.customers.create({
    email,
    metadata: {
      user_id: userId,
    },
  });
  
  // DB 업데이트
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('subscriptions')
    .update({ stripe_customer_id: customer.id })
    .eq('user_id', userId);
  
  return customer.id;
}

// ============================================
// Checkout 세션 생성
// ============================================

export async function createCheckoutSession(params: {
  userId: string;
  email: string;
  priceId: string;
  mode: 'subscription' | 'payment';
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}): Promise<{ url: string; sessionId: string }> {
  const customerId = await getOrCreateStripeCustomer(params.userId, params.email);
  
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: params.mode,
    line_items: [
      {
        price: params.priceId,
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      user_id: params.userId,
      ...params.metadata,
    },
    // 구독인 경우 추가 설정
    ...(params.mode === 'subscription' && {
      subscription_data: {
        metadata: {
          user_id: params.userId,
        },
      },
    }),
  });
  
  return {
    url: session.url!,
    sessionId: session.id,
  };
}

// ============================================
// Customer Portal 세션 생성
// ============================================

export async function createPortalSession(
  userId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const sub = await getSubscription(userId);
  
  if (!sub?.stripe_customer_id) {
    throw new Error('No Stripe customer found');
  }
  
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: returnUrl,
  });
  
  return { url: session.url };
}

// ============================================
// 구독 업데이트 (Webhook에서 호출)
// ============================================

export async function updateSubscriptionFromStripe(
  stripeSubscription: any,
  userId: string
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  
  // Price ID에서 Plan ID 추출 (또는 메타데이터에서)
  const priceId = stripeSubscription.items.data[0]?.price?.id;
  let planId: PlanId = 'pro';  // 기본값
  
  // Price ID로 플랜 매핑 (실제로는 DB 조회 또는 매핑 테이블 사용)
  if (priceId?.includes('team')) {
    planId = 'team';
  }
  
  const plan = await getPlan(planId);
  
  await supabase
    .from('subscriptions')
    .update({
      plan_id: planId,
      status: stripeSubscription.status,
      stripe_subscription_id: stripeSubscription.id,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(stripeSubscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
      generations_included: plan?.generations_per_month || 200,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}

// ============================================
// 구독 취소
// ============================================

export async function cancelSubscription(userId: string): Promise<void> {
  const sub = await getSubscription(userId);
  
  if (!sub?.stripe_subscription_id) {
    throw new Error('No active subscription found');
  }
  
  await stripe.subscriptions.update(sub.stripe_subscription_id, {
    cancel_at_period_end: true,
  });
  
  const supabase = await createServerSupabaseClient();
  await supabase
    .from('subscriptions')
    .update({ 
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId);
}
```

### Task 2.4: Generation 추적/차감

**파일**: `lib/usage.ts`

```typescript
import { createServerSupabaseClient } from '@/lib/supabase-server';
import type { UseGenerationResult, UsageEvent } from '@/lib/types/billing';
import { nanoid } from 'nanoid';

// ============================================
// Generation 사용 (핵심 함수)
// ============================================

export async function useGeneration(params: {
  userId: string;
  amount?: number;
  conversationId?: string;
  model?: string;
  description?: string;
}): Promise<UseGenerationResult> {
  const supabase = await createServerSupabaseClient();
  const idempotencyKey = `gen_${params.userId}_${nanoid(10)}`;
  
  const { data, error } = await supabase.rpc('use_generation', {
    p_user_id: params.userId,
    p_amount: params.amount || 1,
    p_conversation_id: params.conversationId || null,
    p_model: params.model || null,
    p_description: params.description || null,
    p_idempotency_key: idempotencyKey,
  });
  
  if (error) {
    console.error('use_generation error:', error);
    return {
      success: false,
      remaining: 0,
      error_message: error.message,
    };
  }
  
  // PostgreSQL 함수 반환값 처리
  const result = Array.isArray(data) ? data[0] : data;
  
  return {
    success: result?.success ?? false,
    remaining: result?.remaining ?? 0,
    error_message: result?.error_message ?? null,
  };
}

// ============================================
// Generation 잔액 확인
// ============================================

export async function getGenerationsRemaining(userId: string): Promise<number> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase.rpc('get_generations_remaining', {
    p_user_id: userId,
  });
  
  if (error) {
    console.error('get_generations_remaining error:', error);
    return 0;
  }
  
  return data ?? 0;
}

// ============================================
// Generation 추가 (구매 후)
// ============================================

export async function addGenerations(params: {
  userId: string;
  amount: number;
  type?: 'grant' | 'purchase' | 'rollover' | 'refund';
  description?: string;
}): Promise<number> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase.rpc('add_generations', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_type: params.type || 'grant',
    p_description: params.description || null,
  });
  
  if (error) {
    console.error('add_generations error:', error);
    throw error;
  }
  
  return data ?? 0;
}

// ============================================
// 사용 이력 조회
// ============================================

export async function getUsageHistory(
  userId: string,
  limit: number = 50
): Promise<UsageEvent[]> {
  const supabase = await createServerSupabaseClient();
  
  const { data, error } = await supabase
    .from('usage_events')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('getUsageHistory error:', error);
    return [];
  }
  
  return data as UsageEvent[];
}

// ============================================
// 일일 한도 확인 (Free 플랜용)
// ============================================

export async function checkDailyLimit(userId: string): Promise<{
  allowed: boolean;
  used: number;
  limit: number | null;
}> {
  const supabase = await createServerSupabaseClient();
  
  // 구독 정보 조회
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('plan_id')
    .eq('user_id', userId)
    .single();
  
  // 플랜의 일일 한도 조회
  const { data: plan } = await supabase
    .from('plans')
    .select('daily_limit')
    .eq('id', sub?.plan_id || 'free')
    .single();
  
  const dailyLimit = plan?.daily_limit;
  
  if (!dailyLimit) {
    return { allowed: true, used: 0, limit: null };
  }
  
  // 오늘 사용량 조회
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const { data: events } = await supabase
    .from('usage_events')
    .select('generations_delta')
    .eq('user_id', userId)
    .eq('event_type', 'generation')
    .gte('created_at', today.toISOString());
  
  const usedToday = events?.reduce((sum, e) => sum + Math.abs(e.generations_delta), 0) || 0;
  
  return {
    allowed: usedToday < dailyLimit,
    used: usedToday,
    limit: dailyLimit,
  };
}
```

---

## 🔧 Phase 3: API 라우트 (5일)

### Task 3.1: 사용량 조회 API

**파일**: `app/api/billing/usage/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { getUsageInfo, getSubscriptionWithPlan } from '@/lib/billing';
import { getUsageHistory, checkDailyLimit } from '@/lib/usage';

// GET /api/billing/usage - 사용량 정보 조회
export async function GET(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const { searchParams } = new URL(req.url);
    const includeHistory = searchParams.get('history') === 'true';
    const historyLimit = parseInt(searchParams.get('limit') || '20');
    
    // 기본 사용량 정보
    const usageInfo = await getUsageInfo(user.id);
    
    if (!usageInfo) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 });
    }
    
    // 구독+플랜 정보
    const subWithPlan = await getSubscriptionWithPlan(user.id);
    
    // 일일 한도 (Free 플랜)
    const dailyLimit = await checkDailyLimit(user.id);
    
    // 응답 구성
    const response: any = {
      usage: usageInfo,
      plan: subWithPlan?.plan,
      daily: dailyLimit,
    };
    
    // 히스토리 포함 옵션
    if (includeHistory) {
      response.history = await getUsageHistory(user.id, historyLimit);
    }
    
    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Usage API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Task 3.2: Checkout 세션 API

**파일**: `app/api/billing/checkout/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createCheckoutSession, getPriceIdForPlan, getPriceIdForPackage } from '@/lib/billing';
import { STRIPE_PRICES } from '@/lib/stripe';

// POST /api/billing/checkout - Checkout 세션 생성
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const body = await req.json();
    const { 
      type,           // 'subscription' | 'package'
      planId,         // 'pro' | 'team' (subscription인 경우)
      packageId,      // 'pack_50' | 'pack_150' | ... (package인 경우)
      interval,       // 'month' | 'year' (subscription인 경우)
    } = body;
    
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    let priceId: string;
    let mode: 'subscription' | 'payment';
    let metadata: Record<string, string> = {};
    
    if (type === 'subscription') {
      // 구독 결제
      if (!planId || !interval) {
        return NextResponse.json(
          { error: 'planId and interval are required for subscription' },
          { status: 400 }
        );
      }
      
      const priceKey = `${planId}_${interval === 'month' ? 'monthly' : 'yearly'}` as keyof typeof STRIPE_PRICES;
      priceId = STRIPE_PRICES[priceKey];
      
      if (!priceId) {
        return NextResponse.json(
          { error: 'Invalid plan or interval' },
          { status: 400 }
        );
      }
      
      mode = 'subscription';
      metadata = { plan_id: planId, interval };
      
    } else if (type === 'package') {
      // Generation 패키지 구매
      if (!packageId) {
        return NextResponse.json(
          { error: 'packageId is required for package purchase' },
          { status: 400 }
        );
      }
      
      priceId = STRIPE_PRICES[packageId as keyof typeof STRIPE_PRICES];
      
      if (!priceId) {
        return NextResponse.json(
          { error: 'Invalid package' },
          { status: 400 }
        );
      }
      
      mode = 'payment';
      metadata = { package_id: packageId };
      
    } else {
      return NextResponse.json(
        { error: 'type must be "subscription" or "package"' },
        { status: 400 }
      );
    }
    
    const session = await createCheckoutSession({
      userId: user.id,
      email: user.email!,
      priceId,
      mode,
      successUrl: `${baseUrl}/settings/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${baseUrl}/settings/billing?canceled=true`,
      metadata,
    });
    
    return NextResponse.json(session);
  } catch (error: any) {
    console.error('Checkout API error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Task 3.3: Customer Portal API

**파일**: `app/api/billing/portal/route.ts`

```typescript
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createPortalSession } from '@/lib/billing';

// POST /api/billing/portal - Customer Portal 세션 생성
export async function POST(req: Request) {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
    
    const session = await createPortalSession(
      user.id,
      `${baseUrl}/settings/billing`
    );
    
    return NextResponse.json(session);
  } catch (error: any) {
    console.error('Portal API error:', error);
    
    if (error.message === 'No Stripe customer found') {
      return NextResponse.json(
        { error: 'No subscription found. Please subscribe first.' },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Task 3.4: Stripe Webhook API

**파일**: `app/api/billing/webhook/route.ts`

```typescript
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe } from '@/lib/stripe';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { updateSubscriptionFromStripe } from '@/lib/billing';
import { addGenerations } from '@/lib/usage';

// Generation 패키지 매핑
const PACKAGE_GENERATIONS: Record<string, number> = {
  'pack_50': 50,
  'pack_150': 150,
  'pack_500': 500,
  'pack_2000': 2000,
};

export async function POST(req: Request) {
  const body = await req.text();
  const signature = headers().get('stripe-signature');
  
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }
  
  let event: Stripe.Event;
  
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }
  
  const supabase = await createServerSupabaseClient();
  
  try {
    switch (event.type) {
      // ========================================
      // 구독 관련 이벤트
      // ========================================
      
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        
        if (!userId) {
          console.error('No user_id in session metadata');
          break;
        }
        
        if (session.mode === 'subscription') {
          // 구독 완료 - Stripe에서 구독 정보 가져와서 업데이트
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string
          );
          await updateSubscriptionFromStripe(subscription, userId);
          
        } else if (session.mode === 'payment') {
          // Generation 패키지 구매 완료
          const packageId = session.metadata?.package_id;
          const generations = PACKAGE_GENERATIONS[packageId || ''] || 0;
          
          if (generations > 0) {
            // Generation 추가
            await addGenerations({
              userId,
              amount: generations,
              type: 'purchase',
              description: `Purchased ${packageId}`,
            });
            
            // 구매 기록
            await supabase.from('purchases').insert({
              user_id: userId,
              package_id: packageId,
              stripe_checkout_session_id: session.id,
              stripe_payment_intent_id: session.payment_intent as string,
              amount: session.amount_total || 0,
              status: 'completed',
              generations_granted: generations,
            });
          }
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        
        if (userId) {
          await updateSubscriptionFromStripe(subscription, userId);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        
        if (userId) {
          // Free 플랜으로 다운그레이드
          await supabase
            .from('subscriptions')
            .update({
              plan_id: 'free',
              status: 'canceled',
              stripe_subscription_id: null,
              generations_included: 20,
              updated_at: new Date().toISOString(),
            })
            .eq('user_id', userId);
        }
        break;
      }
      
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.user_id;
          
          if (userId) {
            // 새 기간 시작 - 사용량 리셋은 별도 cron에서 처리
            await updateSubscriptionFromStripe(subscription, userId);
          }
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string;
        
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const userId = subscription.metadata?.user_id;
          
          if (userId) {
            await supabase
              .from('subscriptions')
              .update({
                status: 'past_due',
                updated_at: new Date().toISOString(),
              })
              .eq('user_id', userId);
          }
        }
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error('Webhook handler error:', error);
    return NextResponse.json(
      { error: error.message || 'Webhook handler failed' },
      { status: 500 }
    );
  }
}

// Webhook은 raw body가 필요하므로 bodyParser 비활성화
export const config = {
  api: {
    bodyParser: false,
  },
};
```

### Task 3.5: Chat API 수정 (Generation 차감 추가)

**파일**: `app/api/chat/route.ts` (수정)

```typescript
import { handleAPIError, createRateLimitResponse } from '@/lib/api-errors'
import { Duration } from '@/lib/duration'
import { getModelClient, LLMModel, LLMModelConfig } from '@/lib/models'
import { buildSystemPrompt } from '@/lib/wireframe-prompt'
import ratelimit from '@/lib/ratelimit'
import { excalidrawSchema as schema } from '@/lib/schema'
import { streamObject, LanguageModel, CoreMessage } from 'ai'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { useGeneration, checkDailyLimit } from '@/lib/usage'

export const maxDuration = 300

const rateLimitMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS
  ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS)
  : 10
const ratelimitWindow = process.env.RATE_LIMIT_WINDOW
  ? (process.env.RATE_LIMIT_WINDOW as Duration)
  : '1d'

export async function POST(req: Request) {
  const {
    messages,
    currentElements,
    workflowMode,
    userID,
    teamID,
    model,
    config,
    conversationId,  // 추가: 대화 ID
  }: {
    messages: CoreMessage[]
    currentElements?: any[]
    workflowMode?: boolean
    userID: string | undefined
    teamID: string | undefined
    model: LLMModel
    config: LLMModelConfig
    conversationId?: string  // 추가
  } = await req.json()

  // ========================================
  // Generation 차감 로직 (새로 추가)
  // ========================================
  
  // 사용자 인증 확인 (Supabase 활성화된 경우)
  let authenticatedUserId: string | null = null;
  
  if (process.env.NEXT_PUBLIC_ENABLE_SUPABASE) {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    authenticatedUserId = user?.id || null;
    
    if (authenticatedUserId) {
      // 일일 한도 확인 (Free 플랜)
      const dailyCheck = await checkDailyLimit(authenticatedUserId);
      if (!dailyCheck.allowed) {
        return new Response(
          JSON.stringify({
            error: 'daily_limit_exceeded',
            message: `일일 한도(${dailyCheck.limit}회)에 도달했습니다. 내일 다시 시도하거나 Pro 플랜으로 업그레이드하세요.`,
            daily: dailyCheck,
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // Generation 차감 시도
      const usageResult = await useGeneration({
        userId: authenticatedUserId,
        amount: 1,
        conversationId: conversationId || undefined,
        model: model.id,
        description: 'Wireframe generation',
      });
      
      if (!usageResult.success) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_generations',
            message: usageResult.error_message || 'Generation이 부족합니다. 추가 구매하거나 플랜을 업그레이드하세요.',
            remaining: usageResult.remaining,
          }),
          { status: 402, headers: { 'Content-Type': 'application/json' } }
        );
      }
      
      // 남은 Generation 수를 응답 헤더에 포함
      // (클라이언트에서 UI 업데이트에 활용)
    }
  }

  // ========================================
  // 기존 Rate Limit 로직 (API Key 없는 경우만)
  // ========================================
  
  const limit = !config.apiKey && !authenticatedUserId
    ? await ratelimit(
        req.headers.get('x-forwarded-for'),
        rateLimitMaxRequests,
        ratelimitWindow,
      )
    : false

  if (limit) {
    return createRateLimitResponse(limit)
  }

  const { model: modelNameString, apiKey: modelApiKey, ...modelParams } = config
  const modelClient = getModelClient(model, config)

  try {
    // Build system prompt based on workflow mode and canvas state
    const systemPrompt = buildSystemPrompt(workflowMode ?? false, currentElements)

    const stream = await streamObject({
      model: modelClient as LanguageModel,
      schema,
      system: systemPrompt,
      messages,
      maxRetries: 0,
      maxTokens: 16000,
      ...modelParams,
    })

    // 응답에 Generation 정보 헤더 추가
    const response = stream.toTextStreamResponse();
    
    if (authenticatedUserId) {
      // 남은 Generation 수 조회해서 헤더에 추가
      const { getGenerationsRemaining } = await import('@/lib/usage');
      const remaining = await getGenerationsRemaining(authenticatedUserId);
      
      return new Response(response.body, {
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          'X-Generations-Remaining': remaining.toString(),
        },
      });
    }
    
    return response;
  } catch (error: any) {
    return handleAPIError(error, { hasOwnApiKey: !!config.apiKey })
  }
}
```

---

## 🔧 Phase 4: UI 컴포넌트 (7일)

### Task 4.1: 사용량 표시 컴포넌트

**파일**: `components/billing/usage-display.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Sparkles } from 'lucide-react';

interface UsageDisplayProps {
  onUpgradeClick?: () => void;
}

interface UsageInfo {
  used: number;
  included: number;
  purchased: number;
  rollover: number;
  remaining: number;
  plan: string;
  period_end: string;
}

export function UsageDisplay({ onUpgradeClick }: UsageDisplayProps) {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUsage = async () => {
    try {
      const res = await fetch('/api/billing/usage');
      if (res.ok) {
        const data = await res.json();
        setUsage(data.usage);
      }
    } catch (error) {
      console.error('Failed to fetch usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsage();
    
    // 1분마다 갱신
    const interval = setInterval(fetchUsage, 60000);
    return () => clearInterval(interval);
  }, []);

  // Generation 사용 이벤트 리스너
  useEffect(() => {
    const handleGenerationUsed = () => {
      fetchUsage();
    };
    
    window.addEventListener('generation-used', handleGenerationUsed);
    return () => window.removeEventListener('generation-used', handleGenerationUsed);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Sparkles className="w-4 h-4" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!usage) {
    return null;
  }

  const total = usage.included + usage.purchased + usage.rollover;
  const percentage = total > 0 ? (usage.used / total) * 100 : 0;
  const isLow = usage.remaining <= 10;
  const isCritical = usage.remaining <= 3;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className={`w-4 h-4 ${isCritical ? 'text-red-500' : isLow ? 'text-yellow-500' : 'text-primary'}`} />
              <span className={`text-sm font-medium ${isCritical ? 'text-red-500' : isLow ? 'text-yellow-500' : ''}`}>
                {usage.remaining}
              </span>
            </div>
            
            {/* Progress bar */}
            <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  isCritical ? 'bg-red-500' : isLow ? 'bg-yellow-500' : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100 - percentage, 100)}%` }}
              />
            </div>
            
            {isLow && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 px-2 text-xs"
                onClick={onUpgradeClick}
              >
                + 추가
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-sm">
            <p className="font-medium">Generation 잔액: {usage.remaining}회</p>
            <p className="text-muted-foreground">
              사용: {usage.used} / 총: {total}
            </p>
            {usage.rollover > 0 && (
              <p className="text-muted-foreground">이월: {usage.rollover}회</p>
            )}
            <p className="text-muted-foreground text-xs mt-1">
              {new Date(usage.period_end).toLocaleDateString('ko-KR')}에 리셋
            </p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
```

### Task 4.2: 업그레이드 유도 다이얼로그

**파일**: `components/billing/upgrade-prompt.tsx`

```typescript
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Sparkles, Zap, Crown } from 'lucide-react';

interface UpgradePromptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reason: 'limit_reached' | 'daily_limit' | 'feature_locked';
  remaining?: number;
}

export function UpgradePrompt({ 
  open, 
  onOpenChange, 
  reason,
  remaining = 0 
}: UpgradePromptProps) {
  const [loading, setLoading] = useState(false);

  const handlePurchasePackage = async (packageId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'package',
          packageId,
        }),
      });
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgradePlan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subscription',
          planId: 'pro',
          interval: 'month',
        }),
      });
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(false);
    }
  };

  const titles: Record<string, string> = {
    limit_reached: 'Generation이 부족합니다',
    daily_limit: '일일 한도에 도달했습니다',
    feature_locked: '이 기능은 Pro 이상에서 사용 가능합니다',
  };

  const descriptions: Record<string, string> = {
    limit_reached: `현재 ${remaining}회 남았습니다. 추가 구매하거나 Pro로 업그레이드하세요.`,
    daily_limit: 'Free 플랜은 하루 5회로 제한됩니다. Pro로 업그레이드하면 무제한으로 사용할 수 있습니다.',
    feature_locked: '프리미엄 모델, 무제한 프로젝트, 대화 저장 등의 기능을 사용하려면 Pro 이상으로 업그레이드하세요.',
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-500" />
            {titles[reason]}
          </DialogTitle>
          <DialogDescription>
            {descriptions[reason]}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 추가 구매 옵션 */}
          {reason === 'limit_reached' && (
            <div className="space-y-2">
              <p className="text-sm font-medium">추가 구매</p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => handlePurchasePackage('pack_50')}
                  disabled={loading}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  50회 - $5
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handlePurchasePackage('pack_150')}
                  disabled={loading}
                >
                  <Zap className="w-4 h-4 mr-1" />
                  150회 - $12
                </Button>
              </div>
            </div>
          )}

          {/* Pro 업그레이드 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">플랜 업그레이드</p>
            <Button
              className="w-full"
              onClick={handleUpgradePlan}
              disabled={loading}
            >
              <Crown className="w-4 h-4 mr-2" />
              Pro 플랜 - $15/월 (200회 포함)
            </Button>
          </div>

          {reason === 'daily_limit' && (
            <p className="text-xs text-muted-foreground text-center">
              또는 내일 다시 시도하세요 (자정에 리셋됩니다)
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### Task 4.3: 가격 페이지

**파일**: `app/pricing/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  name: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  generations_per_month: number;
  features: string[];
}

export default function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [interval, setInterval] = useState<'month' | 'year'>('month');
  const [loading, setLoading] = useState<string | null>(null);
  const [currentPlan, setCurrentPlan] = useState<string>('free');

  useEffect(() => {
    // 플랜 목록 조회
    fetch('/api/billing/plans')
      .then(res => res.json())
      .then(data => setPlans(data.plans || []))
      .catch(console.error);
    
    // 현재 구독 조회
    fetch('/api/billing/usage')
      .then(res => res.json())
      .then(data => setCurrentPlan(data.usage?.plan || 'free'))
      .catch(console.error);
  }, []);

  const handleSelectPlan = async (planId: string) => {
    if (planId === 'free' || planId === 'enterprise') return;
    
    setLoading(planId);
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'subscription',
          planId,
          interval,
        }),
      });
      
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (error) {
      console.error('Checkout error:', error);
    } finally {
      setLoading(null);
    }
  };

  const formatPrice = (cents: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(cents / 100);
  };

  return (
    <div className="container py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">심플한 가격, 강력한 기능</h1>
        <p className="text-xl text-muted-foreground mb-8">
          AI 와이어프레임 생성에 필요한 모든 것
        </p>
        
        {/* 월간/연간 토글 */}
        <div className="inline-flex items-center rounded-lg border p-1">
          <Button
            variant={interval === 'month' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setInterval('month')}
          >
            월간
          </Button>
          <Button
            variant={interval === 'year' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setInterval('year')}
          >
            연간 <span className="ml-1 text-xs text-green-500">20% 할인</span>
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
        {plans.map((plan) => {
          const isCurrentPlan = currentPlan === plan.id;
          const isPro = plan.id === 'pro';
          const price = interval === 'year' && plan.price_yearly 
            ? plan.price_yearly / 12 
            : plan.price_monthly;
          
          return (
            <Card 
              key={plan.id}
              className={cn(
                'relative',
                isPro && 'border-primary shadow-lg'
              )}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full">
                  인기
                </div>
              )}
              
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {plan.name}
                  {plan.id !== 'free' && <Sparkles className="w-4 h-4" />}
                </CardTitle>
                <CardDescription>{plan.description}</CardDescription>
              </CardHeader>
              
              <CardContent>
                <div className="mb-6">
                  {plan.price_monthly === 0 ? (
                    <div className="text-4xl font-bold">무료</div>
                  ) : plan.id === 'enterprise' ? (
                    <div className="text-4xl font-bold">맞춤</div>
                  ) : (
                    <>
                      <span className="text-4xl font-bold">{formatPrice(price)}</span>
                      <span className="text-muted-foreground">/월</span>
                    </>
                  )}
                </div>
                
                <div className="text-sm font-medium mb-4">
                  월 {plan.generations_per_month.toLocaleString()} Generation
                </div>
                
                <ul className="space-y-2">
                  {plan.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
              
              <CardFooter>
                {plan.id === 'free' ? (
                  <Button variant="outline" className="w-full" disabled={isCurrentPlan}>
                    {isCurrentPlan ? '현재 플랜' : '시작하기'}
                  </Button>
                ) : plan.id === 'enterprise' ? (
                  <Button variant="outline" className="w-full">
                    문의하기
                  </Button>
                ) : (
                  <Button 
                    className="w-full" 
                    variant={isPro ? 'default' : 'outline'}
                    onClick={() => handleSelectPlan(plan.id)}
                    disabled={loading === plan.id || isCurrentPlan}
                  >
                    {loading === plan.id ? '처리 중...' : isCurrentPlan ? '현재 플랜' : '선택하기'}
                  </Button>
                )}
              </CardFooter>
            </Card>
          );
        })}
      </div>

      {/* 추가 Generation 패키지 */}
      <div className="mt-16 text-center">
        <h2 className="text-2xl font-bold mb-4">더 필요하신가요?</h2>
        <p className="text-muted-foreground mb-8">
          언제든 추가 Generation을 구매할 수 있습니다
        </p>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
          {[
            { id: 'pack_50', name: '50회', price: 500 },
            { id: 'pack_150', name: '150회', price: 1200 },
            { id: 'pack_500', name: '500회', price: 3500 },
            { id: 'pack_2000', name: '2000회', price: 10000 },
          ].map((pkg) => (
            <Card key={pkg.id} className="p-4">
              <div className="font-bold text-lg">{pkg.name}</div>
              <div className="text-2xl font-bold">{formatPrice(pkg.price)}</div>
              <div className="text-xs text-muted-foreground mb-3">
                {formatPrice(pkg.price / parseInt(pkg.name))} /회
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => {
                  // 패키지 구매 로직
                }}
              >
                구매
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Task 4.4: 결제 설정 페이지

**파일**: `app/settings/billing/page.tsx`

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  CreditCard, 
  Sparkles, 
  Calendar, 
  TrendingUp,
  ExternalLink,
  Download
} from 'lucide-react';

interface UsageInfo {
  used: number;
  included: number;
  purchased: number;
  rollover: number;
  remaining: number;
  plan: string;
  period_end: string;
}

interface SubscriptionInfo {
  plan_id: string;
  status: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

export default function BillingSettingsPage() {
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    fetchBillingData();
  }, []);

  const fetchBillingData = async () => {
    try {
      const res = await fetch('/api/billing/usage?history=true&limit=20');
      if (res.ok) {
        const data = await res.json();
        setUsage(data.usage);
        setHistory(data.history || []);
        // subscription 정보도 별도 API에서 가져오거나 usage에 포함
      }
    } catch (error) {
      console.error('Failed to fetch billing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch('/api/billing/portal', { method: 'POST' });
      const data = await res.json();
      
      if (data.url) {
        window.location.href = data.url;
      } else if (data.error) {
        alert(data.error);
      }
    } catch (error) {
      console.error('Portal error:', error);
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) {
    return <div className="container py-8">로딩 중...</div>;
  }

  const total = usage 
    ? usage.included + usage.purchased + usage.rollover 
    : 0;
  const percentage = total > 0 && usage ? (usage.used / total) * 100 : 0;

  return (
    <div className="container py-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">결제 및 사용량</h1>
      
      <div className="grid gap-6">
        {/* 현재 플랜 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="w-5 h-5" />
              현재 플랜
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold capitalize">
                  {usage?.plan || 'Free'} 플랜
                </div>
                <div className="text-muted-foreground">
                  {usage?.plan === 'free' 
                    ? '무료' 
                    : usage?.plan === 'pro' 
                      ? '$15/월' 
                      : '$35/인/월'}
                </div>
              </div>
              <div className="flex gap-2">
                {usage?.plan !== 'free' && (
                  <Button 
                    variant="outline"
                    onClick={handleOpenPortal}
                    disabled={portalLoading}
                  >
                    {portalLoading ? '로딩...' : '결제 관리'}
                    <ExternalLink className="w-4 h-4 ml-2" />
                  </Button>
                )}
                {usage?.plan === 'free' && (
                  <Button asChild>
                    <a href="/pricing">업그레이드</a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 사용량 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              이번 달 사용량
            </CardTitle>
            <CardDescription>
              {usage?.period_end && (
                <>
                  {new Date(usage.period_end).toLocaleDateString('ko-KR')}에 리셋됩니다
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {/* 프로그레스 바 */}
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>{usage?.used || 0} 사용됨</span>
                  <span>{usage?.remaining || 0} 남음</span>
                </div>
                <div className="h-3 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
              
              {/* 상세 내역 */}
              <div className="grid grid-cols-3 gap-4 pt-4">
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{usage?.included || 0}</div>
                  <div className="text-sm text-muted-foreground">기본 포함</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{usage?.purchased || 0}</div>
                  <div className="text-sm text-muted-foreground">추가 구매</div>
                </div>
                <div className="text-center p-4 bg-muted rounded-lg">
                  <div className="text-2xl font-bold">{usage?.rollover || 0}</div>
                  <div className="text-sm text-muted-foreground">이월</div>
                </div>
              </div>
              
              {usage && usage.remaining < 20 && (
                <Button className="w-full mt-4" asChild>
                  <a href="/pricing#packages">Generation 추가 구매</a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 사용 이력 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              최근 사용 이력
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                아직 사용 이력이 없습니다
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((event) => (
                  <div 
                    key={event.id}
                    className="flex items-center justify-between py-2 border-b last:border-0"
                  >
                    <div>
                      <div className="font-medium">
                        {event.event_type === 'generation' ? '와이어프레임 생성' :
                         event.event_type === 'purchase' ? 'Generation 구매' :
                         event.event_type === 'reset' ? '월간 리셋' :
                         event.description || event.event_type}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(event.created_at).toLocaleString('ko-KR')}
                      </div>
                    </div>
                    <div className={`font-medium ${
                      event.generations_delta > 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {event.generations_delta > 0 ? '+' : ''}{event.generations_delta}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

### Task 4.5: Navbar에 사용량 표시 추가

**파일**: `components/navbar.tsx` 수정

```typescript
// 기존 navbar.tsx에 UsageDisplay 추가

import { UsageDisplay } from '@/components/billing/usage-display';

// ... 기존 코드 ...

// 로그인 상태일 때 표시되는 부분에 추가:
{session && (
  <div className="flex items-center gap-4">
    <UsageDisplay onUpgradeClick={() => setShowUpgradeDialog(true)} />
    {/* 기존 프로필/로그아웃 버튼 등 */}
  </div>
)}
```

---

## 🔧 Phase 5: 환경 변수 및 설정 (1일)

### Task 5.1: 환경 변수 추가

**파일**: `.env.local` (추가할 변수들)

```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Stripe Price IDs (Stripe Dashboard에서 생성 후 입력)
STRIPE_PRICE_PRO_MONTHLY=price_...
STRIPE_PRICE_PRO_YEARLY=price_...
STRIPE_PRICE_TEAM_MONTHLY=price_...
STRIPE_PRICE_TEAM_YEARLY=price_...
STRIPE_PRICE_PACK_50=price_...
STRIPE_PRICE_PACK_150=price_...
STRIPE_PRICE_PACK_500=price_...
STRIPE_PRICE_PACK_2000=price_...

# Site URL (웹훅 등에서 사용)
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Task 5.2: package.json 의존성 추가

```bash
npm install stripe
```

### Task 5.3: Stripe 상품/가격 생성 스크립트

**파일**: `scripts/setup-stripe.ts`

```typescript
import Stripe from 'stripe';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

async function setupStripe() {
  console.log('Setting up Stripe products and prices...\n');

  // 1. Pro 플랜 상품
  const proProduct = await stripe.products.create({
    name: 'Vibeframe Pro',
    description: '개인 디자이너/개발자를 위한 플랜 - 월 200 Generation',
  });
  console.log('Created Pro product:', proProduct.id);

  const proMonthly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 1500,  // $15
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log('Pro monthly price:', proMonthly.id);

  const proYearly = await stripe.prices.create({
    product: proProduct.id,
    unit_amount: 14400,  // $144/year ($12/month)
    currency: 'usd',
    recurring: { interval: 'year' },
  });
  console.log('Pro yearly price:', proYearly.id);

  // 2. Team 플랜 상품
  const teamProduct = await stripe.products.create({
    name: 'Vibeframe Team',
    description: '팀을 위한 플랜 - 인당 월 500 Generation',
  });
  console.log('Created Team product:', teamProduct.id);

  const teamMonthly = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 3500,  // $35
    currency: 'usd',
    recurring: { interval: 'month' },
  });
  console.log('Team monthly price:', teamMonthly.id);

  const teamYearly = await stripe.prices.create({
    product: teamProduct.id,
    unit_amount: 36000,  // $360/year ($30/month)
    currency: 'usd',
    recurring: { interval: 'year' },
  });
  console.log('Team yearly price:', teamYearly.id);

  // 3. Generation 패키지들
  const packagesData = [
    { name: '50 Generations', amount: 500, gens: 50 },
    { name: '150 Generations', amount: 1200, gens: 150 },
    { name: '500 Generations', amount: 3500, gens: 500 },
    { name: '2000 Generations', amount: 10000, gens: 2000 },
  ];

  for (const pkg of packagesData) {
    const product = await stripe.products.create({
      name: `Vibeframe ${pkg.name}`,
      description: `${pkg.gens} Generation 추가 패키지`,
    });
    
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: pkg.amount,
      currency: 'usd',
    });
    
    console.log(`Pack ${pkg.gens} price:`, price.id);
  }

  console.log('\n✅ Stripe setup complete!');
  console.log('\nAdd these to your .env.local:');
  console.log(`STRIPE_PRICE_PRO_MONTHLY=${proMonthly.id}`);
  console.log(`STRIPE_PRICE_PRO_YEARLY=${proYearly.id}`);
  console.log(`STRIPE_PRICE_TEAM_MONTHLY=${teamMonthly.id}`);
  console.log(`STRIPE_PRICE_TEAM_YEARLY=${teamYearly.id}`);
}

setupStripe().catch(console.error);
```

---

## 🧪 Phase 6: 테스트 및 배포 (3일)

### Task 6.1: 테스트 체크리스트

```markdown
## 테스트 체크리스트

### 데이터베이스
- [ ] 새 사용자 가입 시 Free 구독 자동 생성
- [ ] `get_generations_remaining()` 함수 정상 동작
- [ ] `use_generation()` 함수 정상 동작 및 멱등성
- [ ] `add_generations()` 함수 정상 동작
- [ ] RLS 정책 - 본인 데이터만 조회 가능

### API
- [ ] GET /api/billing/usage - 사용량 조회
- [ ] POST /api/billing/checkout - 구독 Checkout
- [ ] POST /api/billing/checkout - 패키지 Checkout
- [ ] POST /api/billing/portal - Customer Portal
- [ ] POST /api/billing/webhook - 모든 이벤트 타입

### Generation 차감
- [ ] 로그인 사용자 - Generation 차감됨
- [ ] 비로그인 사용자 - Rate limit만 적용
- [ ] Generation 부족 시 402 에러
- [ ] 일일 한도 초과 시 429 에러 (Free)

### UI
- [ ] 헤더 사용량 표시 실시간 업데이트
- [ ] 업그레이드 다이얼로그 정상 표시
- [ ] 가격 페이지 플랜 선택 및 결제
- [ ] 결제 설정 페이지 정보 표시
- [ ] Customer Portal 연동

### Stripe Webhook
- [ ] checkout.session.completed (구독)
- [ ] checkout.session.completed (패키지)
- [ ] customer.subscription.updated
- [ ] customer.subscription.deleted
- [ ] invoice.paid
- [ ] invoice.payment_failed
```

### Task 6.2: Stripe CLI로 Webhook 테스트

```bash
# Stripe CLI 설치
brew install stripe/stripe-cli/stripe

# 로그인
stripe login

# Webhook 포워딩
stripe listen --forward-to localhost:3000/api/billing/webhook

# 테스트 이벤트 트리거
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

### Task 6.3: 배포 체크리스트

```markdown
## 배포 전 체크리스트

### Stripe 설정
- [ ] Production API keys 설정
- [ ] Webhook endpoint 등록 (Stripe Dashboard)
- [ ] Customer Portal 설정

### 환경 변수
- [ ] STRIPE_SECRET_KEY (production)
- [ ] STRIPE_WEBHOOK_SECRET (production)
- [ ] STRIPE_PRICE_* (production price IDs)
- [ ] NEXT_PUBLIC_SITE_URL (production URL)

### Supabase
- [ ] Migration 실행
- [ ] RLS 정책 확인
- [ ] Cron job 설정 (월간 리셋)

### 모니터링
- [ ] 에러 로깅 설정
- [ ] 결제 실패 알림 설정
```

---

## 📊 마일스톤 요약

| Phase | 작업 | 예상 기간 | 산출물 |
|-------|------|----------|--------|
| 1 | 데이터베이스 스키마 | 3일 | `002_billing_schema.sql` |
| 2 | 백엔드 라이브러리 | 4일 | `stripe.ts`, `billing.ts`, `usage.ts` |
| 3 | API 라우트 | 5일 | 5개 API 엔드포인트 |
| 4 | UI 컴포넌트 | 7일 | 10+ 컴포넌트, 2 페이지 |
| 5 | 환경 설정 | 1일 | `.env`, Stripe 설정 |
| 6 | 테스트 및 배포 | 3일 | 테스트 통과, 배포 완료 |

**총 예상 기간**: 23일 (약 5주)

---

## 🚨 주의사항

1. **Stripe Webhook 보안**: `STRIPE_WEBHOOK_SECRET` 반드시 검증
2. **멱등성**: `idempotency_key`로 중복 처리 방지
3. **RLS**: 모든 billing 테이블에 Row Level Security 적용
4. **에러 처리**: 결제 실패 시 사용자에게 명확한 안내
5. **테스트 모드**: 개발 중에는 Stripe Test Mode 사용

---

## 📝 AI 개발 지시사항

이 문서를 받은 AI는 다음 순서로 개발을 진행하세요:

1. Phase 1부터 순차적으로 진행
2. 각 Task 완료 후 다음 Task로 이동
3. 코드 작성 시 주석과 에러 처리 포함
4. 기존 코드 수정 시 전체 파일이 아닌 변경 부분만 명시
5. 환경 변수는 예시 값으로 작성, 실제 값은 사용자가 입력
6. 테스트 코드 작성 권장

**절대 건너뛰지 말 것**: 데이터베이스 마이그레이션, Webhook 핸들링, RLS 정책
