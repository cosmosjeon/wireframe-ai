import { z } from 'zod'

// ============================================
// Wireframe Workflow Schema (Excalidraw)
// ============================================

export const wireframeStepSchema = z.enum([
  'contextual_analysis',      // Step 0
  'wireframe_type_selection', // Step 1
  'requirements_gathering',   // Step 2
  'theme_detection',          // Step 3
  'theme_selection',          // Step 4
  'structure_planning',       // Step 5
  'resource_loading',         // Step 6
  'element_building',         // Step 7
  'optimization',             // Step 8
  'json_validation',          // Step 9
  'content_validation',       // Step 10
  'complete'
])

export const wireframeTypeSchema = z.enum([
  'website_desktop',
  'mobile_app',
  'web_app_responsive',
  'tablet_app',
  'multi_platform'
])

export const fidelityLevelSchema = z.enum(['low', 'medium', 'high'])

export const themeStyleSchema = z.enum([
  'classic_wireframe',
  'high_contrast',
  'blueprint',
  'custom'
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
  // Workflow state tracking
  current_step: wireframeStepSchema.describe('Current step in the 10-step workflow'),

  // Step 0-4 outputs (requirements gathering)
  wireframe_type: wireframeTypeSchema.optional().describe('Selected wireframe type'),
  fidelity_level: fidelityLevelSchema.optional().describe('Low/Medium/High detail level'),
  screen_count: z.number().optional().describe('Number of screens to generate'),
  device_dimensions: z.object({
    width: z.number(),
    height: z.number()
  }).optional().describe('Device viewport dimensions'),
  theme_style: themeStyleSchema.optional().describe('Selected theme style'),
  theme_colors: z.object({
    background: z.string(),
    container: z.string(),
    border: z.string(),
    text: z.string()
  }).optional().describe('Theme color palette'),

  // Step 5 output (structure)
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
  }).optional().describe('Planned wireframe structure'),

  // Step 7 output (the actual Excalidraw elements)
  excalidraw_elements: z.array(excalidrawElementSchema).optional().describe('Full Excalidraw elements array - use for new wireframes'),

  // Partial update mode (for modifications - more efficient)
  element_updates: z.array(elementUpdateSchema).optional().describe('Partial updates - use for modifying existing elements instead of returning full array'),

  // UI fields
  commentary: z.string().describe('AI explanation of current step and what it needs from user'),
  title: z.string().describe('Short title for the wireframe project'),
  description: z.string().describe('Brief description of the wireframe'),

  // Interaction control
  awaiting_input: z.boolean().describe('Whether AI is waiting for user input'),
  input_prompt: z.string().optional().describe('What input the AI needs from the user'),
  input_options: z.array(z.string()).optional().describe('Numbered options for user to choose from'),
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
