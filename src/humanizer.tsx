import { useState, useEffect } from "react";

type Rule = [RegExp, string, string];
type RuleGroup = { cat: string; color: string; rules: Rule[] };

type Change = { cat: string; color: string; original: string; replacement: string; label: string };
type GroupedChanges = Record<string, { color: string; items: Change[] }>;
type HumanizerResult = {
  text: string; highlighted: string; changes: Change[];
  beforeCount: number; afterCount: number; grouped: GroupedChanges;
};

// ─────────────────────────────────────────────────────────────────────────────
// RULES ENGINE
// Each rule: [regex, replacement, label]
// replacement "" = delete. "§" prefix = highlight marker applied automatically.
// ─────────────────────────────────────────────────────────────────────────────

const RULES: RuleGroup[] = [

  // ── 1. Formatting ──────────────────────────────────────────────────────────
  { cat: "Formatting", color: "#7f8c8d", rules: [
    [/\u201C|\u201D/g, '"', "curly double quotes → straight"],
    [/\u2018|\u2019/g, "'", "curly single quotes → straight"],
    [/\s*—\s*/g, ", ", "em dash → comma"],
    [/\*\*([^*]+)\*\*/g, "$1", "boldface removed"],
    [/^\s*[🚀💡✅🎯🔑⚡🌟💎🔥👉📌📊🎉]+\s*/gm, "", "emojis removed"],
  ]},

  // ── 2. Chatbot artifacts ───────────────────────────────────────────────────
  { cat: "Chatbot artifacts", color: "#e74c3c", rules: [
    [/\bGreat question[!.]?\s*/gi, "", "removed 'Great question!'"],
    [/\bCertainly[!,]?\s*/gi, "", "removed 'Certainly!'"],
    [/\bOf course[!,]?\s*/gi, "", "removed 'Of course!'"],
    [/\bAbsolutely[!,]?\s*/gi, "", "removed 'Absolutely!'"],
    [/\bSure thing[!,]?\s*/gi, "", "removed 'Sure thing!'"],
    [/\bHappy to help[.!]?\s*/gi, "", "removed 'Happy to help'"],
    [/\bAs an AI( language model)?,?\s*/gi, "", "removed AI self-reference"],
    [/\bI hope this (?:helps|answer|assist)[^.]*\.\s*/gi, "", "removed 'I hope this helps'"],
    [/\bLet me know if you(?:'d like| have| need)[^.]*\.\s*/gi, "", "removed chatbot offer"],
    [/\bFeel free to (?:ask|reach out)[^.]*\.\s*/gi, "", "removed 'Feel free to ask'"],
    [/\bDon't hesitate to[^.]*\.\s*/gi, "", "removed 'Don't hesitate to'"],
    [/\bWould you like me to[^?]*\?\s*/gi, "", "removed chatbot question"],
    [/\bHere is (?:a |an |the )?(?:overview|summary|breakdown|look)[^.]*\.\s*/gi, "", "removed chatbot intro"],
  ]},

  // ── 3. Knowledge-cutoff disclaimers ───────────────────────────────────────
  { cat: "Knowledge-cutoff disclaimers", color: "#95a5a6", rules: [
    [/\bAs of (?:my |the )?(?:last |latest )?(?:training |knowledge )?(?:update|cutoff|data)[^,.]*/gi, "", "removed cutoff disclaimer"],
    [/\bWhile specific details (?:are|remain) (?:limited|scarce|unavailable)[^,.]*, /gi, "", "removed cutoff hedge"],
    [/\bbased on (?:the )?(?:currently )?available information[,.]?\s*/gi, "", "removed info hedge"],
    [/\bat the time of (?:this )?writing[,.]?\s*/gi, "", "removed 'at time of writing'"],
    [/\bup to my (?:last |latest )?(?:training|knowledge)[^,.]*/gi, "", "removed training reference"],
  ]},

  // ── 4. Sycophantic tone ───────────────────────────────────────────────────
  { cat: "Sycophantic tone", color: "#e67e22", rules: [
    [/\bYou(?:'re| are) absolutely right[.!,]?\s*/gi, "", "removed sycophancy"],
    [/\bThat(?:'s| is) (?:a )?(?:great|excellent|wonderful|fantastic|brilliant) (?:point|question|observation)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bExcellent (?:point|question|observation)[.!,]?\s*/gi, "", "removed empty praise"],
    [/\bI(?:'m| am) glad you (?:asked|mentioned|brought up) that[.!,]?\s*/gi, "", "removed sycophancy"],
    [/\bThis is (?:a )?(?:great|excellent|wonderful|fantastic|brilliant|pertinent) (?:question|topic)[.!,]?\s*/gi, "", "removed empty praise"],
  ]},

  // ── 5. Signposting ────────────────────────────────────────────────────────
  { cat: "Signposting", color: "#27ae60", rules: [
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
  ]},

  // ── 6. Filler openers ─────────────────────────────────────────────────────
  { cat: "Filler openers & phrases", color: "#2980b9", rules: [
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
    [/\bAt the end of the day[,.]?\s*/gi, "", "removed 'At the end of the day'"],
    [/\bWhen all is said and done[,.]?\s*/gi, "", "removed filler"],
    [/\bAll things considered[,.]?\s*/gi, "", "removed filler"],
    [/\bAll in all[,.]?\s*/gi, "", "removed filler"],
    [/\bIn conclusion[,.]?\s*/gi, "", "removed 'In conclusion'"],
    [/\bIn summary[,.]?\s*/gi, "", "removed 'In summary'"],
    [/\bTo sum up[,.]?\s*/gi, "", "removed 'To sum up'"],
    [/\bIn a nutshell[,.]?\s*/gi, "", "removed 'In a nutshell'"],
  ]},

  // ── 7. Generic positive endings ───────────────────────────────────────────
  { cat: "Generic endings", color: "#c0392b", rules: [
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
  ]},

  // ── 8. Persuasive authority tropes ────────────────────────────────────────
  { cat: "Persuasive authority", color: "#d35400", rules: [
    [/\bThe real question is\b/gi, "The question is", "deflated 'The real question'"],
    [/\bWhat really matters (?:here )?is\b/gi, "What matters is", "deflated 'What really matters'"],
    [/\bAt the heart of (?:this|it|the matter) (?:lies?|is)\b/gi, "The core issue is", "simplified 'At the heart'"],
    [/\bThe (?:deeper|fundamental|underlying) (?:issue|truth|reality|point) (?:here )?is\b/gi, "The issue is", "simplified persuasive frame"],
    [/\bMake no mistake[,:]?\s*/gi, "", "removed 'Make no mistake'"],
    [/\bMake no mistake about it[,:]?\s*/gi, "", "removed 'Make no mistake'"],
    [/\bThe fact of the matter is\b\s*/gi, "", "removed authority phrase"],
    [/\bIn reality[,.]?\s*/gi, "", "removed 'In reality'"],
    [/\bFundamentally[,.]?\s*/gi, "", "removed 'Fundamentally'"],
  ]},

  // ── 9. Significance inflation ─────────────────────────────────────────────
  { cat: "Significance inflation", color: "#8e44ad", rules: [
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
  ]},

  // ── 10. Promotional language ──────────────────────────────────────────────
  { cat: "Promotional language", color: "#16a085", rules: [
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
  ]},

  // ── 11. Copula avoidance ──────────────────────────────────────────────────
  { cat: "Copula avoidance", color: "#2ecc71", rules: [
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

  // ── 12. AI vocabulary ─────────────────────────────────────────────────────
  { cat: "AI vocabulary", color: "#c0392b", rules: [
    [/\bdelves? into\b/gi, "looks into", "delve → look"],
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
    [/\bsynthesize[sd]?\b/gi, "combine", "synthesize → combine"],
    [/\bimpactful\b/gi, "effective", "replaced 'impactful'"],
    [/\bactionable insights?\b/gi, "practical findings", "replaced actionable insights"],
    [/\bactionable (?:steps?|tips?|advice)\b/gi, "practical advice", "replaced actionable"],
    [/\bactionable\b/gi, "practical", "replaced 'actionable'"],
    [/\bscalable\b/gi, "flexible", "replaced 'scalable'"],
    [/\bjourney\b(?= (?:of|toward|to|into|through))/gi, "path", "journey → path"],
    [/\becosystem\b(?! (?:of animals|restoration|conservation|damage|services))/gi, "environment", "ecosystem → environment (non-ecological)"],
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
  ]},

  // ── 13. Excessive hedging ─────────────────────────────────────────────────
  { cat: "Excessive hedging", color: "#7f8c8d", rules: [
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
  ]},

  // ── 14. Vague attributions / weasel words ─────────────────────────────────
  { cat: "Vague attributions", color: "#1abc9c", rules: [
    [/\bexperts? (?:say|argue|believe|suggest|claim|note|warn)\b/gi, "researchers say", "vague expert → researchers"],
    [/\bindustry (?:observers?|analysts?|experts?) (?:note|say|suggest|argue)\b/gi, "analysts say", "vague attribution simplified"],
    [/\bsome (?:critics?|experts?|observers?) (?:argue|say|suggest|claim)\b/gi, "some argue", "simplified vague attribution"],
    [/\bwidely (?:regarded|considered|seen) as\b/gi, "considered", "simplified widely regarded"],
    [/\bcommonly (?:known|regarded|considered) as\b/gi, "known as", "simplified"],
    [/\bmany (?:believe|think|argue|feel) that\s*/gi, "", "removed vague many"],
    [/\bsome (?:believe|think|argue|feel) that\s*/gi, "", "removed vague some"],
    [/\bpeople (?:often|generally|tend to) (?:believe|think|feel)\s*/gi, "", "removed vague people"],
  ]},

  // ── 15. Negative parallelism ──────────────────────────────────────────────
  { cat: "Negative parallelism", color: "#d35400", rules: [
    [/\bIt(?:'s| is) not just ([^;.]+); it(?:'s| is) ([^.]+)\./gi, "It's $2.", "collapsed not-just parallelism"],
    [/\bNot (?:just |only )([^,]+), but (?:also )?([^.]+)\./gi, "$2.", "collapsed not-only parallelism"],
    [/\bMore than just ([^,]+), (?:it(?:'s| is)|this is) ([^.]+)\./gi, "It's $2.", "collapsed more-than parallelism"],
    [/\bIt(?:'s| is) not (?:merely|simply|just) ([^;,.]+)[;,] it(?:'s| is) ([^.]+)\./gi, "It's $2.", "collapsed not-merely parallelism"],
  ]},

  // ── 16. Wordy phrases ────────────────────────────────────────────────────
  { cat: "Wordy phrases", color: "#2c3e50", rules: [
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
  ]},

  // ── 17. Passive voice (common patterns) ───────────────────────────────────
  { cat: "Passive voice", color: "#16a085", rules: [
    [/\bit is (?:widely )?(?:known|understood|accepted|recognized) that\s*/gi, "", "removed passive opener"],
    [/\bit has been (?:widely )?(?:shown|noted|observed|demonstrated) that\s*/gi, "", "removed passive opener"],
    [/\bit (?:has been|was) (?:widely )?(?:reported|noted|observed) that\s*/gi, "", "removed passive opener"],
  ]},

  // ── 18. Hyphenated word pairs ─────────────────────────────────────────────
  { cat: "Hyphenated word pairs", color: "#8e44ad", rules: [
    [/\bcross[- ]functional\b/gi, "cross functional", "unhyphenated"],
    [/\bclient[- ]facing\b/gi, "client facing", "unhyphenated"],
    [/\bdata[- ]driven\b/gi, "data driven", "unhyphenated"],
    [/\bdecision[- ]making\b/gi, "decision making", "unhyphenated"],
    [/\bwell[- ]known\b/gi, "known", "simplified well-known"],
    [/\bhigh[- ]quality\b/gi, "quality", "simplified high-quality"],
    [/\bend[- ]to[- ]end\b/gi, "complete", "simplified end-to-end"],
    [/\blong[- ]term\b/gi, "long term", "unhyphenated"],
    [/\bshort[- ]term\b/gi, "short term", "unhyphenated"],
  ]},

];

// ─────────────────────────────────────────────────────────────────────────────
// APPLY RULES
// ─────────────────────────────────────────────────────────────────────────────

function applyRules(text: string): { text: string; changes: Change[] } {
  let result = text;
  const changes: Change[] = [];

  for (const group of RULES) {
    for (const [pattern, replacement, label] of group.rules) {
      const regex = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
      result = result.replace(regex, (matched: string, ...args: unknown[]) => {
        let rep = replacement;
        // Handle backreferences like $1, $2
        rep = rep.replace(/\$(\d+)/g, (_: string, n: string) => String(args[parseInt(n) - 1] ?? ""));
        if (matched.trim() !== rep.trim()) {
          changes.push({ cat: group.cat, color: group.color, original: matched.trim(), replacement: rep.trim(), label });
        }
        return rep;
      });
    }
  }

  // Cleanup pass
  result = result
    .replace(/[ \t]{2,}/g, " ")          // double spaces
    .replace(/ ([,.:;!?])/g, "$1")        // space before punctuation
    .replace(/([,.:;!?]){2,}/g, "$1")     // doubled punctuation
    .replace(/^[ \t]+/gm, "")            // leading spaces on lines
    .replace(/\n{3,}/g, "\n\n")          // triple blank lines
    .replace(/^\s+|\s+$/g, "");          // trim

  return { text: result, changes };
}

// Highlighted version: wrap non-empty replacements in ⟦...⟧
function applyRulesHighlighted(text: string): string {
  let result = text;
  for (const group of RULES) {
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

// Count how many patterns exist in text
function countPatterns(text: string): number {
  let n = 0;
  for (const group of RULES) {
    for (const [pattern] of group.rules) {
      const matches = text.match(pattern);
      if (matches) n += matches.length;
    }
  }
  return n;
}

// Group changes by category
function groupChanges(changes: Change[]): GroupedChanges {
  const map: GroupedChanges = {};
  for (const c of changes) {
    if (!map[c.cat]) map[c.cat] = { color: c.color, items: [] };
    map[c.cat].items.push(c);
  }
  return map;
}

// Render highlighted string with ⟦⟧ markers
function HighlightedText({ text }: { text: string }) {
  const parts = text.split(/(⟦[^⟧]*⟧)/);
  return parts.map((p: string, i: number) =>
    p.startsWith("⟦") ? (
      <span key={i} style={{ background: "#1a3a1a", color: "#7ecb7e", borderRadius: "2px", padding: "0 2px" }}>
        {p.slice(1, -1)}
      </span>
    ) : p
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "final", label: "Final" },
  { id: "changes", label: "Changes" },
  { id: "stats", label: "Stats" },
];

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
      .vcopy{transition:background .15s}
      .vcopy:hover{background:#2a2924!important}
      ::-webkit-scrollbar{width:3px}
      ::-webkit-scrollbar-thumb{background:#333;border-radius:2px}
    `;
    document.head.appendChild(s);
    return () => { document.head.removeChild(s); };
  }, []);

  function run() {
    if (!input.trim()) return;
    const { text, changes } = applyRules(input);
    const highlighted = applyRulesHighlighted(input);
    const beforeCount = countPatterns(input);
    const afterCount = countPatterns(text);
    setResult({ text, highlighted, changes, beforeCount, afterCount, grouped: groupChanges(changes) });
    setTab("final");
  }

  function copy() {
    if (!result) return;
    navigator.clipboard.writeText(result.text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  const wc = (t: string) => t.trim() ? t.trim().split(/\s+/).length : 0;

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: C.mono, padding: "2.5rem 1.5rem 4rem" }}>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2.75rem" }}>
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

      <div style={{ maxWidth: "780px", margin: "0 auto" }}>

        {/* Input */}
        <div style={{ marginBottom: "1.25rem" }}>
          <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>
            Paste AI-sounding text
          </div>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={9}
            placeholder="The platform serves as a pivotal testament to the evolving landscape of collaborative innovation, underscoring its vital role in fostering synergistic outcomes and ensuring seamless delivery of transformative experiences..."
            style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, fontFamily: C.mono, fontSize: "0.84rem", padding: "0.9rem 1rem", resize: "vertical", lineHeight: 1.8, borderRadius: "2px" }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.3rem" }}>
            <span style={{ fontSize: "0.58rem", color: C.dim }}>{wc(input)} words</span>
            <span style={{ fontSize: "0.58rem", color: C.dim }}>{input.length} chars</span>
          </div>
        </div>

        {/* Button */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "2.5rem" }}>
          <button className="hbtn" onClick={run} disabled={!input.trim()} style={{ background: C.red, border: "none", color: "#fff", fontFamily: C.mono, fontSize: "0.68rem", letterSpacing: "0.3em", textTransform: "uppercase", padding: "0.9rem 2.75rem", cursor: !input.trim() ? "not-allowed" : "pointer", opacity: !input.trim() ? 0.3 : 1, borderRadius: "2px" }}>
            Humanize →
          </button>
        </div>

        {/* Results */}
        {result && (
          <div>
            <div style={{ height: "1px", background: C.border, marginBottom: "2rem" }} />

            {/* Tabs */}
            <div style={{ display: "flex", alignItems: "flex-end", borderBottom: `1px solid ${C.border}`, marginBottom: "1.75rem", justifyContent: "space-between" }}>
              <div style={{ display: "flex" }}>
                {TABS.map(({ id, label }) => (
                  <button key={id} className="htab" onClick={() => setTab(id)} style={{ background: "none", border: "none", borderBottom: tab === id ? `2px solid ${C.red}` : "2px solid transparent", color: tab === id ? C.text : C.muted, fontFamily: C.mono, fontSize: "0.58rem", letterSpacing: "0.18em", textTransform: "uppercase", padding: "0.4rem 0.875rem 0.6rem", cursor: "pointer", marginBottom: "-1px" }}>
                    {label}{id === "changes" && result.changes.length > 0 ? ` (${result.changes.length})` : ""}
                  </button>
                ))}
              </div>
              <button className="vcopy" onClick={copy} style={{ background: "none", border: `1px solid ${C.border}`, color: copied ? "#6aaf6a" : C.muted, fontFamily: C.mono, fontSize: "0.56rem", letterSpacing: "0.18em", textTransform: "uppercase", padding: "0.3rem 0.75rem", cursor: "pointer", borderRadius: "2px", marginBottom: "0.5rem" }}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>

            {/* Final tab: before/after */}
            {tab === "final" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.25rem" }}>
                <div>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.dim, marginBottom: "0.5rem" }}>Before</div>
                  <div style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.8, color: "#5a5448", borderRadius: "2px", whiteSpace: "pre-wrap", minHeight: "160px", wordBreak: "break-word" }}>
                    {input}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.56rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.red, marginBottom: "0.5rem" }}>After · <span style={{ color: C.muted }}>{wc(result.text)} words</span></div>
                  <div style={{ background: C.redSurface, border: `1px solid ${C.redBorder}`, padding: "1rem", fontSize: "0.78rem", lineHeight: 1.8, color: "#d8c8a8", borderRadius: "2px", whiteSpace: "pre-wrap", minHeight: "160px", wordBreak: "break-word" }}>
                    <HighlightedText text={result.highlighted} />
                  </div>
                </div>
              </div>
            )}

            {/* Changes tab */}
            {tab === "changes" && (
              <div>
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
            {tab === "stats" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem", marginBottom: "2rem" }}>
                  {[
                    { label: "Patterns removed", val: result.changes.length, color: C.red },
                    { label: "Word count", val: `${wc(input)} → ${wc(result.text)}`, color: "#7ecb7e" },
                    { label: "Categories fixed", val: Object.keys(result.grouped).length, color: "#7aadcb" },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: C.surface, border: `1px solid ${C.border}`, padding: "1rem", borderRadius: "2px", textAlign: "center" }}>
                      <div style={{ fontSize: "0.55rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.5rem" }}>{label}</div>
                      <div style={{ fontSize: "1.4rem", fontWeight: 500, color }}>{val}</div>
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: "0.58rem", letterSpacing: "0.2em", textTransform: "uppercase", color: C.muted, marginBottom: "0.75rem" }}>
                  Breakdown by category
                </div>
                {Object.entries(result.grouped).sort((a, b) => b[1].items.length - a[1].items.length).map(([cat, { color, items }]) => (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.5rem" }}>
                    <div style={{ flex: 1, fontSize: "0.72rem", color: C.text }}>{cat}</div>
                    <div style={{ width: `${Math.min(items.length / result.changes.length * 200, 120)}px`, height: "4px", background: color, borderRadius: "2px", minWidth: "4px" }} />
                    <div style={{ fontSize: "0.68rem", color, minWidth: "2rem", textAlign: "right" }}>{items.length}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: "4rem", textAlign: "center", fontSize: "0.52rem", letterSpacing: "0.15em", color: C.dim, textTransform: "uppercase" }}>
          Based on Wikipedia's Signs of AI Writing · WikiProject AI Cleanup · 18 rule categories · 150+ patterns
        </div>
      </div>
    </div>
  );
}
