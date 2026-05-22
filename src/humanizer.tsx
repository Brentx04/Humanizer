import { useState, useEffect, useCallback, useMemo, useRef } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

type Rule = [RegExp, string, string];
type RuleGroup = { cat: string; color: string; level: 1 | 2 | 3; rules: Rule[] };
type Change = { cat: string; color: string; original: string; replacement: string; label: string };
type GroupedChanges = Record<string, { color: string; items: Change[] }>;
type HumanizerResult = {
  text: string; highlighted: string; changes: Change[];
  beforeCount: number; afterCount: number; grouped: GroupedChanges; aiScore: number;
};
type Intensity = 1 | 2 | 3;

// ─────────────────────────────────────────────────────────────────────────────
// RULES  level 1 = light · 2 = medium · 3 = aggressive
// ─────────────────────────────────────────────────────────────────────────────

const RULES: RuleGroup[] = [

  { cat: "Formatting", color: "#7f8c8d", level: 1, rules: [
    [/“|”/g, '"', "curly double quotes → straight"],
    [/‘|’/g, "'", "curly single quotes → straight"],
    [/\s*—\s*/g, ", ", "em dash → comma"],
    [/\*\*([^*]+)\*\*/g, "$1", "boldface removed"],
    [/^\s*[🚀💡✅🎯🔑⚡🌟💎🔥👉📌📊🎉]+\s*/gm, "", "emojis removed"],
  ]},

  { cat: "Chatbot artifacts", color: "#e74c3c", level: 1, rules: [
    [/\bGreat question[!.]?\s*/gi, "", "removed 'Great question!'"],
    [/\bCertainly[!,]?\s*/gi, "", "removed 'Certainly!'"],
    [/\bOf course[!,]?\s*/gi, "", "removed 'Of course!'"],
    [/\bAbsolutely[!,]?\s*/gi, "", "removed 'Absolutely!'"],
    [/\bSure thing[!,]?\s*/gi, "", "removed 'Sure thing!'"],
    [/\bHappy to help[.!]?\s*/gi, "", "removed 'Happy to help'"],
    [/\bAs an AI( language model)?,?\s*/gi, "", "removed AI self-reference"],
    [/\bI(?:'m| am) here to help[.!]?\s*/gi, "", "removed chatbot phrase"],
    [/\bI hope this (?:helps|answer|assist)[^.]*\.\s*/gi, "", "removed 'I hope this helps'"],
    [/\bLet me know if you(?:'d like| have| need)[^.]*\.\s*/gi, "", "removed chatbot offer"],
    [/\bFeel free to (?:ask|reach out)[^.]*\.\s*/gi, "", "removed 'Feel free to ask'"],
    [/\bDon't hesitate to[^.]*\.\s*/gi, "", "removed 'Don't hesitate to'"],
    [/\bWould you like me to[^?]*\?\s*/gi, "", "removed chatbot question"],
    [/\bHere is (?:a |an |the )?(?:overview|summary|breakdown|look)[^.]*\.\s*/gi, "", "removed chatbot intro"],
    [/\bAs requested[,.]?\s*/gi, "", "removed 'As requested'"],
    [/\bTo address your (?:question|query|concern)[,.]?\s*/gi, "", "removed chatbot opener"],
  ]},

  { cat: "Knowledge-cutoff disclaimers", color: "#95a5a6", level: 1, rules: [
    [/\bAs of (?:my |the )?(?:last |latest )?(?:training |knowledge )?(?:update|cutoff|data)[^,.]*/gi, "", "removed cutoff disclaimer"],
    [/\bWhile specific details (?:are|remain) (?:limited|scarce|unavailable)[^,.]*, /gi, "", "removed cutoff hedge"],
    [/\bbased on (?:the )?(?:currently )?available information[,.]?\s*/gi, "", "removed info hedge"],
    [/\bat the time of (?:this )?writing[,.]?\s*/gi, "", "removed 'at time of writing'"],
    [/\bup to my (?:last |latest )?(?:training|knowledge)[^,.]*/gi, "", "removed training reference"],
    [/\bmy (?:knowledge|training) (?:has a )?cutoff[^,.]*/gi, "", "removed cutoff reference"],
  ]},

  { cat: "Sycophantic tone", color: "#e67e22", level: 1, rules: [
    [/\bYou(?:'re| are) absolutely right[.!,]?\s*/gi, "", "removed sycophancy"],
    [/\bThat(?:'s| is) (?:a )?(?:great|excellent|wonderful|fantastic|brilliant) (?:point|question|observation)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bExcellent (?:point|question|observation)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bI(?:'m| am) glad you (?:asked|mentioned|brought up) that[.!,]?\s*/gi, "", "removed sycophancy"],
    [/\bThis is (?:a )?(?:great|excellent|wonderful|fantastic|brilliant|pertinent) (?:question|topic)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bWhat a (?:great|wonderful|excellent|fantastic) (?:question|point|idea)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bI appreciate (?:your|this) (?:question|insight|perspective)[.!,]?\s*/gi, "", "removed sycophancy"],
  ]},

  { cat: "Signposting", color: "#27ae60", level: 2, rules: [
    [/\bLet(?:'s| us) dive (?:in|into)[.!]?\s*/gi, "", "removed 'Let's dive in'"],
    [/\bLet(?:'s| us) explore\b[^.]*\.\s*/gi, "", "removed 'Let's explore'"],
    [/\bLet(?:'s| us) break (?:this|it) down[.!]?\s*/gi, "", "removed signpost"],
    [/\bLet(?:'s| us) take a (?:closer |deeper )?look at\b\s*/gi, "", "removed signpost"],
    [/\bHere(?:'s| is) what you need to know[.:!]?\s*/gi, "", "removed signpost"],
    [/\bWithout further ado[,.]?\s*/gi, "", "removed 'Without further ado'"],
    [/\bNow let(?:'s| us) (?:look at|turn to|examine|consider|explore)\b\s*/gi, "", "removed signpost"],
    [/\bI(?:'ll| will) (?:walk|take) you through\b\s*/gi, "", "removed signpost"],
    [/\bLet me (?:walk you through|break down|explain)\b\s*/gi, "", "removed signpost"],
    [/\bIn this (?:article|post|piece|guide|overview), (?:we(?:'ll| will)|I(?:'ll| will)) (?:explore|examine|look at|cover|discuss)\b[^.]*\.\s*/gi, "", "removed meta-intro"],
    [/\bBefore (?:we|I) (?:dive|get) into\b[^,]*,\s*/gi, "", "removed signpost"],
    [/\bWith that (?:said|in mind)[,.]?\s*/gi, "", "removed signpost"],
  ]},

  { cat: "Filler openers & phrases", color: "#2980b9", level: 2, rules: [
    [/\bIn today's (?:rapidly )?(?:evolving |changing |modern |fast[- ]paced |digital )?world[,.]?\s*/gi, "", "removed filler opener"],
    [/\bIn today's (?:rapidly )?(?:evolving |changing |modern |fast[- ]paced |digital )?(?:age|era|climate|society)[,.]?\s*/gi, "", "removed filler opener"],
    [/\bIn the realm of\b\s*/gi, "In ", "simplified 'In the realm of'"],
    [/\bIn the (?:world|domain|sphere|arena) of\b\s*/gi, "In ", "simplified abstract location"],
    [/\bAt its core[,.]?\s*/gi, "", "removed 'At its core'"],
    [/\bIn order to\b/gi, "To", "simplified 'In order to'"],
    [/\bIt is (?:important|crucial|essential|critical) to note that\s*/gi, "", "removed filler"],
    [/\bIt(?:'s| is) worth (?:noting|mentioning|pointing out) that\s*/gi, "", "removed filler"],
    [/\bIt should be noted that\s*/gi, "", "removed filler"],
    [/\bNeedless to say[,.]?\s*/gi, "", "removed 'Needless to say'"],
    [/\bFirst and foremost[,.]?\s*/gi, "First, ", "simplified 'First and foremost'"],
    [/\bLast but not least[,.]?\s*/gi, "Finally, ", "simplified 'Last but not least'"],
    [/\bIn the grand scheme of things[,.]?\s*/gi, "", "removed filler"],
    [/\bAt the end of the day[,.]?\s*/gi, "", "removed cliché"],
    [/\bWhen all is said and done[,.]?\s*/gi, "", "removed filler"],
    [/\bAll things considered[,.]?\s*/gi, "", "removed filler"],
    [/\bAll in all[,.]?\s*/gi, "", "removed filler"],
    [/\bIn conclusion[,.]?\s*/gi, "", "removed 'In conclusion'"],
    [/\bIn summary[,.]?\s*/gi, "", "removed 'In summary'"],
    [/\bTo sum up[,.]?\s*/gi, "", "removed 'To sum up'"],
    [/\bIn a nutshell[,.]?\s*/gi, "", "removed 'In a nutshell'"],
    [/\bTo put it (?:simply|plainly|briefly)[,.]?\s*/gi, "", "removed filler"],
    [/\bSimply put[,.]?\s*/gi, "", "removed 'Simply put'"],
    [/\bThat (?:being|said)[,.]?\s*/gi, "", "removed 'That being said'"],
    [/\bIn other words[,.]?\s*/gi, "", "removed 'In other words'"],
  ]},

  { cat: "Generic endings", color: "#c0392b", level: 2, rules: [
    [/\bThe future (?:looks|seems|appears) bright[.!]?\s*/gi, "", "removed generic ending"],
    [/\bExciting times (?:lie |are )?ahead[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe possibilities are endless[.!]?\s*/gi, "", "removed generic ending"],
    [/\bOnly time will tell[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe sky is the limit[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThis is just the beginning[.!]?\s*/gi, "", "removed generic ending"],
    [/\bWatch this space[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThis represents a (?:major |significant )?step in the right direction[.!]?\s*/gi, "", "removed generic ending"],
    [/\bWe(?:'re| are) (?:just )?(?:scratching the surface|getting started)[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe journey (?:continues|is just beginning)[.!]?\s*/gi, "", "removed generic ending"],
    [/\bThe best is yet to come[.!]?\s*/gi, "", "removed generic ending"],
    [/\bTime will tell[.!]?\s*/gi, "", "removed generic ending"],
  ]},

  { cat: "Persuasive authority", color: "#d35400", level: 2, rules: [
    [/\bThe real question is\b/gi, "The question is", "deflated 'The real question'"],
    [/\bWhat really matters (?:here )?is\b/gi, "What matters is", "deflated 'What really matters'"],
    [/\bAt the heart of (?:this|it|the matter) (?:lies?|is)\b/gi, "The core issue is", "simplified 'At the heart'"],
    [/\bThe (?:deeper|fundamental|underlying) (?:issue|truth|reality|point) (?:here )?is\b/gi, "The issue is", "simplified persuasive frame"],
    [/\bMake no mistake about it[,:]?\s*/gi, "", "removed 'Make no mistake'"],
    [/\bMake no mistake[,:]?\s*/gi, "", "removed 'Make no mistake'"],
    [/\bThe fact of the matter is\b\s*/gi, "", "removed authority phrase"],
    [/\bIn reality[,.]?\s*/gi, "", "removed 'In reality'"],
    [/\bFundamentally[,.]?\s*/gi, "", "removed 'Fundamentally'"],
    [/\bThe truth is[,.]?\s*/gi, "", "removed 'The truth is'"],
    [/\bHere's the thing[,:]?\s*/gi, "", "removed 'Here's the thing'"],
    [/\bLet(?:'s| us) be (?:clear|honest|frank)[,:]?\s*/gi, "", "removed authority opener"],
  ]},

  { cat: "Significance inflation", color: "#8e44ad", level: 2, rules: [
    [/\bserved? as (?:a |an )?(?:pivotal |vital |enduring |lasting )?testament to\b/gi, "shows", "simplified testament"],
    [/\bstood? as (?:a |an )?(?:pivotal |vital |enduring |lasting )?testament to\b/gi, "showed", "simplified testament"],
    [/\bstands? as (?:a |an )?(?:pivotal |vital |enduring |lasting )?testament to\b/gi, "shows", "simplified testament"],
    [/\bmarks? a pivotal moment in\b/gi, "changed", "deflated pivotal moment"],
    [/\bpivotal moment\b/gi, "turning point", "deflated 'pivotal moment'"],
    [/\bin today's rapidly evolving (?:technological |digital |)?landscape\b/gi, "today", "deflated landscape"],
    [/\bevolving landscape of\b/gi, "field of", "simplified landscape"],
    [/\bthe (?:broader |wider )?landscape of\b\s*/gi, "", "removed abstract landscape"],
    [/\bunderscore[sd]? (?:the |its |their )?(?:importance|significance|value|vital role)\b/gi, "shows", "simplified underscores"],
    [/\bhighlight[sd]? (?:the |its |their )?(?:importance|significance)\b/gi, "show", "simplified highlights"],
    [/\bsetting the stage for\b/gi, "before", "simplified stage-setting"],
    [/\bdeeply rooted in\b/gi, "based in", "simplified 'deeply rooted'"],
    [/\bindelible mark\b/gi, "lasting effect", "simplified 'indelible mark'"],
    [/\bfocal point\b/gi, "focus", "simplified 'focal point'"],
    [/\bkey turning point\b/gi, "turning point", "removed redundant 'key'"],
    [/\bpivotal role\b/gi, "role", "removed 'pivotal'"],
    [/\bcrucial role\b/gi, "role", "removed 'crucial'"],
    [/\bvital role\b/gi, "role", "removed 'vital'"],
    [/\bsignificant role\b/gi, "role", "removed 'significant'"],
    [/\bhas left an? (?:lasting |enduring |indelible )?impact on\b/gi, "affected", "simplified impact phrase"],
    [/\breflects? (?:a )?broader\b/gi, "reflects", "removed 'broader'"],
    [/\bsymboliz(?:es?|ing) (?:its |the )?(?:ongoing|enduring|lasting)\b/gi, "shows", "simplified symbolizing"],
    [/\bcontribut(?:es?|ing) to (?:the )?(?:ongoing|broader|wider)\b/gi, "affects", "simplified contributes to"],
    [/\bshaping the (?:future|course|direction) of\b/gi, "affecting", "simplified 'shaping the future'"],
    [/\bhistoric(?:al)? milestone\b/gi, "milestone", "removed 'historic'"],
    [/\blandmark (study|research|paper|work|decision)\b/gi, "influential $1", "simplified 'landmark'"],
    [/\bmonumental\b/gi, "large", "deflated 'monumental'"],
  ]},

  { cat: "Promotional language", color: "#16a085", level: 2, rules: [
    [/\bgroundbreaking\b/gi, "new", "deflated 'groundbreaking'"],
    [/\brevolutionary\b/gi, "new", "deflated 'revolutionary'"],
    [/\btransformative potential\b/gi, "potential", "simplified"],
    [/\btransformative\b/gi, "significant", "deflated 'transformative'"],
    [/\bnestled (?:at the intersection|within|in the heart) of\b/gi, "in", "simplified nestled"],
    [/\bin the heart of\b/gi, "in", "simplified"],
    [/\bseamless(?:ly)?\b/gi, "smooth", "replaced 'seamless'"],
    [/\brobust\b/gi, "strong", "replaced 'robust'"],
    [/\bunlock(?:s|ed|ing)? (?:the )?(?:full )?potential of\b/gi, "get more from", "simplified unlock potential"],
    [/\bgame[- ]changer\b/gi, "significant shift", "deflated 'game-changer'"],
    [/\bgame[- ]changing\b/gi, "significant", "deflated 'game-changing'"],
    [/\bcutting[- ]edge\b/gi, "modern", "replaced cutting-edge"],
    [/\bstate[- ]of[- ]the[- ]art\b/gi, "modern", "replaced state-of-the-art"],
    [/\bbest[- ]in[- ]class\b/gi, "top", "deflated best-in-class"],
    [/\bworld[- ]class\b/gi, "", "removed 'world-class'"],
    [/\bsynerg(?:y|ies|istic|ize[sd]?)\b/gi, "cooperation", "replaced synergy"],
    [/\bparadigm shift\b/gi, "major change", "replaced paradigm shift"],
    [/\bholistic approach\b/gi, "complete approach", "simplified holistic"],
    [/\bholistic\b/gi, "thorough", "replaced 'holistic'"],
    [/\bempowers?\b/gi, "helps", "replaced 'empowers'"],
    [/\bempowered\b/gi, "helped", "replaced 'empowered'"],
    [/\bempowering\b/gi, "helping", "replaced 'empowering'"],
    [/\bempowerment\b/gi, "support", "replaced 'empowerment'"],
    [/\bstreamlines?\b/gi, "simplifies", "replaced 'streamlines'"],
    [/\bstreamlined\b/gi, "simplified", "replaced 'streamlined'"],
    [/\bstreamlining\b/gi, "simplifying", "replaced 'streamlining'"],
    [/\binnovative solution\b/gi, "solution", "removed 'innovative'"],
    [/\binnovative approach\b/gi, "approach", "removed 'innovative'"],
    [/\binnovative\b/gi, "new", "replaced 'innovative'"],
    [/\bdisruptive\b/gi, "new", "replaced 'disruptive'"],
    [/\bbleeding[- ]edge\b/gi, "latest", "replaced bleeding-edge"],
    [/\bforward[- ]thinking\b/gi, "", "removed 'forward-thinking'"],
    [/\bfuture[- ]proof(?:ed|ing)?\b/gi, "durable", "replaced future-proof"],
    [/\bboasts?\b/gi, "has", "replaced 'boasts'"],
    [/\bvibrant\b/gi, "lively", "replaced 'vibrant'"],
    [/\bbreathtaking\b/gi, "", "removed 'breathtaking'"],
    [/\bstunning\b(?! defeat| loss| blow)/gi, "", "removed 'stunning'"],
    [/\brenowned\b/gi, "known", "replaced 'renowned'"],
    [/\bmust[- ]visit\b/gi, "worth visiting", "replaced 'must-visit'"],
    [/\bnext[- ]gen(?:eration)?\b/gi, "new", "replaced 'next-gen'"],
    [/\bbest[- ]in[- ]breed\b/gi, "top", "deflated 'best-in-breed'"],
  ]},

  { cat: "Copula avoidance", color: "#2ecc71", level: 3, rules: [
    [/\bserves as\b/gi, "is", "serves as → is"],
    [/\bserved as\b/gi, "was", "served as → was"],
    [/\bserve as\b/gi, "be", "serve as → be"],
    [/\bserving as\b/gi, "being", "serving as → being"],
    [/\bfunctions as\b/gi, "is", "functions as → is"],
    [/\bfunctioned as\b/gi, "was", "functioned as → was"],
    [/\bstands as\b/gi, "is", "stands as → is"],
    [/\bstood as\b/gi, "was", "stood as → was"],
    [/\bacts as\b/gi, "is", "acts as → is"],
    [/\bacted as\b/gi, "was", "acted as → was"],
    [/\boperates as\b/gi, "is", "operates as → is"],
    [/\brepresents\b(?= (?:a |an |the ))/gi, "is", "represents → is"],
    [/\brepresented\b(?= (?:a |an |the ))/gi, "was", "represented → was"],
    [/\bmarks\b(?= (?:a |an |the ))/gi, "is", "marks → is (copula)"],
    [/\bfeatures\b(?= (?:a |an |the ))/gi, "has", "features → has"],
  ]},

  { cat: "AI vocabulary", color: "#c0392b", level: 2, rules: [
    [/\bdelves? into\b/gi, "looks into", "delve → look into"],
    [/\bdelve\b/gi, "look", "delve → look"],
    [/\bnuanced (?:understanding|approach|perspective|view|analysis)\b/gi, "careful understanding", "deflated nuanced"],
    [/\bnuanced\b/gi, "complex", "replaced 'nuanced'"],
    [/\bmultifaceted\b/gi, "complex", "replaced 'multifaceted'"],
    [/\bcomprehensive overview\b/gi, "overview", "simplified comprehensive overview"],
    [/\bcomprehensive guide\b/gi, "guide", "simplified"],
    [/\bcomprehensive\b/gi, "thorough", "replaced 'comprehensive'"],
    [/\bfacilitates?\b/gi, "helps", "facilitate → help"],
    [/\bfacilitated\b/gi, "helped", "facilitated → helped"],
    [/\butilizes?\b/gi, "uses", "utilize → use"],
    [/\butilized\b/gi, "used", "utilized → used"],
    [/\butilization\b/gi, "use", "utilization → use"],
    [/\bleverages?\b(?! itself| themselves)/gi, "uses", "leverage → use"],
    [/\bleveraged\b/gi, "used", "leveraged → used"],
    [/\boptimizes?\b/gi, "improves", "optimize → improve"],
    [/\boptimized\b/gi, "improved", "optimized → improved"],
    [/\boptimizing\b/gi, "improving", "optimizing → improving"],
    [/\boptimization\b/gi, "improvement", "optimization → improvement"],
    [/\bimpactful\b/gi, "effective", "replaced 'impactful'"],
    [/\bactionable insights?\b/gi, "practical findings", "replaced actionable insights"],
    [/\bactionable (?:steps?|tips?|advice)\b/gi, "practical advice", "replaced actionable"],
    [/\bactionable\b/gi, "practical", "replaced 'actionable'"],
    [/\bscalable\b/gi, "flexible", "replaced 'scalable'"],
    [/\bjourney\b(?= (?:of|toward|to|into|through))/gi, "path", "journey → path"],
    [/\becosystem\b(?! (?:of animals|restoration|conservation|damage|services))/gi, "environment", "ecosystem → environment"],
    [/\bdeep[- ]dive\b/gi, "detailed look", "deep-dive → detailed look"],
    [/\btake[sd]? (?:a )?(?:deep|closer) dive\b/gi, "look carefully", "take a deep dive → look carefully"],
    [/\bmoves? the needle\b/gi, "makes progress", "move the needle → make progress"],
    [/\blow[- ]hanging fruit\b/gi, "easy wins", "low-hanging fruit → easy wins"],
    [/\bpain points?\b/gi, "problems", "pain point → problem"],
    [/\bvalue proposition\b/gi, "value", "value proposition → value"],
    [/\bthought leader(?:ship)?\b/gi, "expertise", "thought leadership → expertise"],
    [/\bunpack(?:s|ed|ing)?\b/gi, "explain", "unpack → explain"],
    [/\bbest practice[sd]?\b/gi, "good approach", "best practice → good approach"],
    [/\bpivotal\b/gi, "key", "pivotal → key"],
    [/\benhances?\b/gi, "improves", "enhance → improve"],
    [/\benhanced\b/gi, "improved", "enhanced → improved"],
    [/\benhancing\b/gi, "improving", "enhancing → improving"],
    [/\bfosters?\b/gi, "builds", "foster → build"],
    [/\bfostered\b/gi, "built", "fostered → built"],
    [/\bfostering\b/gi, "building", "fostering → building"],
    [/\bgarners?\b/gi, "gets", "garner → get"],
    [/\bgarned\b/gi, "got", "garnered → got"],
    [/\bshowcase[sd]?\b/gi, "show", "showcase → show"],
    [/\bshowcasing\b/gi, "showing", "showcasing → showing"],
    [/\btapestry\b/gi, "mix", "tapestry → mix"],
    [/\binterplay\b/gi, "relationship", "interplay → relationship"],
    [/\bintricate\b/gi, "complex", "intricate → complex"],
    [/\bendeavors?\b/gi, "tries", "endeavor → try"],
    [/\bcommences?\b/gi, "starts", "commence → start"],
    [/\bcommenced\b/gi, "started", "commenced → started"],
    [/\bprioritize[sd]?\b/gi, "focus on", "prioritize → focus on"],
    [/\bdemonstrates?\b/gi, "shows", "demonstrate → show"],
    [/\bdemonstrated\b/gi, "showed", "demonstrated → showed"],
    [/\bspearhead(?:s|ed|ing)?\b/gi, "lead", "spearhead → lead"],
    [/\bcatalyze[sd]?\b/gi, "drive", "catalyze → drive"],
    [/\bchampion(?:s|ed|ing)?\b/gi, "support", "champion → support"],
    [/\bsynthesize[sd]?\b/gi, "combine", "synthesize → combine"],
  ]},

  { cat: "Excessive hedging", color: "#7f8c8d", level: 3, rules: [
    [/\bit could (?:potentially |possibly )?be argued that\s*/gi, "", "removed hedge"],
    [/\bone could (?:potentially |possibly )?argue that\s*/gi, "", "removed hedge"],
    [/\bmight (?:potentially |possibly )?have some\b/gi, "may have", "simplified hedge"],
    [/\bit (?:can|may|could) (?:be said|be argued) that\s*/gi, "", "removed hedge"],
    [/\bpotentially\b/gi, "possibly", "potentially → possibly"],
    [/\bin (?:some|certain|many) (?:cases|instances|situations)[,.]?\s*/gi, "sometimes", "simplified hedge"],
    [/\bunder (?:certain|some) circumstances\b/gi, "sometimes", "simplified"],
    [/\bto (?:a certain|some) extent\b/gi, "somewhat", "simplified hedge"],
    [/\bit (?:is|seems|appears) (?:clear|evident|obvious) that\s*/gi, "", "removed false clarity"],
    [/\bit (?:is|was) (?:generally )?(?:believed|thought|considered) that\s*/gi, "", "removed weasel intro"],
    [/\bsome might (?:argue|say|suggest) that\s*/gi, "", "removed vague hedge"],
    [/\bit (?:is|may be|could be) (?:worth|helpful) (?:noting|mentioning) that\s*/gi, "", "removed hedge"],
  ]},

  { cat: "Vague attributions", color: "#1abc9c", level: 3, rules: [
    [/\bexperts? (?:say|argue|believe|suggest|claim|note|warn)\b/gi, "researchers say", "vague expert → researchers"],
    [/\bindustry (?:observers?|analysts?|experts?) (?:note|say|suggest|argue)\b/gi, "analysts say", "vague attribution simplified"],
    [/\bsome (?:critics?|experts?|observers?) (?:argue|say|suggest|claim)\b/gi, "some argue", "simplified vague attribution"],
    [/\bwidely (?:regarded|considered|seen) as\b/gi, "considered", "simplified widely regarded"],
    [/\bcommonly (?:known|regarded|considered) as\b/gi, "known as", "simplified"],
    [/\bmany (?:believe|think|argue|feel) that\s*/gi, "", "removed vague many"],
    [/\bsome (?:believe|think|argue|feel) that\s*/gi, "", "removed vague some"],
    [/\bpeople (?:often|generally|tend to) (?:believe|think|feel)\s*/gi, "", "removed vague people"],
    [/\bit is (?:widely|commonly|generally) (?:accepted|known|believed) that\s*/gi, "", "removed vague attribution"],
  ]},

  { cat: "Negative parallelism", color: "#d35400", level: 3, rules: [
    [/\bIt(?:'s| is) not just ([^;.]+); it(?:'s| is) ([^.]+)\./gi, "It's $2.", "collapsed not-just parallelism"],
    [/\bNot (?:just |only )([^,]+), but (?:also )?([^.]+)\./gi, "$2.", "collapsed not-only parallelism"],
    [/\bMore than just ([^,]+), (?:it(?:'s| is)|this is) ([^.]+)\./gi, "It's $2.", "collapsed more-than parallelism"],
    [/\bIt(?:'s| is) not (?:merely|simply|just) ([^;,.]+)[;,] it(?:'s| is) ([^.]+)\./gi, "It's $2.", "collapsed not-merely parallelism"],
  ]},

  { cat: "Wordy phrases", color: "#2c3e50", level: 2, rules: [
    [/\bdue to the fact that\b/gi, "because", "simplified wordy phrase"],
    [/\bin (?:light|view) of the fact that\b/gi, "because", "simplified"],
    [/\bfor the purpose of\b/gi, "to", "simplified"],
    [/\bwith (?:regard|respect) to\b/gi, "about", "simplified"],
    [/\bon the basis of\b/gi, "based on", "simplified"],
    [/\bprior to\b/gi, "before", "prior to → before"],
    [/\bsubsequent to\b/gi, "after", "subsequent to → after"],
    [/\bin (?:the )?(?:event|case) (?:that|of)\b/gi, "if", "simplified"],
    [/\ba (?:large|great|significant|substantial) number of\b/gi, "many", "simplified quantity phrase"],
    [/\ba (?:large|great|significant|substantial) amount of\b/gi, "much", "simplified"],
    [/\bthe (?:vast|overwhelming) majority of\b/gi, "most", "simplified majority phrase"],
    [/\bon a (?:daily|regular|consistent) basis\b/gi, "regularly", "simplified"],
    [/\bat this (?:point|moment|juncture) in time\b/gi, "now", "simplified"],
    [/\bin the (?:near|not-too-distant) future\b/gi, "soon", "simplified"],
    [/\bmake[sd]? a decision\b/gi, "decide", "simplified"],
    [/\btake[sd]? (?:into )?(?:account|consideration)\b/gi, "consider", "simplified"],
    [/\bhas the ability to\b/gi, "can", "simplified"],
    [/\bhas the capacity to\b/gi, "can", "simplified"],
    [/\bis able to\b/gi, "can", "is able to → can"],
    [/\bin an effort to\b/gi, "to", "simplified"],
    [/\bfor the (?:simple )?reason that\b/gi, "because", "simplified"],
    [/\bwith a view to\b/gi, "to", "simplified"],
    [/\bso as to\b/gi, "to", "simplified"],
    [/\ba total of\b/gi, "", "removed 'a total of'"],
    [/\bthe fact that\b/gi, "that", "simplified 'the fact that'"],
    [/\bby means of\b/gi, "using", "simplified"],
    [/\bmake use of\b/gi, "use", "simplified"],
    [/\bin the process of\b/gi, "currently", "simplified"],
    [/\bfrom the perspective of\b/gi, "for", "simplified"],
    [/\bin terms of\b/gi, "for", "simplified 'in terms of'"],
    [/\bwith the (?:aim|goal|objective|intention) of\b/gi, "to", "simplified"],
    [/\bin (?:a|an) (?:similar|analogous) (?:way|manner|fashion)\b/gi, "similarly", "simplified"],
  ]},

  { cat: "Passive voice", color: "#16a085", level: 3, rules: [
    [/\bit is (?:widely )?(?:known|understood|accepted|recognized) that\s*/gi, "", "removed passive opener"],
    [/\bit has been (?:widely )?(?:shown|noted|observed|demonstrated) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:has been|was) (?:widely )?(?:reported|noted|observed) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:has been|was) (?:found|established|determined) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:is|was) (?:expected|anticipated|predicted) that\s*/gi, "", "removed passive opener"],
  ]},

  { cat: "Hyphenated word pairs", color: "#8e44ad", level: 3, rules: [
    [/\bcross[- ]functional\b/gi, "cross functional", "unhyphenated"],
    [/\bclient[- ]facing\b/gi, "client facing", "unhyphenated"],
    [/\bdata[- ]driven\b/gi, "data driven", "unhyphenated"],
    [/\bdecision[- ]making\b/gi, "decision making", "unhyphenated"],
    [/\bwell[- ]known\b/gi, "known", "simplified well-known"],
    [/\bhigh[- ]quality\b/gi, "quality", "simplified high-quality"],
    [/\bend[- ]to[- ]end\b/gi, "complete", "simplified end-to-end"],
    [/\blong[- ]term\b/gi, "long term", "unhyphenated"],
    [/\bshort[- ]term\b/gi, "short term", "unhyphenated"],
    [/\breal[- ]time\b/gi, "real time", "unhyphenated"],
    [/\bopen[- ]ended\b/gi, "open ended", "unhyphenated"],
    [/\bhigh[- ]level\b/gi, "high level", "unhyphenated"],
    [/\blow[- ]level\b/gi, "low level", "unhyphenated"],
  ]},

  { cat: "Academic formality", color: "#3498db", level: 2, rules: [
    [/\bFurthermore[,.]?\s*/gi, "Also, ", "Furthermore → Also"],
    [/\bMoreover[,.]?\s*/gi, "Also, ", "Moreover → Also"],
    [/\bNotwithstanding\b/gi, "Despite", "Notwithstanding → Despite"],
    [/\bNevertheless[,.]?\s*/gi, "Still, ", "Nevertheless → Still"],
    [/\bThus[,.]?\s*/gi, "So, ", "Thus → So"],
    [/\bHence[,.]?\s*/gi, "So, ", "Hence → So"],
    [/\bErgo[,.]?\s*/gi, "So, ", "Ergo → So"],
    [/\bi\.e\.,?\s*/gi, "that is, ", "i.e. → that is"],
    [/\be\.g\.,?\s*/gi, "for example, ", "e.g. → for example"],
    [/\binter alia\b/gi, "among others", "inter alia → among others"],
    [/\bper se\b/gi, "in itself", "per se → in itself"],
    [/\bde facto\b/gi, "in practice", "de facto → in practice"],
    [/\bmethodology\b/gi, "method", "methodology → method"],
    [/\bconceptualize[sd]?\b/gi, "think of", "conceptualize → think of"],
    [/\bcontextualize[sd]?\b/gi, "frame", "contextualize → frame"],
    [/\boperationalize[sd]?\b/gi, "apply", "operationalize → apply"],
    [/\btheorize[sd]?\b/gi, "suggest", "theorize → suggest"],
    [/\bhypothesize[sd]?\b/gi, "suggest", "hypothesize → suggest"],
    [/\bpredicated on\b/gi, "based on", "predicated on → based on"],
    [/\bpremised on\b/gi, "based on", "premised on → based on"],
    [/\bthe aforementioned\b/gi, "the above", "aforementioned → the above"],
    [/\binsofar as\b/gi, "as far as", "insofar as → as far as"],
    [/\binasmuch as\b/gi, "because", "inasmuch as → because"],
    [/\bwhereupon\b/gi, "after which", "whereupon → after which"],
  ]},

];

// ─────────────────────────────────────────────────────────────────────────────
// ENGINE
// ─────────────────────────────────────────────────────────────────────────────

function applyRules(text: string, intensity: Intensity, enabled: Set<string>): { text: string; changes: Change[] } {
  let result = text;
  const changes: Change[] = [];
  for (const group of RULES) {
    if (group.level > intensity || !enabled.has(group.cat)) continue;
    for (const [pattern, replacement, label] of group.rules) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      result = result.replace(regex, (matched: string, ...args: unknown[]) => {
        let rep = replacement;
        rep = rep.replace(/\$(\d+)/g, (_: string, n: string) => String(args[parseInt(n) - 1] ?? ""));
        if (matched.trim() !== rep.trim())
          changes.push({ cat: group.cat, color: group.color, original: matched.trim(), replacement: rep.trim(), label });
        return rep;
      });
    }
  }
  result = result
    .replace(/[ \t]{2,}/g, " ").replace(/ ([,.:;!?])/g, "$1")
    .replace(/([,.:;!?]){2,}/g, "$1").replace(/^[ \t]+/gm, "")
    .replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "");
  return { text: result, changes };
}

function applyRulesHighlighted(text: string, intensity: Intensity, enabled: Set<string>): string {
  let result = text;
  for (const group of RULES) {
    if (group.level > intensity || !enabled.has(group.cat)) continue;
    for (const [pattern, replacement] of group.rules) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      result = result.replace(regex, (matched: string, ...args: unknown[]) => {
        let rep = replacement;
        rep = rep.replace(/\$(\d+)/g, (_: string, n: string) => String(args[parseInt(n) - 1] ?? ""));
        if (rep.trim() === "") return "";
        if (matched.trim().toLowerCase() === rep.trim().toLowerCase()) return rep;
        return `⟦${rep}⟧`;
      });
    }
  }
  return result.replace(/[ \t]{2,}/g, " ").replace(/ ([,.:;!?])/g, "$1").trim();
}

function countPatterns(text: string, intensity: Intensity, enabled: Set<string>): number {
  let n = 0;
  for (const group of RULES) {
    if (group.level > intensity || !enabled.has(group.cat)) continue;
    for (const [pattern] of group.rules) {
      const m = text.match(pattern);
      if (m) n += m.length;
    }
  }
  return n;
}

function groupChanges(changes: Change[]): GroupedChanges {
  const map: GroupedChanges = {};
  for (const c of changes) {
    if (!map[c.cat]) map[c.cat] = { color: c.color, items: [] };
    map[c.cat].items.push(c);
  }
  return map;
}

function calcAiScore(patterns: number, words: number): number {
  if (words === 0) return 0;
  return Math.round(Math.min(100, (patterns / words) * 220));
}

function scoreInfo(s: number): { color: string; label: string } {
  if (s < 20) return { color: "#27ae60", label: "Human" };
  if (s < 45) return { color: "#2ecc71", label: "Mostly Human" };
  if (s < 65) return { color: "#e67e22", label: "Mixed" };
  if (s < 82) return { color: "#e74c3c", label: "AI-Heavy" };
  return { color: "#c0392b", label: "Heavily AI" };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

function AnimatedNumber({ value, duration = 650 }: { value: number; duration?: number }) {
  const [disp, setDisp] = useState(0);
  const raf = useRef<number>(0);
  useEffect(() => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setDisp(Math.round(ease * value));
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <>{disp}</>;
}

function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/);
  return <>{parts.map((p: string, i: number) =>
    p.startsWith("⟦") ? (
      <span key={i} style={{ background: "#1a3a1a", color: "#7ecb7e", borderRadius: "2px", padding: "0 2px" }}>
        {p.slice(1, -1)}
      </span>
    ) : p
  )}</>;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "final", label: "Final" },
  { id: "changes", label: "Changes" },
  { id: "stats", label: "Stats" },
];

const INTENSITY_LABELS: Record<Intensity, string> = { 1: "Light", 2: "Medium", 3: "Aggressive" };

const C = {
  bg: "#0f0e0c", surface: "#191815", border: "#272520",
  text: "#e8e0cc", muted: "#7a7060", dim: "#444038",
  red: "#c0392b", redSurface: "#160c0b", redBorder: "#3d1512",
  mono: "'JetBrains Mono','Fira Code',monospace",
  serif: "'Playfair Display',Georgia,serif",
};

export default function Humanizer() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState<HumanizerResult | null>(null);
  const [tab, setTab] = useState("final");
  const [copied, setCopied] = useState(false);
  const [copiedDiff, setCopiedDiff] = useState(false);
  const [intensity, setIntensity] = useState<Intensity>(2);
  const [enabledCats, setEnabledCats] = useState<Set<string>>(() => new Set(RULES.map(r => r.cat)));
  const [showCats, setShowCats] = useState(false);

  const wc = (t: string) => t.trim() ? t.trim().split(/\s+/).length : 0;

  const liveScore = useMemo(() => {
    if (!input.trim()) return null;
    return calcAiScore(countPatterns(input, intensity, enabledCats), wc(input));
  }, [input, intensity, enabledCats]);

  useEffect(() => {
    const s = document.createElement("style");
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&family=JetBrains+Mono:wght@400;500&display=swap');
      *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
      body{background:#0f0e0c}
      textarea{transition:border-color .2s}
      textarea:focus{outline:none;border-color:#c0392b!important}
      textarea::placeholder{color:#3a3830}
      .hbtn{transition:background .15s,opacity .15s}
      .hbtn:hover:not(:disabled){background:#a0301f!important}
      .hbtn:active:not(:disabled){transform:scale(.98)}
      .htab{transition:color .15s,border-color .15s}
      .htab:hover{color:#c8bfa8!important}
      .vcopy{transition:background .15s,color .15s,border-color .15s}
      .vcopy:hover{background:#222018!important}
      .int-btn{transition:background .15s,color .15s,border-color .15s}
      .int-btn:hover{border-color:#555!important}
      .cat-check{cursor:pointer;transition:opacity .15s}
      .cat-check:hover{opacity:.8}
      .tab-panel{animation:fadeIn .18s ease}
      .cat-panel{animation:slideDown .18s ease}
      @keyframes fadeIn{from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slideDown{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
      @media(max-width:640px){
        .ba-grid{grid-template-columns:1fr!important}
        .stat-grid{grid-template-columns:1fr 1fr!important}
        .ctrl-row{flex-direction:column!important;align-items:flex-start!important;gap:.75rem!important}
        .cat-grid{grid-template-columns:1fr 1fr!important}
        .tab-bar{flex-wrap:wrap!important}
      }
    `;
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  const run = useCallback(() => {
    if (!input.trim()) return;
    const { text, changes } = applyRules(input, intensity, enabledCats);
    const highlighted = applyRulesHighlighted(input, intensity, enabledCats);
    const beforeCount = countPatterns(input, intensity, enabledCats);
    const afterCount = countPatterns(text, intensity, enabledCats);
    const aiScore = calcAiScore(beforeCount, wc(input));
    setResult({ text, highlighted, changes, beforeCount, afterCount, grouped: groupChanges(changes), aiScore });
    setTab("final");
  }, [input, intensity, enabledCats]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [run]);

  function clear() { setInput(""); setResult(null); }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1800);
    });
  }

  function copyDiff() {
    if (!result) return;
    navigator.clipboard.writeText(result.highlighted).then(() => {
      setCopiedDiff(true); setTimeout(() => setCopiedDiff(false), 1800);
    });
  }

  function toggleCat(cat: string) {
    setEnabledCats(prev => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const enabledCount = enabledCats.size;
  const totalCats = RULES.length;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.mono, padding: "2.5rem 1.5rem 5rem" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{ display: "inline-block", position: "relative" }}>
          <div style={{ position: "absolute", top: "50%", left: "-2rem", right: "-2rem", height: "1px", background: C.border }} />
          <div style={{ fontFamily: C.serif, fontWeight: 700, fontSize: "clamp(2rem,5vw,3.4rem)", letterSpacing: "0.08em", color: C.text, lineHeight: 1, position: "relative", background: C.bg, padding: "0 1rem" }}>
            THE HUMANIZER
          </div>
        </div>
        <div style={{ marginTop: "0.7rem", fontSize: "0.6rem", letterSpacing: "0.3em", textTransform: "uppercase", color: C.red }}>
          No API · No calls · Runs entirely in your browser
        </div>
      </div>

      <div style={{ maxWidth: "960px", margin: "0 auto" }}>

        {/* Live AI score bar */}
        {liveScore !== null && (() => {
          const { color, label } = scoreInfo(liveScore);
          return (
            <div style={{ marginBottom: "1rem", padding: "0.6rem 0.875rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, whiteSpace: "nowrap" }}>AI Signature</span>
              <div style={{ flex: 1, height: "4px", background: C.border, borderRadius: "2px", overflow: "hidden" }}>
                <div style={{ width: `${liveScore}%`, height: "100%", background: color, borderRadius: "2px", transition: "width .4s ease, background .4s ease" }} />
              </div>
              <span style={{ fontSize: "0.65rem", color, fontWeight: 500, minWidth: "2.5rem", textAlign: "right" }}>{liveScore}%</span>
              <span style={{ fontSize: "0.56rem", color: C.muted, letterSpacing: "0.1em" }}>{label}</span>
            </div>
          );
        })()}

        {/* Input */}
        <div style={{ marginBottom: "0.75rem" }}>
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>
            Paste AI-sounding text
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={10}
            placeholder="The platform serves as a pivotal testament to the evolving landscape of collaborative innovation, underscoring its vital role in fostering synergistic outcomes..."
            style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.mono, fontSize: "0.84rem", padding: "0.9rem 1rem", resize: "vertical", lineHeight: 1.8, borderRadius: "2px" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.3rem" }}>
            <span style={{ fontSize: "0.58rem", color: C.dim }}>{wc(input)} words · {input.length} chars</span>
            {input && (
              <button onClick={clear} style={{ background: "none", border: "none", color: C.dim, fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer", padding: "0.2rem 0" }}>
                Clear ×
              </button>
            )}
          </div>
        </div>

        {/* Controls row */}
        <div className="ctrl-row" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", gap: "1rem" }}>
          {/* Intensity */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted }}>Intensity</span>
            <div style={{ display: "flex", gap: "0.25rem" }}>
              {([1, 2, 3] as Intensity[]).map(lvl => (
                <button key={lvl} className="int-btn" onClick={() => setIntensity(lvl)} style={{
                  background: intensity === lvl ? C.red : "none",
                  border: `1px solid ${intensity === lvl ? C.red : C.border}`,
                  color: intensity === lvl ? "#fff" : C.muted,
                  fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.15em",
                  textTransform: "uppercase", padding: "0.3rem 0.65rem",
                  cursor: "pointer", borderRadius: "2px",
                }}>
                  {INTENSITY_LABELS[lvl]}
                </button>
              ))}
            </div>
          </div>

          {/* Categories toggle */}
          <button className="int-btn" onClick={() => setShowCats(v => !v)} style={{
            background: "none", border: `1px solid ${showCats ? C.red : C.border}`,
            color: showCats ? C.text : C.muted, fontFamily: C.mono,
            fontSize: "0.56rem", letterSpacing: "0.15em", textTransform: "uppercase",
            padding: "0.3rem 0.75rem", cursor: "pointer", borderRadius: "2px",
          }}>
            {enabledCount}/{totalCats} categories {showCats ? "▲" : "▼"}
          </button>
        </div>

        {/* Category panel */}
        {showCats && (
          <div className="cat-panel" style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", padding: "1rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted }}>Toggle categories</span>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <button onClick={() => setEnabledCats(new Set(RULES.map(r => r.cat)))} style={{ background: "none", border: "none", color: C.muted, fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer" }}>All</button>
                <span style={{ color: C.dim }}>·</span>
                <button onClick={() => setEnabledCats(new Set())} style={{ background: "none", border: "none", color: C.muted, fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.15em", textTransform: "uppercase", cursor: "pointer" }}>None</button>
              </div>
            </div>
            <div className="cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.4rem 1rem" }}>
              {RULES.map(({ cat, color, level }) => (
                <label key={cat} className="cat-check" style={{ display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
                  <input type="checkbox" checked={enabledCats.has(cat)} onChange={() => toggleCat(cat)}
                    style={{ accentColor: color, width: "11px", height: "11px", cursor: "pointer" }} />
                  <span style={{ fontSize: "0.64rem", color: enabledCats.has(cat) ? color : C.dim }}>{cat}</span>
                  <span style={{ fontSize: "0.5rem", color: C.dim, marginLeft: "auto" }}>L{level}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Humanize button */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "2.5rem", gap: "0.4rem" }}>
          <button className="hbtn" onClick={run} disabled={!input.trim()} style={{
            background: C.red, border: "none", color: "#fff", fontFamily: C.mono,
            fontSize: "0.68rem", letterSpacing: "0.3em", textTransform: "uppercase",
            padding: "0.9rem 2.75rem", cursor: !input.trim() ? "not-allowed" : "pointer",
            opacity: !input.trim() ? 0.3 : 1, borderRadius: "2px",
          }}>
            Humanize →
          </button>
          <span style={{ fontSize: "0.52rem", color: C.dim, letterSpacing: "0.1em" }}>Ctrl + Enter</span>
        </div>

        {/* Results */}
        {result && (
          <div>
            <div style={{ height: "1px", background: C.border, marginBottom: "2rem" }} />

            {/* Tabs + copy buttons */}
            <div className="tab-bar" style={{ display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.border}`, marginBottom: "1.75rem", justifyContent: "space-between" }}>
              <div style={{ display: "flex" }}>
                {TABS.map(({ id, label }) => (
                  <button key={id} className="htab" onClick={() => setTab(id)} style={{
                    background: "none", border: "none",
                    borderBottom: tab === id ? `2px solid ${C.red}` : "2px solid transparent",
                    color: tab === id ? C.text : C.muted, fontFamily: C.mono,
                    fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase",
                    padding: "0.4rem 0.875rem 0.6rem", cursor: "pointer", marginBottom: "-1px",
                  }}>
                    {label}{id === "changes" && result.changes.length > 0 ? ` (${result.changes.length})` : ""}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem" }}>
                <button className="vcopy" onClick={copy} style={{
                  background: "none", border: `1px solid ${copied ? "#27ae60" : C.border}`,
                  color: copied ? "#6aaf6a" : C.muted, fontFamily: C.mono,
                  fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase",
                  padding: "0.3rem 0.65rem", cursor: "pointer", borderRadius: "2px",
                }}>
                  {copied ? "✓ Copied" : "Copy"}
                </button>
                <button className="vcopy" onClick={copyDiff} style={{
                  background: "none", border: `1px solid ${copiedDiff ? "#27ae60" : C.border}`,
                  color: copiedDiff ? "#6aaf6a" : C.muted, fontFamily: C.mono,
                  fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase",
                  padding: "0.3rem 0.65rem", cursor: "pointer", borderRadius: "2px",
                }}>
                  {copiedDiff ? "✓ Copied" : "Copy diff"}
                </button>
              </div>
            </div>

            {/* Final tab */}
            {tab === "final" && (
              <div className="tab-panel ba-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.dim, marginBottom: "0.5rem" }}>Before · <span style={{ color: C.dim }}>{wc(input)} words</span></div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.8, color: "#5a5448", borderRadius: "2px", whiteSpace: "pre-wrap", minHeight: "180px", wordBreak: "break-word" }}>
                    {input}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.red, marginBottom: "0.5rem" }}>After · <span style={{ color: C.muted }}>{wc(result.text)} words</span></div>
                  <div style={{ background: C.redSurface, border: `1px solid ${C.redBorder}`, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.8, color: "#d8c8a8", borderRadius: "2px", whiteSpace: "pre-wrap", minHeight: "180px", wordBreak: "break-word" }}>
                    <HighlightedText text={result.highlighted} />
                  </div>
                </div>
              </div>
            )}

            {/* Changes tab */}
            {tab === "changes" && (
              <div className="tab-panel">
                {result.changes.length === 0 ? (
                  <div style={{ color: C.muted, fontSize: "0.8rem", padding: "2rem", textAlign: "center" }}>No AI patterns detected. Text looks human already.</div>
                ) : (
                  Object.entries(result.grouped).map(([cat, { color, items }]) => (
                    <div key={cat} style={{ marginBottom: "1.5rem" }}>
                      <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color, marginBottom: "0.6rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: color }} />
                        {cat} <span style={{ color: C.dim }}>({items.length})</span>
                      </div>
                      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", overflow: "hidden" }}>
                        {items.map((item: Change, i: number) => (
                          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderBottom: i < items.length - 1 ? `1px solid ${C.border}` : "none", fontSize: "0.75rem" }}>
                            <div style={{ padding: "0.5rem 0.75rem", color: "#5a5040", textDecoration: "line-through", wordBreak: "break-word", borderRight: `1px solid ${C.border}` }}>
                              {item.original || "(removed)"}
                            </div>
                            <div style={{ padding: "0.5rem 0.75rem", color: item.replacement ? "#7ecb7e" : C.dim, wordBreak: "break-word" }}>
                              {item.replacement || <em style={{ color: C.dim }}>deleted</em>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Stats tab */}
            {tab === "stats" && (() => {
              const beforeScore = result.aiScore;
              const afterScore = calcAiScore(result.afterCount, wc(result.text));
              const afterInfo = scoreInfo(afterScore);
              const beforeInfo = scoreInfo(beforeScore);
              return (
                <div className="tab-panel">
                  {/* Stat cards */}
                  <div className="stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                    {[
                      { label: "Patterns removed", val: result.changes.length, color: C.red },
                      { label: "Words", val: `${wc(input)}→${wc(result.text)}`, color: "#7ecb7e", isStr: true },
                      { label: "Categories fixed", val: Object.keys(result.grouped).length, color: "#7aadcb" },
                      { label: "AI score", val: `${beforeScore}→${afterScore}%`, color: afterInfo.color, isStr: true },
                    ].map(({ label, val, color, isStr }) => (
                      <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem", borderRadius: "2px", textAlign: "center" }}>
                        <div style={{ fontSize: "0.52rem", letterSpacing: "0.18em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>{label}</div>
                        <div style={{ fontSize: isStr ? "1rem" : "1.4rem", fontWeight: 500, color }}>
                          {isStr ? val : <AnimatedNumber value={val as number} />}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Score comparison */}
                  <div style={{ marginBottom: "1.75rem", background: C.surface, border: `1px solid ${C.border}`, borderRadius: "2px", padding: "1rem" }}>
                    <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.75rem" }}>AI signature comparison</div>
                    {[
                      { label: "Before", score: beforeScore, info: beforeInfo },
                      { label: "After", score: afterScore, info: afterInfo },
                    ].map(({ label, score, info }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.6rem" }}>
                        <span style={{ fontSize: "0.6rem", color: C.muted, minWidth: "2.5rem" }}>{label}</span>
                        <div style={{ flex: 1, height: "6px", background: C.border, borderRadius: "3px", overflow: "hidden" }}>
                          <div style={{ width: `${score}%`, height: "100%", background: info.color, borderRadius: "3px", transition: "width .6s ease" }} />
                        </div>
                        <span style={{ fontSize: "0.65rem", color: info.color, minWidth: "2.5rem" }}>{score}%</span>
                        <span style={{ fontSize: "0.56rem", color: C.muted, minWidth: "5rem" }}>{info.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Category breakdown */}
                  <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.75rem" }}>
                    Breakdown by category
                  </div>
                  {Object.entries(result.grouped).sort((a, b) => b[1].items.length - a[1].items.length).map(([cat, { color, items }]) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                      <div style={{ flex: 1, fontSize: "0.72rem", color: C.text }}>{cat}</div>
                      <div style={{ width: `${Math.min(items.length / result.changes.length * 200, 140)}px`, height: "4px", background: color, borderRadius: "2px", minWidth: "4px" }} />
                      <div style={{ fontSize: "0.68rem", color, minWidth: "2rem", textAlign: "right" }}>
                        <AnimatedNumber value={items.length} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        <div style={{ marginTop: "4rem", textAlign: "center", fontSize: "0.52rem", letterSpacing: "0.15em", color: C.dim, textTransform: "uppercase" }}>
          Based on Wikipedia's Signs of AI Writing · WikiProject AI Cleanup · 19 rule categories · 200+ patterns
        </div>
      </div>
    </div>
  );
}
