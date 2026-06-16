export type KibiPipelineIntent = 'support' | 'sales' | 'consulting' | 'general'

export type ConsultingTopicCategory =
  | 'growth_strategy' | 'operational_efficiency' | 'competitive_analysis'
  | 'pricing' | 'market_entry' | 'financial_optimization'
  | 'digital_transformation' | 'customer_acquisition' | 'other'

export interface ConsultingIntentResult {
  consulting_topic:      string
  topic_category:        ConsultingTopicCategory
  data_needed:           string[]
  kb_keywords:           string[]
  web_search_needed:     boolean
  entity_profile_needed: boolean
}

export interface ConsultingRecommendationResult {
  advice:              string
  context_summary:     string
  data_sources:        ('kb' | 'web' | 'entity_profile')[]
  confidence_level:    'high' | 'medium' | 'low'
  follow_up_questions?: string[]
}

export interface KibiIntentResult {
  intent:       KibiPipelineIntent
  language:     string
  confidence:   number
  summary:      string
  is_new_topic: boolean
}

export interface KibiPipelineContext {
  tenantId?:    string
  channelType:  string
  identifier:   string
  sessionKey:   string
  message:      string
  language:     string
  history:      { role: 'user' | 'assistant'; content: string }[]
  entityProfile?: {
    industry:          string
    sizeCategory:      string
    region:            string
    connectedModules:  string[]
  }
  intentResult?:    KibiIntentResult
  currentProblem?:  any
  supportAttempts:  any[]
  salesContext?:    any
}
