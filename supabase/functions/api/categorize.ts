// Lightweight keyword tagger for the niche categories. Users can re-tag in the Content Library.
const RULES: [string, RegExp][] = [
  ['Mini rescue scenarios', /\b(rescue|save the|trapped|stuck|help the|mission)\b/i],
  ['Science experiments', /\b(experiment|science|diy lab|reaction|volcano|lava lamp|slime|magnet|density|chemical)\b/i],
  ['Space and planets', /\b(space|planet|mars|moon|sun|saturn|jupiter|venus|galaxy|astronaut|star|rocket|solar)\b/i],
  ['Human body', /\b(body|heart|brain|bones?|blood|teeth|skin|hiccup|yawn|sneeze|stomach|eyes?)\b/i],
  ['Animal facts', /\b(animal|dog|cat|lion|tiger|elephant|shark|octopus|bird|owl|penguin|zebra|giraffe|dinosaur|monkey|fish|frog|snake|whale|insect|bee|butterfl)/i],
  ['Numbers and alphabets', /\b(count|counting|numbers?|alphabet|abc|letters?|phonics|shapes?|colou?rs)\b/i],
  ['Water and nature', /\b(water|rain|river|ocean|sea|nature|plant|tree|leaf|leaves|flower|weather|cloud|rainbow)\b/i],
  ['Educational activities', /\b(craft|activity|activities|game|puzzle|draw|paint|worksheet|sensory|play)\b/i],
  ['Parenting and learning', /\b(parent|toddler|mom|dad|routine|screen time|learning tips|preschool|homeschool)\b/i],
  ['General knowledge', /\b(gk|did you know|facts?|world|country|countries|flag|history|invent)\b/i],
]
export function categorize(text: string | null | undefined): string | null {
  if (!text) return null
  for (const [cat, re] of RULES) if (re.test(text)) return cat
  return null
}
