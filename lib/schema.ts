import { z } from 'zod'

// ============================================
// Wireframe Workflow Schema (Excalidraw)
// ============================================

// Workflow Mode Types
export const workflowModeSchema = z.enum(['chat', 'expert', 'guided', 'auto'])
export type WorkflowMode = z.infer<typeof workflowModeSchema>

// New Phase-based Step Schema
export const wireframeStepSchema = z.enum([
  // Phase 0: User Profiling
  'profile_role',           // Q0-1: 당신은 누구인가요?
  'profile_purpose',        // Q0-2: 이 와이어프레임으로 뭘 하고 싶어요?
  'profile_mode',           // Q0-3: 어떤 스타일로 진행하고 싶어요?
  
  // Phase 1: Service Understanding
  'service_platform',       // Q1-1: 플랫폼
  'service_type',           // Q1-2: 서비스 종류
  'service_description',    // Q1-3: 한 줄 설명
  'service_goal',           // Q1-4: 핵심 목표 (Guided)
  'service_target',         // Q1-5: 타겟 사용자 (Guided)
  'service_context',        // Q1-6: 사용 상황 (Guided)
  
  // Phase 2: First Impression & Core Flow
  'impression_feeling',     // Q2-1: 첫 화면 느낌
  'impression_action',      // Q2-2: 핵심 액션
  'impression_info',        // Q2-3: 필요한 정보
  
  // Phase 3: Content Blocks
  'content_sections',       // Q3-1: 콘텐츠 블록
  'content_features',       // Q3-2: 기능 소개 상세
  'content_pricing',        // Q3-3: 가격 정보
  
  // Phase 4: Navigation & Structure
  'nav_menu',               // Q4-1: 메뉴 구성
  'nav_header',             // Q4-2: 헤더 구성
  'nav_footer',             // Q4-3: 푸터 구성
  
  // Phase 5: Platform-Specific
  'platform_mobile_nav',    // Q5-M1: 모바일 네비게이션
  'platform_mobile_bottom', // Q5-M2: 바텀 네비
  'platform_mobile_fab',    // Q5-M3: FAB
  'platform_dashboard',     // Q5-D1: 대시보드 요소
  'platform_dashboard_chart', // Q5-D2: 차트 종류
  'platform_ecommerce',     // Q5-E1: 상품 레이아웃
  'platform_ecommerce_card', // Q5-E2: 상품 카드
  
  // Phase 6: Style & Tone
  'style_tone',             // Q6-1: 전체 느낌
  'style_density',          // Q6-2: 정보 밀도
  'style_corners',          // Q6-3: 모서리 스타일
  'style_theme',            // Q6-4: 테마 컬러
  
  // Phase 7: Final
  'final_confirm',          // Q7-1: 최종 확인
  'building',               // 와이어프레임 생성 중
  'complete'                // 완료
])

export const wireframeTypeSchema = z.enum([
  'website_desktop',
  'mobile_app',
  'web_app_responsive',
  'webapp_saas',
  'tablet_app'
])

export const serviceTypeSchema = z.enum([
  'landing',
  'ecommerce',
  'dashboard',
  'saas',
  'blog',
  'portfolio',
  'community',
  'other'
])

export const userRoleSchema = z.enum([
  'designer',
  'developer',
  'pm',
  'founder',
  'marketer'
])

export const styleToneSchema = z.enum([
  'light_clean',
  'dark_modern',
  'colorful',
  'minimal',
  'corporate',
  'friendly'
])

export const themeStyleSchema = z.enum([
  'classic_wireframe',
  'high_contrast',
  'blueprint',
  'auto'
])

// Excalidraw element schema - permissive to allow AI flexibility
export const excalidrawElementSchema = z.any()

// Element update operation schema for partial updates
export const elementUpdateSchema = z.object({
  operation: z.enum(['update', 'delete']).describe('update: modify existing element, delete: remove element'),
  element_id: z.string().describe('ID of the element to update or delete'),
  changes: z.record(z.any()).optional().describe('Properties to update (only for update operation)'),
})

export type ElementUpdate = z.infer<typeof elementUpdateSchema>

export const excalidrawSchema = z.object({
  current_step: wireframeStepSchema.describe('Current step in the workflow'),
  workflow_mode: workflowModeSchema.optional().describe('Current workflow mode'),

  user_profile: z.object({
    role: userRoleSchema.optional(),
    purpose: z.string().optional(),
    mode: workflowModeSchema.optional(),
  }).optional(),

  service_info: z.object({
    platform: wireframeTypeSchema.optional(),
    type: serviceTypeSchema.optional(),
    description: z.string().optional(),
    goal: z.string().optional(),
    target: z.string().optional(),
    context: z.string().optional(),
  }).optional(),

  structure_info: z.object({
    hero_style: z.string().optional(),
    primary_action: z.string().optional(),
    sections: z.array(z.string()).optional(),
    header_elements: z.array(z.string()).optional(),
    footer_style: z.string().optional(),
    menu_count: z.number().optional(),
  }).optional(),

  platform_info: z.object({
    mobile_nav: z.string().optional(),
    bottom_nav_count: z.number().optional(),
    has_fab: z.boolean().optional(),
    dashboard_elements: z.array(z.string()).optional(),
    chart_types: z.array(z.string()).optional(),
    product_grid: z.string().optional(),
    product_card_info: z.array(z.string()).optional(),
  }).optional(),

  style_info: z.object({
    tone: styleToneSchema.optional(),
    density: z.enum(['spacious', 'balanced', 'compact']).optional(),
    corners: z.enum(['sharp', 'slightly_rounded', 'rounded', 'pill']).optional(),
    theme: themeStyleSchema.optional(),
  }).optional(),

  wireframe_type: wireframeTypeSchema.optional(),
  theme_style: themeStyleSchema.optional(),
  theme_colors: z.object({
    background: z.string(),
    container: z.string(),
    border: z.string(),
    text: z.string()
  }).optional(),

  structure_plan: z.object({
    screens: z.array(z.object({
      name: z.string(),
      purpose: z.string(),
      ui_elements: z.array(z.string())
    })),
    navigation_flow: z.array(z.object({
      from: z.string(),
      to: z.string(),
      action: z.string()
    })).optional()
  }).optional(),

  excalidraw_elements: z.array(excalidrawElementSchema).optional(),
  element_updates: z.array(elementUpdateSchema).optional(),

  commentary: z.string().describe('AI explanation'),
  title: z.string().describe('Short title'),
  description: z.string().describe('Brief description'),

  awaiting_input: z.boolean().describe('Whether AI is waiting for user input'),
  input_prompt: z.string().optional(),
  input_options: z.array(z.string()).optional(),
})

export type ExcalidrawSchema = z.infer<typeof excalidrawSchema>
export type ExcalidrawElement = z.infer<typeof excalidrawElementSchema>

// ============================================
// Legacy Fragment Schema (kept for reference)
// ============================================

export const fragmentSchema = z.object({
  commentary: z
    .string()
    .describe(
      `Describe what you're about to do and the steps you want to take for generating the fragment in great detail.`,
    ),
  template: z
    .string()
    .describe('Name of the template used to generate the fragment.'),
  title: z.string().describe('Short title of the fragment. Max 3 words.'),
  description: z
    .string()
    .describe('Short description of the fragment. Max 1 sentence.'),
  additional_dependencies: z
    .array(z.string())
    .describe(
      'Additional dependencies required by the fragment. Do not include dependencies that are already included in the template.',
    ),
  has_additional_dependencies: z
    .boolean()
    .describe(
      'Detect if additional dependencies that are not included in the template are required by the fragment.',
    ),
  install_dependencies_command: z
    .string()
    .describe(
      'Command to install additional dependencies required by the fragment.',
    ),
  port: z
    .number()
    .nullable()
    .describe(
      'Port number used by the resulted fragment. Null when no ports are exposed.',
    ),
  file_path: z
    .string()
    .describe('Relative path to the file, including the file name.'),
  code: z
    .string()
    .describe('Code generated by the fragment. Only runnable code is allowed.'),
})

export type FragmentSchema = z.infer<typeof fragmentSchema>

// Schema for morph edit instructions
export const morphEditSchema = z.object({
  commentary: z
    .string()
    .describe('Explain what changes you are making and why'),
  instruction: z
    .string()
    .describe('One line instruction on what the change is'),
  edit: z
    .string()
    .describe(
      "You should make it clear what the edit is, while also minimizing the unchanged code you write. When writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines. For example: // ... existing code ... FIRST_EDIT // ... existing code ... SECOND_EDIT // ... existing code ... THIRD_EDIT // ... existing code ... Be Lazy when outputting code, rely heavily on the exisitng code comments, but each edit should contain minimally sufficient context of unchanged lines around the code you're editing to resolve ambiguity. DO NOT omit spans of pre-existing code (or comments) without using the // ... existing code ... comment to indicate its absence. If you omit the existing code comment, the model may inadvertently delete these lines. If you plan on deleting a section, you must provide context before and after to delete it. If the initial code is ```code \\n Block 1 \\n Block 2 \\n Block 3 \\n code```, and you want to remove Block 2, you would output ```// ... existing code ... \\n Block 1 \\n  Block 3 \\n // ... existing code ...```. ",
    ),
  file_path: z.string().describe('Path to the file being edited'),
})

export type MorphEditSchema = z.infer<typeof morphEditSchema>
