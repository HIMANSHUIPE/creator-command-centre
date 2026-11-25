export type Platform = 'instagram' | 'youtube'
export type ContentFormat = 'reel' | 'short' | 'video' | 'post' | 'carousel' | 'story' | 'live'
export type CalendarStatus = 'idea' | 'draft' | 'ready' | 'scheduled' | 'published' | 'repurpose'

export interface SocialAccount {
  id: string
  platform: Platform
  external_id: string
  handle: string | null
  display_name: string | null
  avatar_url: string | null
  status: 'active' | 'needs_reauth' | 'error' | 'disconnected'
  last_synced_at: string | null
  last_error: string | null
}

export interface DailyMetric {
  account_id: string
  date: string // yyyy-MM-dd
  followers: number | null
  followers_gained: number | null
  views: number | null
  reach: number | null
  accounts_engaged: number | null
  profile_visits: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  watch_time_minutes: number | null
  avg_view_duration_s: number | null
}

export interface ContentItem {
  id: string
  account_id: string
  platform: Platform
  external_id: string
  title: string | null
  caption: string | null
  format: ContentFormat
  category: string | null
  published_at: string | null
  permalink: string | null
  thumbnail_url: string | null
  duration_s: number | null
  views: number | null
  reach: number | null
  likes: number | null
  comments: number | null
  shares: number | null
  saves: number | null
  followers_gained: number | null
  watch_time_minutes: number | null
  avg_view_duration_s: number | null
  avg_view_percentage: number | null
}

export interface CalendarItem {
  id: string
  workspace_id?: string
  title: string
  platform: Platform
  format: ContentFormat
  category: string | null
  planned_date: string
  status: CalendarStatus
  priority: 1 | 2 | 3
  hook: string | null
  caption: string | null
  script: string | null
  hashtags: string[] | null
}

export interface BrandCollab {
  id: string
  workspace_id?: string
  brand_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  collaboration_type: string | null
  deal_type: 'paid' | 'barter' | 'affiliate' | 'hybrid'
  currency: string
  quoted_amount: number | null
  final_amount: number | null
  deliverables: string | null
  campaign_deadline: string | null
  payment_status: 'not_due' | 'invoiced' | 'pending' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled'
  stage: string
  performance_notes: string | null
}

export interface Dataset {
  accounts: SocialAccount[]
  daily: DailyMetric[]
  content: ContentItem[]
}

export const CATEGORIES = [
  'Animal facts',
  'Science experiments',
  'Human body',
  'Space and planets',
  'Numbers and alphabets',
  'General knowledge',
  'Water and nature',
  'Educational activities',
  'Mini rescue scenarios',
  'Parenting and learning',
] as const
