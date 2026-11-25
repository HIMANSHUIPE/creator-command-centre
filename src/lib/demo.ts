// DEMO data. Deterministic (seeded) so numbers don't jump between reloads.
// Every screen that shows this data carries a DEMO label.
import { addDays, format, subDays } from 'date-fns'
import type { BrandCollab, CalendarItem, ContentItem, Dataset, DailyMetric, SocialAccount } from './types'
import { CATEGORIES } from './types'

function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const TITLES: Record<string, string[]> = {
  'Animal facts': ['Why do flamingos stand on one leg?', 'Octopus has 3 hearts!', 'How do owls turn their heads?', 'The fastest animal on Earth', 'Why are zebras striped?', 'Can elephants jump?', 'Baby animals and their names'],
  'Science experiments': ['Magic milk colour explosion', 'Make a lava lamp at home', 'Walking water rainbow', 'Balloon rocket race', 'Invisible ink with lemon', 'Egg in a bottle trick'],
  'Human body': ['Why do we hiccup?', 'How many bones do babies have?', 'Where does food go?', 'Why do we yawn?', 'Your heart beats how many times?'],
  'Space and planets': ['A day on Venus is longer than a year', 'Why is Mars red?', 'How big is the Sun really?', 'Can you cry in space?', 'Saturn could float in water'],
  'Numbers and alphabets': ['Learn counting with fruits', 'ABC with animals', 'Shapes hide-and-seek', 'Skip counting song by 2s'],
  'General knowledge': ['Tallest building in the world', 'Why is the sea salty?', 'Who invented the pencil?', 'Flags of 5 countries'],
  'Water and nature': ['Where does rain come from?', 'How do plants drink water?', 'Why do leaves change colour?', 'Life of a butterfly'],
  'Educational activities': ['Paper plate craft: lion', 'DIY bird feeder', 'Leaf painting activity', 'Sorting game with colours'],
  'Mini rescue scenarios': ['Rescue the toy from the ice!', 'Help the puppy cross the river', 'Save the dinosaurs from slime', 'Bubble rescue mission'],
  'Parenting and learning': ['3 screen-free games for toddlers', 'How to answer endless WHY questions', 'Morning routine chart for kids', 'Reading habit in 5 minutes a day'],
}
// Relative pull of each topic (drives the "what works" story in demo)
const CAT_WEIGHT: Record<string, number> = {
  'Animal facts': 1.7, 'Mini rescue scenarios': 1.9, 'Science experiments': 1.4, 'Space and planets': 1.2,
  'Human body': 1.1, 'General knowledge': 0.8, 'Water and nature': 0.9, 'Educational activities': 0.85,
  'Numbers and alphabets': 0.7, 'Parenting and learning': 0.75,
}

export const DEMO_ACCOUNTS: SocialAccount[] = [
  { id: 'demo-ig-1', platform: 'instagram', external_id: '1', handle: 'littlelearners.fun', display_name: 'Little Learners', avatar_url: null, status: 'active', last_synced_at: new Date().toISOString(), last_error: null },
  { id: 'demo-ig-2', platform: 'instagram', external_id: '2', handle: 'wow.facts.kids', display_name: 'Wow Facts Kids', avatar_url: null, status: 'active', last_synced_at: new Date().toISOString(), last_error: null },
  { id: 'demo-yt-1', platform: 'youtube', external_id: 'UC1', handle: '@LittleLearnersTV', display_name: 'Little Learners TV', avatar_url: null, status: 'active', last_synced_at: new Date().toISOString(), last_error: null },
  { id: 'demo-yt-2', platform: 'youtube', external_id: 'UC2', handle: '@ScienceSprouts', display_name: 'Science Sprouts', avatar_url: null, status: 'active', last_synced_at: new Date().toISOString(), last_error: null },
]

const BASE: Record<string, { followers: number; growth: number; viewsPerDay: number }> = {
  'demo-ig-1': { followers: 18200, growth: 0.0021, viewsPerDay: 9000 },
  'demo-ig-2': { followers: 6400, growth: 0.0032, viewsPerDay: 4200 },
  'demo-yt-1': { followers: 11800, growth: 0.0026, viewsPerDay: 14000 },
  'demo-yt-2': { followers: 3100, growth: 0.0041, viewsPerDay: 5200 },
}

let cache: Dataset | null = null

export function getDemoDataset(): Dataset {
  if (cache) return cache
  const r = rng(42)
  const today = new Date()
  const days = 400
  const daily: DailyMetric[] = []
  const content: ContentItem[] = []

  for (const acc of DEMO_ACCOUNTS) {
    const b = BASE[acc.id]
    let followers = b.followers
    for (let i = days; i >= 0; i--) {
      const d = subDays(today, i)
      const weekday = d.getDay()
      const season = 1 + 0.15 * Math.sin((days - i) / 40)
      const spike = r() < 0.015 ? 3 + r() * 4 : 1 // occasional viral day
      const dip = r() < 0.01 ? 0.4 : 1
      const weekend = weekday === 0 || weekday === 6 ? 1.18 : 1
      const views = Math.round(b.viewsPerDay * season * spike * dip * weekend * (0.75 + r() * 0.5) * (1 + (days - i) / 700))
      const gained = Math.max(0, Math.round(followers * b.growth * season * Math.sqrt(spike) * dip * (0.6 + r() * 0.8)))
      followers += gained - Math.round(gained * 0.12 * r())
      const isIg = acc.platform === 'instagram'
      const likes = Math.round(views * (isIg ? 0.055 : 0.038) * (0.8 + r() * 0.4))
      daily.push({
        account_id: acc.id,
        date: format(d, 'yyyy-MM-dd'),
        followers,
        followers_gained: gained,
        views,
        reach: Math.round(views * (isIg ? 0.72 : 0.9)),
        accounts_engaged: isIg ? Math.round(likes * 0.8) : null,
        profile_visits: isIg ? Math.round(views * 0.012) : null,
        likes,
        comments: Math.round(likes * 0.045),
        shares: Math.round(likes * (isIg ? 0.22 : 0.08)),
        saves: isIg ? Math.round(likes * 0.16) : null,
        watch_time_minutes: isIg ? null : Math.round(views * 0.42),
        avg_view_duration_s: isIg ? null : Math.round(22 + r() * 14),
      })
    }

    // content: IG ~5 reels/week, YT ~4 shorts/week + occasional long video
    const perWeek = acc.platform === 'instagram' ? (acc.id === 'demo-ig-1' ? 5 : 3) : acc.id === 'demo-yt-1' ? 4 : 3
    const count = Math.round((days / 7) * perWeek)
    for (let k = 0; k < count; k++) {
      const ageDays = Math.floor(r() * days)
      const published = subDays(today, ageDays)
      const cat = CATEGORIES[Math.floor(r() * CATEGORIES.length)]
      const titles = TITLES[cat]
      const title = titles[Math.floor(r() * titles.length)]
      const isIg = acc.platform === 'instagram'
      const longVideo = !isIg && r() < 0.08
      const viral = r() < 0.05 ? 6 + r() * 12 : 1
      const maturity = Math.min(1, (ageDays + 1) / 10)
      const views = Math.round(b.viewsPerDay * 0.9 * CAT_WEIGHT[cat] * viral * maturity * (0.3 + r() * 1.3) * (longVideo ? 0.6 : 1))
      const likes = Math.round(views * (isIg ? 0.06 : 0.04) * (0.7 + r() * 0.6))
      const dur = longVideo ? 240 + Math.floor(r() * 400) : 18 + Math.floor(r() * 42)
      content.push({
        id: `${acc.id}-c${k}`,
        account_id: acc.id,
        platform: acc.platform,
        external_id: `${k}`,
        title,
        caption: `${title} #kidslearning #funfacts`,
        format: isIg ? 'reel' : longVideo ? 'video' : 'short',
        category: cat,
        published_at: published.toISOString(),
        permalink: null,
        thumbnail_url: null,
        duration_s: dur,
        views,
        reach: Math.round(views * (isIg ? 0.78 : 0.92)),
        likes,
        comments: Math.round(likes * (0.03 + r() * 0.04)),
        shares: Math.round(likes * (isIg ? 0.15 + r() * 0.3 : 0.05 + r() * 0.08) * (cat === 'Parenting and learning' ? 2.2 : 1)),
        saves: isIg ? Math.round(likes * (0.08 + r() * 0.2) * (cat === 'Educational activities' ? 2 : 1)) : null,
        followers_gained: Math.round(views * (0.002 + r() * 0.004) * CAT_WEIGHT[cat]),
        watch_time_minutes: isIg ? null : Math.round((views * dur * (0.55 + r() * 0.3)) / 60),
        avg_view_duration_s: isIg ? null : Math.round(dur * (0.55 + r() * 0.35)),
        avg_view_percentage: isIg ? null : Math.round(55 + r() * 40),
      })
    }
  }
  content.sort((a, b) => (b.published_at ?? '').localeCompare(a.published_at ?? ''))
  cache = { accounts: DEMO_ACCOUNTS, daily, content }
  return cache
}

export function getDemoCalendar(): CalendarItem[] {
  const t = new Date()
  const mk = (off: number, title: string, platform: 'instagram' | 'youtube', status: CalendarItem['status'], cat: string, priority: 1 | 2 | 3 = 2): CalendarItem => ({
    id: `demo-cal-${off}-${platform}`, title, platform, format: platform === 'instagram' ? 'reel' : 'short', category: cat,
    planned_date: format(addDays(t, off), 'yyyy-MM-dd'), status, priority, hook: null, caption: null, script: null, hashtags: null,
  })
  return [
    mk(-3, 'Octopus has 3 hearts!', 'instagram', 'published', 'Animal facts'),
    mk(-2, 'Rescue the toy from the ice!', 'youtube', 'published', 'Mini rescue scenarios'),
    mk(-1, 'Walking water rainbow', 'instagram', 'published', 'Science experiments'),
    mk(0, 'Why do we hiccup?', 'youtube', 'ready', 'Human body', 1),
    mk(1, 'Save the dinosaurs from slime', 'instagram', 'ready', 'Mini rescue scenarios', 1),
    mk(2, 'Saturn could float in water', 'youtube', 'draft', 'Space and planets'),
    mk(3, 'Why are zebras striped?', 'instagram', 'draft', 'Animal facts', 1),
    mk(4, 'Octopus has 3 hearts! (repurpose)', 'youtube', 'repurpose', 'Animal facts'),
    mk(6, 'DIY bird feeder', 'instagram', 'idea', 'Educational activities', 3),
    mk(8, 'Can you cry in space?', 'youtube', 'idea', 'Space and planets'),
  ]
}

export function getDemoBrands(): BrandCollab[] {
  const t = new Date()
  return [
    { id: 'demo-b1', brand_name: 'BrightBlocks Toys', contact_name: 'Riya Mehta', contact_email: 'riya@example.com', contact_phone: null, collaboration_type: 'Dedicated Reel + 3 Stories', deal_type: 'paid', currency: 'INR', quoted_amount: 35000, final_amount: 30000, deliverables: '1 Reel, 3 Stories, link in bio 7 days', campaign_deadline: format(addDays(t, 9), 'yyyy-MM-dd'), payment_status: 'pending', stage: 'confirmed', performance_notes: null },
    { id: 'demo-b2', brand_name: 'StoryNest Books', contact_name: 'Arjun', contact_email: 'arjun@example.com', contact_phone: null, collaboration_type: 'YouTube Short integration', deal_type: 'barter', currency: 'INR', quoted_amount: null, final_amount: null, deliverables: '1 Short + pinned comment', campaign_deadline: format(addDays(t, 20), 'yyyy-MM-dd'), payment_status: 'not_due', stage: 'negotiating', performance_notes: null },
    { id: 'demo-b3', brand_name: 'TinyScience Kits', contact_name: 'Megha', contact_email: 'megha@example.com', contact_phone: null, collaboration_type: 'Reel + Short bundle', deal_type: 'paid', currency: 'INR', quoted_amount: 50000, final_amount: 45000, deliverables: '1 Reel, 1 Short, usage rights 30 days', campaign_deadline: format(subDays(t, 12), 'yyyy-MM-dd'), payment_status: 'paid', stage: 'completed', performance_notes: '182K combined views, 4.1% engagement' },
  ]
}
