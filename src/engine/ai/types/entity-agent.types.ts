export type EntityPipelineIntent = 'support' | 'sales' | 'info' | 'general'

export type EntityMood =
  | 'calm' | 'frustrated' | 'urgent' | 'curious'
  | 'satisfied' | 'confused' | 'ready_to_buy' | 'hesitant'

export type SalesPsychSignal =
  | 'price_sensitive' | 'risk_averse' | 'comparison_shopping' | 'ready_to_buy'
  | 'needs_more_info' | 'objecting' | 'stalling'

export type SalesObjectionType =
  | 'price' | 'timing' | 'competition' | 'trust' | 'need' | 'authority' | 'none'

export type SalesTechnique =
  | 'consultative' | 'challenger' | 'solution' | 'social_proof'
  | 'urgency' | 'value_based' | 'feel_felt_found' | 'spin'

export interface IntentAnalysisResult {
  intent:       EntityPipelineIntent
  mood:         EntityMood
  language:     string
  confidence:   number
  is_staff:     boolean
  summary:      string
  is_new_topic: boolean
}

export interface SupportProblemResult {
  problem_category:    string
  affected_module:     string
  urgency:             1 | 2 | 3 | 4 | 5
  problem_summary:     string
  related_record_ids:  string[]
  needs_db_lookup:     boolean
}

export interface SupportSolutionResult {
  solution_found:       boolean
  confidence_score:     number
  solution_text:        string
  source:               'kb' | 'db' | 'combination' | 'none'
  kb_category_used?:    string
  new_problem_detected: boolean
  new_problem_summary?: string
  should_escalate:      boolean
  escalation_reason?:   string
}

export interface SupportGeneratorResult {
  new_solution:     string
  confidence_score: number
  web_sources:      { url: string; title: string; snippet: string }[]
  kb_save_decision: 'auto' | 'queue' | 'skip'
  kb_category:      string
}

export interface SalesIntentResult {
  service_category:      string
  intent_score:          number
  psych_signal:          SalesPsychSignal
  objection_type:        SalesObjectionType
  recommended_technique: SalesTechnique
  next_action:           'continue' | 'close' | 'nurture' | 'refer'
  mood:                  EntityMood
}

export interface SalesConversationResult {
  sales_response:  string
  closing_signal:  boolean
  form_link?:      string
  next_step:       string
  lead_data?: {
    name:     string
    phone?:   string
    email?:   string
    interest: string
  }
}

export interface MasterConversationResult {
  final_response:       string
  channel_format:       'whatsapp' | 'telegram' | 'instagram' | 'email' | 'portal'
  should_add_kb_signal: boolean
}

export interface EntityPipelineContext {
  entityId:    string
  entitySlug:  string
  tenantId:    string
  channelType: string
  identifier:  string
  sessionKey:  string
  message:     string
  language:    string
  history:     { role: 'user' | 'assistant'; content: string }[]
  entityInstructions: string
  entityBrandTone:    string
  crmIdentity?:       Record<string, any>
  currentProblem?:    SupportProblemResult | null
  supportAttempts:    SupportSolutionResult[]
  salesContext?:      SalesIntentResult
  intentResult?:      IntentAnalysisResult
  modelOverrides?:    Record<string, string>
}
